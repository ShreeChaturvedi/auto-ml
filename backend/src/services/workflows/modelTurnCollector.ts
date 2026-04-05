import { randomUUID } from 'node:crypto';

import type { RunnableConfig } from '@langchain/core/runnables';
import type { z } from 'zod';

import { env } from '../../config.js';
import { appLogger } from '../../logging/logger.js';
import { normalizePlanExitPayload } from '../../routes/llm/planValidation.js';
import { normalizeUiPayload } from '../../routes/llm/uiNormalization.js';
import { AskUserPayloadSchema, PlanExitPayloadSchema, ToolCallSchema } from '../../types/llm.js';
import { UiSchema } from '../../types/llmUi.js';
import type { LlmClient, LlmToolCall } from '../llm/llmClient.js';
import { createLlmClient } from '../llm/llmClient.js';
import { LLM_RENDER_UI_TOOL } from '../llm/toolRegistry.js';

import { resolveWorkflowNodeContract } from './contracts.js';
import type { WorkflowEventSink } from './eventSink.js';
import type { WorkflowGraphState } from './graphState.js';
import type { StageConfig } from './phaseConfig.js';
import { extractConfigurable } from './phases/types.js';
import { planWorkflowAction } from './planner.js';
import type { WorkflowTurnRequest } from './types.js';

function emitEvent(sink: WorkflowEventSink | undefined, event: unknown): void {
  if (sink) {
    sink.emit(event);
  }
}

const PLAN_MARKDOWN_MAX = 50_000;

const PLAN_MARKDOWN_KEYS = [
  'planMarkdown',
  'plan_markdown',
  'markdown',
  'content',
  'text',
  'body',
  'plan_text',
  'plan_content'
] as const;

const PLAN_NAME_KEYS = ['planName', 'plan_name', 'name', 'filename', 'fileName'] as const;

function tryParseLooseJson(rawText: string | undefined): unknown {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return rawText;
  }
}

