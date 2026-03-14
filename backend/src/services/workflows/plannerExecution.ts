import { randomUUID } from 'node:crypto';

import { ToolCallSchema } from '../../types/llm.js';

import type { WorkflowGraphState } from './graphState.js';
import {
  extractLatestCellId,
  extractLatestRunCellContext,
  extractLatestStepNotebookContext
} from './preprocessingPlannerContext.js';

function buildExecutionToolCall(args: Record<string, unknown>) {
  return ToolCallSchema.parse({
    id: `wf-call-${randomUUID()}`,
    tool: 'execute_transformation_step',
    args,
    rationale: 'Record the latest preprocessing notebook execution outcome.'
  });
}

export function planExecutionRecordingAction(
  state: WorkflowGraphState
): Partial<WorkflowGraphState> {
  const step = extractLatestStepNotebookContext(state);
  const runCell = extractLatestRunCellContext(state.toolResultHistory);
  const cellId = extractLatestCellId(state.toolResultHistory);

  if (!step || !runCell) {
    return {
      nextStep: 'fail',
      errorCode: 'WORKFLOW_EXECUTION_CONTEXT_MISSING',
      errorMessage: 'Execution recording could not resolve the active step or notebook run result.'
    };
  }

  return {
    pendingToolCalls: [
      buildExecutionToolCall({
        runId: step.runId,
        stepId: step.stepId,
        cellId: cellId ?? runCell.cellId,
        succeeded: runCell.status === 'success',
        stdout: runCell.stdout ?? '',
        stderr: runCell.stderr ?? ''
      })
    ],
    latestMessage: '',
    askUserPayload: null,
    planExitPayload: null,
    uiPayload: null,
    nextStep: 'execute_tools',
    errorMessage: null,
    errorCode: null
  };
}
