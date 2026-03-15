import { randomUUID } from 'node:crypto';

import type { RunnableConfig } from '@langchain/core/runnables';
import type { z } from 'zod';

import { env } from '../../config.js';
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
import { extractConfigurable } from './phases/types.js';
import { planWorkflowAction } from './planner.js';
import type { WorkflowTurnRequest } from './types.js';

function emitEvent(sink: WorkflowEventSink | undefined, event: unknown): void {
  if (sink) {
    sink.emit(event);
  }
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
        const parsed = PlanExitPayloadSchema.safeParse(call.args);
        if (parsed.success) {
          planExitPayload = normalizePlanExitPayload(parsed.data);
        } else {
          errorMessage = 'plan_exit payload failed validation.';
        }
        return;
      }

      if (call.name === LLM_RENDER_UI_TOOL.name) {
        uiPayload = parseUiPayload((call.args ?? {}) as Record<string, unknown>, phase);
        if (!uiPayload) {
          errorMessage = 'render_ui payload failed validation.';
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

  if (contract.mode === 'action') {
    return planWorkflowAction(client, state, contract);
  }

  return streamWorkflowText(client, state, sink);
}