function extractPlanMarkdownCandidate(value: unknown, depth = 0): string | undefined {
  if (depth > 5 || value == null) {
    return undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractPlanMarkdownCandidate(item, depth + 1);
      if (nested) return nested;
    }
    return undefined;
  }

  if (typeof value !== 'object') {
    return undefined;
  }

  const raw = value as Record<string, unknown>;

  for (const key of PLAN_MARKDOWN_KEYS) {
    const direct = extractPlanMarkdownCandidate(raw[key], depth + 1);
    if (direct) return direct;
  }

  for (const key of ['payload', 'plan', 'data', 'result', 'output'] as const) {
    const nested = extractPlanMarkdownCandidate(raw[key], depth + 1);
    if (nested) return nested;
  }

  let fallbackLongString: string | undefined;
  for (const nestedValue of Object.values(raw)) {
    if (typeof nestedValue === 'string') {
      const trimmed = nestedValue.trim();
      if (!trimmed) {
        continue;
      }
      if (trimmed.startsWith('#') || /^```(?:markdown|md)?/i.test(trimmed)) {
        return trimmed;
      }
      if (!fallbackLongString && trimmed.length > 50) {
        fallbackLongString = trimmed;
      }
      continue;
    }

    const nested = extractPlanMarkdownCandidate(nestedValue, depth + 1);
    if (nested) return nested;
  }

  return fallbackLongString;
}

function extractPlanNameCandidate(value: unknown, depth = 0): string | undefined {
  if (depth > 5 || value == null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  for (const key of PLAN_NAME_KEYS) {
    const candidate = raw[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }

  for (const key of ['payload', 'plan', 'data', 'result', 'output'] as const) {
    const nested = extractPlanNameCandidate(raw[key], depth + 1);
    if (nested) return nested;
  }

  return undefined;
}

function normalizePlanExitArgs(
  args: Record<string, unknown> | string | undefined,
  rawArgsText?: string
): Record<string, unknown> {
  const candidates: unknown[] = [];
  if (typeof args === 'string') {
    candidates.push(args);
  } else if (args && typeof args === 'object') {
    candidates.push(args);
  }

  const parsedRaw = tryParseLooseJson(rawArgsText);
  if (parsedRaw !== undefined) {
    candidates.push(parsedRaw);
  }

  let markdown: string | undefined;
  let planName: string | undefined;

  for (const candidate of candidates) {
    if (!markdown) {
      markdown = extractPlanMarkdownCandidate(candidate);
    }
    if (!planName) {
      planName = extractPlanNameCandidate(candidate);
    }
    if (markdown && planName) {
      break;
    }
  }

  if (typeof markdown === 'string' && markdown.length > PLAN_MARKDOWN_MAX) {
    markdown = markdown.slice(0, PLAN_MARKDOWN_MAX);
  }

  return {
    planMarkdown: markdown,
    planName
  };
}

function parseUiPayload(rawArgs: Record<string, unknown>, phase: WorkflowTurnRequest['phase']) {
  let uiPayload: unknown;
  if (typeof rawArgs.payload === 'string' && rawArgs.payload.trim()) {
    try {
      uiPayload = JSON.parse(rawArgs.payload);
    } catch {
      uiPayload = undefined;
    }
  }
  if (!uiPayload && rawArgs.ui) {
    uiPayload = rawArgs.ui;
  }
  if (!uiPayload && typeof rawArgs === 'object') {
    const candidate = rawArgs as Record<string, unknown>;
    if ('version' in candidate && 'sections' in candidate) {
      uiPayload = candidate;
    }
  }
  const normalizedUi = normalizeUiPayload(uiPayload, phase);
  const parsed = UiSchema.safeParse(normalizedUi);
  return parsed.success ? parsed.data : null;
}

async function streamWorkflowText(
  client: LlmClient,
  state: WorkflowGraphState,
  sink: WorkflowEventSink | undefined
): Promise<Partial<WorkflowGraphState>> {
  const phase = state.turn.phase;

  const pendingToolCalls: z.infer<typeof ToolCallSchema>[] = [];
  let askUserPayload: z.infer<typeof AskUserPayloadSchema> | null = null;
  let planExitPayload: z.infer<typeof PlanExitPayloadSchema> | null = null;
  let uiPayload: z.infer<typeof UiSchema> | null = null;
  let latestMessage = '';
  let errorMessage: string | null = null;

  const hasActionableOutput = () =>
    pendingToolCalls.length > 0
    || Boolean(askUserPayload)
    || Boolean(planExitPayload)
    || Boolean(uiPayload)
    || Boolean(latestMessage.trim())
    || Boolean(errorMessage);

  const streamOnce = async () => {
    await client.stream(state.request!, {
      onToken: (token) => {
        latestMessage += token;
        emitEvent(sink, { type: 'token', text: token });
      },
      onThinking: (text) => {
        emitEvent(sink, { type: 'thinking', text });
      },
      onUsage: (usage) => {
        emitEvent(sink, { type: 'usage', usage });
      },
      onToolCall: (call: LlmToolCall) => {
        if (call.name === 'ask_user') {
          const parsed = AskUserPayloadSchema.safeParse(call.args);
          if (parsed.success) {
            askUserPayload = parsed.data;
          } else {
            errorMessage = 'ask_user payload failed validation.';
          }
          return;
        }

        if (call.name === 'plan_exit') {
          const normalizedArgs = normalizePlanExitArgs(call.args, call.rawArgsText);
          const parsed = PlanExitPayloadSchema.safeParse(normalizedArgs);
          if (parsed.success) {
            planExitPayload = normalizePlanExitPayload(parsed.data);
            if (!planExitPayload) {
              appLogger.warn('[modelTurnCollector] plan_exit markdown extraction failed for input of length %d', parsed.data.planMarkdown.length);
              errorMessage = 'Plan could not be parsed: no top-level heading found. The plan must begin with a "# Project Plan" heading.';
            }
          } else {
            appLogger.warn('[modelTurnCollector] plan_exit Zod validation failed: %o', parsed.error.issues);
            errorMessage = `plan_exit payload failed validation: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
          }
          return;
        }

        if (call.name === LLM_RENDER_UI_TOOL.name) {
          const parsed = parseUiPayload((call.args ?? {}) as Record<string, unknown>, phase);
          if (!parsed) {
            errorMessage = 'render_ui payload failed validation.';
          } else if (!parsed.sections.some((s) => s.items.length > 0)) {
            // Empty UI — don't set uiPayload so the turn falls through to the
            // empty-output guard, which will properly fail with a user-visible message.
            appLogger.warn('[modelTurnCollector] render_ui produced zero items; treating as empty output');
          } else {
            uiPayload = parsed;
          }
          return;
        }

        const normalizedArgs = call.args && typeof call.args === 'object'
          ? { ...(call.args as Record<string, unknown>) }
          : {};
        const rationale = typeof normalizedArgs.rationale === 'string' ? normalizedArgs.rationale : undefined;
        if ('rationale' in normalizedArgs) {
          delete normalizedArgs.rationale;
        }

        const parsed = ToolCallSchema.safeParse({
          id: `wf-call-${randomUUID()}`,
          tool: call.name,
          args: normalizedArgs,
          rationale,
          thoughtSignature: call.thoughtSignature
        });

        if (parsed.success) {
          pendingToolCalls.push(parsed.data);
        } else {
          errorMessage = `Unsupported tool call: ${call.name}`;
        }
      }
    });
  };

  await streamOnce();

  // Bounded retry: reasoning models (especially gpt-5.4 base on xhigh
  // effort) sometimes end the first stream after emitting only reasoning
  // tokens, leaving us with no tool call. A single retry almost always
  // recovers. To prevent the 24-iteration × 2 amplification that caused
  // sustained 429s before, we gate the retry to the FIRST iteration of
  // the turn only — that's when cold-start empty outputs happen, and
  // later iterations almost never hit this case.
  if (!hasActionableOutput() && state.iteration === 0) {
    appLogger.warn(
      '[modelTurnCollector] Empty stream output on first iteration (phase=%s, node=%s) — retrying once.',
      phase,
      state.run.currentNode
    );
    await streamOnce();
  }

  // feature_engineering text-only stall detection.
  //
  // When the LLM emits text tokens but no tool call during a feature
  // engineering turn while selected features are still unregistered, the
  // turn would silently route to 'complete' (because latestMessage.trim()
  // counts as actionable in hasActionableOutput), and the frontend would
  // re-fire the same "Implement the enabled features..." prompt in a loop.
  // The user experiences this as the prompt repeating with no progress.
  //
  // Detect this specifically and retry ONCE with a hardened directive
  // demanding a tool call. If the retry also emits text-only, surface a
  // MODEL_TOOL_OUTPUT_INVALID error so the user sees the stall instead of
  // watching the frontend loop indefinitely.
  const isFeatureEngineeringStall = (): boolean => {
    if (phase !== 'feature_engineering') return false;
    if (pendingToolCalls.length > 0) return false;
    if (askUserPayload || planExitPayload || uiPayload) return false;
    if (!latestMessage.trim()) return false;

    const prompt = state.turn.prompt;
    if (!prompt) return false;
    const match = prompt.match(/^Selected feature IDs to implement:\s*(.+)$/im);
    if (!match) return false;
    const selectedFeatureIds = match[1]
      .split(/\s*,\s*/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (selectedFeatureIds.length === 0) return false;

    const terminalFeatureIds = new Set<string>();
    for (const result of state.toolResultHistory) {
      if (result.tool !== 'register_feature' || result.error) continue;
      if (!result.output || typeof result.output !== 'object' || Array.isArray(result.output)) continue;
      const output = result.output as Record<string, unknown>;
      const status = output.status;
      const featureId = typeof output.featureId === 'string' ? output.featureId : undefined;
      // Count both 'ok' and 'rejected' as terminal states for this purpose —
      // the user has either accepted or explicitly rejected the feature.
      if (featureId && (status === 'ok' || status === 'rejected')) {
        terminalFeatureIds.add(featureId);
      }
    }
    return selectedFeatureIds.some((id) => !terminalFeatureIds.has(id));
  };

  if (isFeatureEngineeringStall()) {
    appLogger.warn(
      '[modelTurnCollector] feature_engineering text-only stall detected (iteration=%d, toolHistory=%d) — retrying with hardened directive.',
      state.iteration,
      state.toolCallHistory.length
    );
    // Reset the text accumulator so a successful retry's output replaces the
    // stall text (otherwise latestMessage would carry both streams concatenated).
    latestMessage = '';
    // Temporarily swap the request with a hardened version that appends an
    // imperative instruction demanding a tool call. We restore the original
    // request afterward so no side effect leaks into the workflow state.
    const originalRequest = state.request;
    state.request = {
      ...originalRequest!,
      messages: [
        ...originalRequest!.messages,
        {
          role: 'user',
          content: 'CRITICAL: Your previous response emitted text but no tool call. You MUST emit a tool call now. Call the next feature-engineering tool for the next unregistered selected feature. Do NOT output explanatory text. Do NOT ask for clarification.'
        }
      ]
    };
    try {
      await streamOnce();
    } finally {
      state.request = originalRequest;
    }

    if (isFeatureEngineeringStall()) {
      appLogger.warn(
        '[modelTurnCollector] feature_engineering stall persisted after retry (iteration=%d) — failing turn.',
        state.iteration
      );
      errorMessage = 'Feature engineering turn stalled: the model produced text but no tool call while selected features still need implementation. Please click Generate Notebook Steps again.';
    }
  }

  if (!hasActionableOutput()) {
    appLogger.warn(
      '[modelTurnCollector] Empty stream output (phase=%s, node=%s, iteration=%d) — will surface as MODEL_TOOL_OUTPUT_INVALID.',
      phase,
      state.run.currentNode,
      state.iteration
    );
  }

  if (errorMessage) {
    return {
      errorMessage,
      errorCode: 'MODEL_TOOL_OUTPUT_INVALID',
      nextStep: 'fail'
    };
  }

  let nextStep: WorkflowGraphState['nextStep'] = 'complete';
  if (pendingToolCalls.length > 0) {
    nextStep = 'execute_tools';
  } else if (askUserPayload || planExitPayload) {
    nextStep = 'pause';
  } else if (!latestMessage.trim() && !uiPayload) {
    nextStep = 'fail';
    errorMessage = 'Model returned no actionable workflow output.';
    appLogger.warn(
      '[modelTurnCollector] Empty output — phase=%s, node=%s, iteration=%d, toolHistory=%d',
      phase,
      state.run.currentNode,
      state.iteration,
      state.toolCallHistory.length
    );
  }

  return {
    latestMessage,
    pendingToolCalls,
    askUserPayload,
    planExitPayload,
    uiPayload,
    nextStep,
    errorMessage,
    errorCode: errorMessage ? 'MODEL_TOOL_OUTPUT_INVALID' : null
  };
}

