import type { RunnableConfig } from '@langchain/core/runnables';
import type { z } from 'zod';

import type { ToolResult } from '../../types/llm.js';
import { ToolCallSchema } from '../../types/llm.js';
import { executeMcpTool } from '../mcp/mcpAdapter.js';

import { buildToolEvent } from './eventWriter.js';
import { MAX_SINGLE_TOOL_CALLS, MAX_WORKFLOW_ITERATIONS, type WorkflowGraphState } from './graphState.js';
import type { PhaseConfig } from './phaseConfig.js';
import { extractConfigurable } from './phases/types.js';
import type { WorkflowPendingInputKind } from './types.js';

const MAX_TOOL_RESULT_CHARS = 50_000;

function truncateToolResult(result: ToolResult): ToolResult {
  const json = JSON.stringify(result.output);
  if (json.length <= MAX_TOOL_RESULT_CHARS) return result;
  return {
    ...result,
    output: {
      _truncated: true,
      _originalSize: json.length,
      notice: `Result truncated from ${json.length} to ${MAX_TOOL_RESULT_CHARS} characters.`,
      data: json.slice(0, MAX_TOOL_RESULT_CHARS)
    }
  };
}

function toolResultRequiresPause(result: ToolResult): boolean {
  const output = result.output;
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return false;
  }
  const record = output as Record<string, unknown>;
  const step = record.step && typeof record.step === 'object' && !Array.isArray(record.step)
    ? record.step as Record<string, unknown>
    : null;
  const status = typeof record.status === 'string'
    ? record.status
    : typeof step?.status === 'string'
      ? step.status
      : undefined;
  const reasonCode = typeof record.reasonCode === 'string' ? record.reasonCode : undefined;
  return status === 'awaiting_approval'
    || reasonCode === 'STEP_APPROVAL_REQUIRED'
    || reasonCode === 'STEP_APPROVAL_USER_REQUIRED';
}

function getPauseDetails(results: ToolResult[]): {
  pendingInputKind: WorkflowPendingInputKind;
  pauseReason: string;
} | null {
  if (!results.some(toolResultRequiresPause)) {
    return null;
  }

  return {
    pendingInputKind: 'approval',
    pauseReason: 'awaiting_approval'
  };
}

async function executeWorkflowToolCall(
  state: WorkflowGraphState,
  call: z.infer<typeof ToolCallSchema>,
  phaseConfig: PhaseConfig | undefined
): Promise<ToolResult> {
  const approvalSource = resolveApprovalSource(state, call.tool);
  const enrichedArgs: Record<string, unknown> = {
    ...(call.args ?? {}),
    ...(state.turn.datasetId && call.tool !== 'set_active_dataset' ? { datasetId: state.turn.datasetId } : {}),
    toolCallId: call.id,
    approvalSource
  };

  // Feature engineering lifecycle tools need a draft-scoped run identifier.
  // If the model omits one, bind them to the current workflow run instead of
  // falling back to the latest project-level feature run.
  if (phaseConfig?.phase === 'feature_engineering' && !('runId' in enrichedArgs)) {
    enrichedArgs.runId = state.run.runId;
  }

  // PhaseConfig dispatch for phase-specific tools
  if (phaseConfig?.isPhaseSpecificTool(call.tool)) {
    const phaseResult = await phaseConfig.executePhaseSpecificTool(
      call.tool,
      enrichedArgs,
      {
        projectId: state.turn.projectId,
        toolCallId: call.id,
        run: state.run,
        args: enrichedArgs,
        turn: state.turn
      }
    );
    return {
      id: call.id,
      tool: call.tool,
      output: phaseResult.output,
      error: phaseResult.error
    };
  }

  // MCP fallback for non-phase-specific tools (notebook, data tools)
  const result = await executeMcpTool(state.turn.projectId, call.tool, {
    ...(call.args ?? {}),
    ...(state.turn.notebookId ? { notebookId: state.turn.notebookId } : {})
  });

  return {
    id: call.id,
    tool: call.tool,
    output: result.output,
    error: result.error
  };
}

function resolveApprovalSource(
  state: WorkflowGraphState,
  toolName: string
): 'agent' | 'user' {
  if (toolName !== 'commit_transformation_step') {
    return 'agent';
  }
  return state.run.pendingInputKind === 'approval' || state.controllerSummary?.pendingApproval === true
    ? 'user'
    : 'agent';
}

export async function executeToolsNode(
  state: WorkflowGraphState,
  config?: RunnableConfig
): Promise<Partial<WorkflowGraphState>> {
  const { sink, phaseConfig } = extractConfigurable(config);

  const nextResults: ToolResult[] = [];
  for (const call of state.pendingToolCalls) {
    const rawResult = await executeWorkflowToolCall(state, call, phaseConfig);
    const result = truncateToolResult(rawResult);
    nextResults.push(result);

    const toolEvent = buildToolEvent(
      call,
      {
        id: result.id,
        tool: result.tool,
        output: result.output,
        error: result.error
      },
      {
        ...state.run,
        currentNode: state.run.currentNode
      }
    );

    if (sink) {
      sink.emit(toolEvent);
    }
  }

  // Detect per-tool repetition: if any single tool has been called more than
  // MAX_SINGLE_TOOL_CALLS times in this turn, the model is looping without
  // progressing through the workflow lifecycle.
  const allToolCalls = [...state.toolCallHistory, ...state.pendingToolCalls];
  const toolCallCounts = new Map<string, number>();
  for (const call of allToolCalls) {
    toolCallCounts.set(call.tool, (toolCallCounts.get(call.tool) ?? 0) + 1);
  }
  let repeatedTool: string | undefined;
  for (const [tool, count] of toolCallCounts) {
    if (count > MAX_SINGLE_TOOL_CALLS) {
      repeatedTool = tool;
      break;
    }
  }

  const pauseDetails = getPauseDetails(nextResults);
  const hasExceededIterations = state.iteration + 1 >= MAX_WORKFLOW_ITERATIONS;
  const hasToolRepetition = repeatedTool !== undefined;

  const isFailing = hasExceededIterations || hasToolRepetition;
  const errorMessage = hasToolRepetition
    ? `Training could not progress \u2014 the model called "${repeatedTool}" ${toolCallCounts.get(repeatedTool!)!} times without advancing. Try a simpler prompt or fewer experiments.`
    : hasExceededIterations
      ? 'Workflow exceeded the maximum number of model/tool iterations for one turn.'
      : null;
  const errorCode = hasToolRepetition
    ? 'TOOL_CALL_LIMIT_EXCEEDED'
    : hasExceededIterations
      ? 'MAX_ITERATIONS_EXCEEDED'
      : null;

  return {
    toolCallHistory: state.pendingToolCalls,
    toolResultHistory: nextResults,
    pendingToolCalls: [],
    askUserPayload: null,
    planExitPayload: null,
    uiPayload: null,
    latestMessage: '',
    iteration: state.iteration + 1,
    pendingInputKind: pauseDetails?.pendingInputKind ?? null,
    pauseReason: pauseDetails?.pauseReason ?? null,
    nextStep: pauseDetails
      ? 'pause'
      : isFailing
        ? 'fail'
        : 'prepare',
    errorMessage,
    errorCode
  };
}
