import type { RunnableConfig } from '@langchain/core/runnables';
import type { z } from 'zod';

import type { ToolResult } from '../../types/llm.js';
import { ToolCallSchema } from '../../types/llm.js';
import {
  executePreprocessingTool,
  isPreprocessingToolName,
  syncPreprocessingLangGraphState
} from '../llm/preprocessingGraph.js';
import { executeMcpTool } from '../mcp/mcpAdapter.js';

import type { WorkflowEventSink } from './eventSink.js';
import { buildToolEvent } from './eventWriter.js';
import { MAX_WORKFLOW_ITERATIONS, type WorkflowGraphState } from './graphState.js';
import type { PhaseConfig } from './phaseConfig.js';
import type { WorkflowConfigurable } from './phases/types.js';
import type { WorkflowPendingInputKind } from './types.js';

function extractConfigurable(config?: RunnableConfig): {
  sink: WorkflowEventSink | undefined;
  phaseConfig: PhaseConfig | undefined;
} {
  const configurable = config?.configurable as WorkflowConfigurable | undefined;
  return {
    sink: configurable?.sink,
    phaseConfig: configurable?.phaseConfig
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
  const enrichedArgs = {
    ...(call.args ?? {}),
    ...(state.turn.datasetId && call.tool !== 'set_active_dataset' ? { datasetId: state.turn.datasetId } : {}),
    toolCallId: call.id,
    approvalSource
  };

  // Use PhaseConfig dispatch if available, otherwise fall back to legacy branching
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

  // Legacy fallback: direct preprocessing tool dispatch
  const result = isPreprocessingToolName(call.tool)
    ? await syncPreprocessingLangGraphState(
        state.turn.projectId,
        call.tool,
        enrichedArgs,
        await executePreprocessingTool(state.turn.projectId, call.tool, enrichedArgs)
      )
    : await executeMcpTool(state.turn.projectId, call.tool, {
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
    const result = await executeWorkflowToolCall(state, call, phaseConfig);
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

  const pauseDetails = getPauseDetails(nextResults);
  const hasExceededIterations = state.iteration + 1 >= MAX_WORKFLOW_ITERATIONS;
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
      : hasExceededIterations
        ? 'fail'
        : 'prepare',
    errorMessage: hasExceededIterations
      ? 'Workflow exceeded the maximum number of model/tool iterations for one turn.'
      : null,
    errorCode: hasExceededIterations ? 'MAX_ITERATIONS_EXCEEDED' : null
  };
}
