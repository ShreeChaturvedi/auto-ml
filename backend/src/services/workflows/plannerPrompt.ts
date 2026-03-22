import type { LlmMessage, LlmRequest } from '../llm/llmClient.js';

import type { WorkflowNodeContract } from './contracts.js';
import type { WorkflowGraphState } from './graphState.js';

const MAX_MESSAGE_COUNT = 2;
const MAX_MESSAGE_CHARS = 900;
const MAX_TOOL_RESULTS = 3;
const MAX_TOOL_PARAMETER_CHARS = 220;

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars - 1)}…`;
}

function summarizeMessages(messages: LlmMessage[]): string {
  return messages
    .slice(-MAX_MESSAGE_COUNT)
    .map((message, index) => `Message ${index + 1} (${message.role}):\n${truncate(message.content, MAX_MESSAGE_CHARS)}`)
    .join('\n\n');
}

function summarizeTools(contract: WorkflowNodeContract): string {
  if (!contract.allowedTools.length) {
    return '(none)';
  }

  return contract.allowedTools
    .map((tool) => [
      `- ${tool.name}`,
      `  Description: ${tool.description}`,
      `  Parameters: ${truncate(JSON.stringify(tool.parameters), MAX_TOOL_PARAMETER_CHARS)}`
    ].join('\n'))
    .join('\n');
}

function summarizeToolResultPayload(payload: Record<string, unknown>): string {
  const step = payload.step && typeof payload.step === 'object' && !Array.isArray(payload.step)
    ? payload.step as Record<string, unknown>
    : null;
  const status = typeof payload.status === 'string'
    ? payload.status
    : typeof step?.status === 'string'
      ? step.status
      : 'unknown';
  const stepId = typeof payload.stepId === 'string'
    ? payload.stepId
    : typeof step?.stepId === 'string'
      ? step.stepId
      : null;
  const runId = typeof payload.runId === 'string' ? payload.runId : null;
  const reasonCode = typeof payload.reasonCode === 'string' ? payload.reasonCode : null;

  return [
    `status=${status}`,
    stepId ? `stepId=${stepId}` : null,
    runId ? `runId=${runId}` : null,
    reasonCode ? `reasonCode=${reasonCode}` : null
  ].filter((value): value is string => Boolean(value)).join(', ');
}

function summarizeToolResults(state: WorkflowGraphState): string {
  if (!state.toolResultHistory.length) {
    return '(none)';
  }

  return state.toolResultHistory
    .slice(-MAX_TOOL_RESULTS)
    .map((result, index) => {
      if (result.error) {
        return `${index + 1}. ${result.tool}: error=${truncate(result.error, 220)}`;
      }

      const output = result.output && typeof result.output === 'object' && !Array.isArray(result.output)
        ? result.output as Record<string, unknown>
        : null;
      return `${index + 1}. ${result.tool}: ${output ? summarizeToolResultPayload(output) : 'output=available'}`;
    })
    .join('\n');
}

function summarizeWorkflowState(state: WorkflowGraphState): string {
  return [
    `Workflow thread: ${state.run.threadId}`,
    `Current node: ${state.run.currentNode}`,
    state.controllerSummary?.runId ? `Preprocessing run: ${state.controllerSummary.runId}` : null,
    state.controllerSummary?.activeStepId ? `Active step: ${state.controllerSummary.activeStepId}` : null,
    state.run.activeDatasetId ? `Active dataset: ${state.run.activeDatasetId}` : null,
    state.run.activeNotebookId ? `Active notebook: ${state.run.activeNotebookId}` : null
  ].filter((value): value is string => Boolean(value)).join('\n');
}

function resolvePlannerReasoningEffort(): 'minimal' | 'low' {
  return 'low';
}

function summarizeRepairRaw(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.length <= 4_000 ? trimmed : `${trimmed.slice(0, 3_999)}…`;
}

export function buildPlannerRequest(
  state: WorkflowGraphState,
  contract: WorkflowNodeContract
): LlmRequest {
  const allowedOutputs = [
    contract.allowedTools.length > 0 ? 'tool_call' : null,
    !contract.requireToolCall && contract.allowAssistantMessage ? 'assistant_message' : null,
    contract.allowAskUser ? 'ask_user' : null,
    contract.allowRenderUi ? 'render_ui' : null,
    contract.allowPlanExit ? 'plan_exit' : null
  ].filter((value): value is string => Boolean(value));

  return {
    messages: [
      {
        role: 'system',
        content: [
          'You are a strict workflow planner for an agentic ML application.',
          'Return exactly one JSON object and nothing else.',
          `Workflow phase: ${state.turn.phase}`,
          `Current workflow node: ${state.run.currentNode}`,
          contract.requireToolCall
            ? 'This node requires an actual tool call. Do not return assistant_message, ask_user, render_ui, or plan_exit.'
            : contract.allowedTools.length > 0
              ? 'Choose the single next action that best advances the workflow. tool_call is allowed when another tool step is still needed.'
              : 'Choose the single next action that best advances the workflow.',
          contract.allowAssistantMessage
            ? 'Use assistant_message only when the user is asking for explanation, diagnosis, or advice and no tool is needed.'
            : 'Do not return assistant_message.',
          contract.allowAskUser
            ? 'Use ask_user only when blocked by missing information that the backend cannot infer.'
            : 'Do not return ask_user.',
          contract.allowRenderUi
            ? 'Use render_ui when you can present final structured output for this turn without another tool.'
            : 'Do not return render_ui.',
          contract.allowPlanExit
            ? 'Use plan_exit when the right outcome is a markdown plan artifact rather than a tool call.'
            : 'Do not return plan_exit.',
          `Allowed output kinds: ${allowedOutputs.join(', ') || '(none)'}.`,
          'If you choose tool_call, toolName must be one of the allowed tools and toolArgs must be an object.',
          'Keep the JSON compact. If you choose assistant_message, keep the message concise and avoid code fences or long markdown.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `User prompt: ${state.turn.prompt?.trim() || 'Continue the current workflow.'}`,
          '',
          'Workflow state:',
          summarizeWorkflowState(state),
          '',
          'Workflow context:',
          summarizeMessages(state.request?.messages ?? []),
          '',
          'Allowed tools:',
          summarizeTools(contract),
          '',
          'Recent tool results:',
          summarizeToolResults(state)
        ].join('\n')
      }
    ],
    responseMimeType: 'application/json',
    maxOutputTokens: 900,
    reasoningEffort: resolvePlannerReasoningEffort()
  };
}

export function buildPlannerRepairRequest(
  raw: string,
  state: WorkflowGraphState,
  contract: WorkflowNodeContract
): LlmRequest {
  const allowedOutputs = [
    contract.allowedTools.length > 0 ? 'tool_call' : null,
    !contract.requireToolCall && contract.allowAssistantMessage ? 'assistant_message' : null,
    contract.allowAskUser ? 'ask_user' : null,
    contract.allowRenderUi ? 'render_ui' : null,
    contract.allowPlanExit ? 'plan_exit' : null
  ].filter((value): value is string => Boolean(value));

  return {
    messages: [
      {
        role: 'system',
        content: [
          'You repair malformed workflow planner outputs.',
          'Return exactly one valid JSON object and nothing else.',
          `Workflow phase: ${state.turn.phase}`,
          `Current workflow node: ${state.run.currentNode}`,
          `Allowed output kinds: ${allowedOutputs.join(', ') || '(none)'}.`,
          contract.requireToolCall
            ? 'The repaired response must be a tool_call.'
            : 'The repaired response may be any allowed output kind.',
          'Preserve the original intent as closely as possible, but make the JSON valid and schema-compliant.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          'Repair this malformed planner output into valid JSON:',
          summarizeRepairRaw(raw),
          '',
          'Allowed tools:',
          summarizeTools(contract)
        ].join('\n')
      }
    ],
    responseMimeType: 'application/json',
    maxOutputTokens: 700,
    reasoningEffort: 'minimal'
  };
}