function resolveCurrentStageConfig(state: WorkflowGraphState, config?: RunnableConfig): StageConfig | undefined {
  const { phaseConfig } = extractConfigurable(config);
  if (!phaseConfig) return undefined;

  const currentStage = state.controllerSummary?.currentNode
    ?? state.run.currentNode;
  if (typeof currentStage !== 'string') return undefined;

  return phaseConfig.getStageConfig(currentStage);
}

export async function invokeModelNode(
  state: WorkflowGraphState,
  config?: RunnableConfig
): Promise<Partial<WorkflowGraphState>> {
  if (!state.request) {
    return {
      nextStep: 'fail',
      errorMessage: 'Workflow model request was not prepared.',
      errorCode: 'REQUEST_NOT_PREPARED'
    };
  }

  const { sink } = extractConfigurable(config);
  const contract = resolveWorkflowNodeContract(state);
  const modelOverride = state.turn.model && state.turn.model !== 'auto' ? state.turn.model : undefined;
  const client = createLlmClient(
    modelOverride,
    state.turn.reasoningEffort ? env.preprocessingThinkingLlmTimeoutMs : undefined
  );

  // PhaseConfig deterministic/delegated modes bypass the generic planner
  const stageConfig = resolveCurrentStageConfig(state, config);

  if (stageConfig?.mode === 'deterministic' && stageConfig.deterministicAction) {
    const toolCalls = await stageConfig.deterministicAction(state);
    if (toolCalls.length) {
      return {
        pendingToolCalls: toolCalls,
        latestMessage: '',
        askUserPayload: null,
        planExitPayload: null,
        uiPayload: null,
        nextStep: 'execute_tools',
        errorMessage: null,
        errorCode: null
      };
    }
    return {
      nextStep: 'fail',
      errorMessage: `Deterministic action for stage "${stageConfig.name}" produced no tool calls.`,
      errorCode: 'DETERMINISTIC_ACTION_EMPTY'
    };
  }

  if (stageConfig?.mode === 'llm_delegated' && stageConfig.delegatedAction) {
    const toolCalls = await stageConfig.delegatedAction(client, state);
    if (toolCalls.length) {
      return {
        pendingToolCalls: toolCalls,
        latestMessage: '',
        askUserPayload: null,
        planExitPayload: null,
        uiPayload: null,
        nextStep: 'execute_tools',
        errorMessage: null,
        errorCode: null
      };
    }
    return {
      nextStep: 'fail',
      errorMessage: `Delegated action for stage "${stageConfig.name}" produced no tool calls.`,
      errorCode: 'DELEGATED_ACTION_EMPTY'
    };
  }

  if (contract.mode === 'action') {
    return planWorkflowAction(client, state, contract);
  }

  return streamWorkflowText(client, state, sink);
}
