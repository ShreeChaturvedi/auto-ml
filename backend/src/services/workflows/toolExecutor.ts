import type { RunnableConfig } from '@langchain/core/runnables';
import type { z } from 'zod';

import type { ToolResult } from '../../types/llm.js';
import { ToolCallSchema } from '../../types/llm.js';
import { executeMcpTool } from '../mcp/mcpAdapter.js';

import { buildToolEvent } from './eventWriter.js';
import { MAX_IDENTICAL_TOOL_CALLS, MAX_SINGLE_TOOL_CALLS, MAX_WORKFLOW_ITERATIONS, type WorkflowGraphState } from './graphState.js';
import type { PhaseConfig } from './phaseConfig.js';
import { extractConfigurable } from './phases/types.js';
import { getApprovalPauseDetails } from './turnState.js';
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

function getPauseDetails(results: ToolResult[]): {
  pendingInputKind: WorkflowPendingInputKind;
  pauseReason: string;
} | null {
  return getApprovalPauseDetails(results);
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

  // Detect per-tool repetition using two complementary heuristics:
  //
  // 1. **Identical-call detection** (MAX_IDENTICAL_TOOL_CALLS):  If the same
  //    tool is called with the *exact same* serialized arguments N times, the
  //    model is truly stuck — not iterating toward a fix.
  //
  // 2. **Raw-count detection** (MAX_SINGLE_TOOL_CALLS / phase override):
  //    Even with different arguments, a single tool invoked too many times
  //    indicates the workflow is not progressing through its lifecycle.
  //
  // The per-phase override (`phaseConfig.maxSingleToolCalls`) lets phases
  // like preprocessing and feature engineering raise the raw-count ceiling
  // without affecting tighter phases like training.

  // Only count calls from THIS turn — skip calls carried over from previous
  // turns (stored before turnStartToolCallCount) so multi-turn workflows
  // don't accumulate toward the limit.
  const allToolCalls = [
    ...state.toolCallHistory.slice(state.turnStartToolCallCount),
    ...state.pendingToolCalls
  ];

  // Per-tool total counts
  const toolCallCounts = new Map<string, number>();
  // Per-(tool + serialized args) counts for identical-call detection
  const identicalCallCounts = new Map<string, number>();

  for (const call of allToolCalls) {
    toolCallCounts.set(call.tool, (toolCallCounts.get(call.tool) ?? 0) + 1);

    const argsKey = `${call.tool}::${JSON.stringify(call.args ?? {})}`;
    identicalCallCounts.set(argsKey, (identicalCallCounts.get(argsKey) ?? 0) + 1);
  }

  // Check for identical (stuck) loops first — these are always a bug.
  let stuckTool: string | undefined;
  let stuckCount = 0;
  for (const [key, count] of identicalCallCounts) {
    if (count > MAX_IDENTICAL_TOOL_CALLS) {
      stuckTool = key.split('::')[0];
      stuckCount = count;
      break;
    }
  }

  // Check raw-count limit (respecting per-phase override).
  const effectiveLimit = phaseConfig?.maxSingleToolCalls ?? MAX_SINGLE_TOOL_CALLS;
  let repeatedTool: string | undefined;
  if (!stuckTool) {
    for (const [tool, count] of toolCallCounts) {
      if (count > effectiveLimit) {
        repeatedTool = tool;
        break;
      }
    }
  }

  const pauseDetails = getPauseDetails(nextResults);
  const hasExceededIterations = state.iteration + 1 >= MAX_WORKFLOW_ITERATIONS;
  const hasStuckLoop = stuckTool !== undefined;

  // Raw-count repetition is only a warning — the model may legitimately call
  // the same tool many times with different arguments during complex workflows
  // (e.g. multi-feature proposals, iterative code fixes).  Only truly stuck
  // loops (identical args) and the iteration ceiling cause hard failures.
  if (repeatedTool) {
    const logger = await import('../../logging/logger.js');
    logger.appLogger.warn(
      `[toolExecutor] Tool "${repeatedTool}" called ${toolCallCounts.get(repeatedTool)!} times in this turn (soft limit: ${effectiveLimit}) — allowing workflow to continue`
    );
  }

  const isFailing = hasExceededIterations || hasStuckLoop;
  const errorMessage = hasStuckLoop
    ? `Workflow stuck \u2014 the model called "${stuckTool}" ${stuckCount} times with identical arguments. Try rephrasing your request.`
    : hasExceededIterations
      ? 'Workflow exceeded the maximum number of model/tool iterations for one turn.'
      : null;
  const errorCode = hasStuckLoop
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
