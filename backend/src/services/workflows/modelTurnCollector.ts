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

  // Log empty output so we still have observability, but do NOT retry —
  // retrying doubled per-iteration API calls (a 24-iter turn could fire
  // up to 48 LLM calls) and contributed to sustained rate-limit 429s.
  // If empty-output patterns recur the right fix is upstream prompt
  // engineering, not blind re-issue of identical requests.
  if (!hasActionableOutput()) {
    appLogger.warn(
      '[modelTurnCollector] Empty stream output (phase=%s, node=%s) — will surface as MODEL_TOOL_OUTPUT_INVALID.',
      phase,
      state.run.currentNode
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
