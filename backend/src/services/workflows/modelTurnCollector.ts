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

function normalizePlanExitArgs(args: Record<string, unknown> | string | undefined): Record<string, unknown> {
  if (typeof args === 'string') return { planMarkdown: args };
  if (!args || typeof args !== 'object') return {};
  const raw = args as Record<string, unknown>;

  // Resolve planMarkdown from common model variants
  let markdown = raw.planMarkdown;
  if (typeof markdown !== 'string') {
    for (const key of [
      'plan_markdown', 'markdown', 'content', 'plan',
      'text', 'body', 'plan_text', 'plan_content', 'output'
    ] as const) {
      if (typeof raw[key] === 'string') { markdown = raw[key]; break; }
    }
  }

  // Last-resort: use the first string value longer than 50 chars
  if (typeof markdown !== 'string') {
    const firstLongString = Object.values(raw).find(
      (v) => typeof v === 'string' && v.length > 50
    );
    if (typeof firstLongString === 'string') markdown = firstLongString;
  }

  // Truncate if too long rather than failing validation
  if (typeof markdown === 'string' && markdown.length > PLAN_MARKDOWN_MAX) {
    markdown = markdown.slice(0, PLAN_MARKDOWN_MAX);
  }

  return {
    planMarkdown: markdown,
    planName: raw.planName ?? raw.plan_name ?? raw.name
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
        const normalizedArgs = normalizePlanExitArgs(call.args);
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
