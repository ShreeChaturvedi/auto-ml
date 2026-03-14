import type { LlmToolDefinition } from '../llm/llmClient.js';

import type { WorkflowGraphState } from './graphState.js';

const META_OUTPUT_TOOLS = new Set(['ask_user', 'plan_exit', 'render_ui']);

export interface WorkflowNodeContract {
  mode: 'text' | 'action';
  allowedTools: LlmToolDefinition[];
  allowAssistantMessage: boolean;
  allowAskUser: boolean;
  allowRenderUi: boolean;
  allowPlanExit: boolean;
  requireToolCall: boolean;
}

function getControllerAllowedToolNames(state: WorkflowGraphState): string[] | null {
  const allowed = state.controllerSummary?.allowedTools;
  if (!Array.isArray(allowed)) {
    return null;
  }

  return allowed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

export function resolveWorkflowNodeContract(state: WorkflowGraphState): WorkflowNodeContract {
  const requestTools = state.request?.tools ?? [];
  const requestToolMap = new Map(requestTools.map((tool) => [tool.name, tool]));

  if (state.turn.phase === 'preprocessing') {
    const allowedToolNames = getControllerAllowedToolNames(state) ?? [];
    const allowedTools = allowedToolNames
      .map((name) => requestToolMap.get(name))
      .filter((tool): tool is LlmToolDefinition => Boolean(tool));
    const allowTextResponse = state.controllerSummary?.allowTextResponse === true;
    const requireToolCall = state.controllerSummary?.requireToolCall === true;

    return {
      mode: allowTextResponse && !requireToolCall ? 'text' : 'action',
      allowedTools,
      allowAssistantMessage: allowTextResponse && !requireToolCall,
      allowAskUser: false,
      allowRenderUi: false,
      allowPlanExit: false,
      requireToolCall
    };
  }

  const allowedTools = requestTools.filter((tool) => !META_OUTPUT_TOOLS.has(tool.name));

  return {
    mode: 'action',
    allowedTools,
    allowAssistantMessage: true,
    allowAskUser: requestToolMap.has('ask_user'),
    allowRenderUi: requestToolMap.has('render_ui'),
    allowPlanExit: requestToolMap.has('plan_exit'),
    requireToolCall: false
  };
}
