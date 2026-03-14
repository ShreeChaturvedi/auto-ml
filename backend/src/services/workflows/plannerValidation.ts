import { randomUUID } from 'node:crypto';

import { ToolCallSchema } from '../../types/llm.js';

import type { WorkflowGraphState } from './graphState.js';
import { extractLatestRunCellContext, extractLatestStepNotebookContext } from './preprocessingPlannerContext.js';

function buildValidationToolCall(args: Record<string, unknown>) {
  return ToolCallSchema.parse({
    id: `wf-call-${randomUUID()}`,
    tool: 'validate_step_result',
    args,
    rationale: 'Validate the latest preprocessing step outcome and determine whether approval is required.'
  });
}

export function planValidationAction(state: WorkflowGraphState): Partial<WorkflowGraphState> {
  const step = extractLatestStepNotebookContext(state);
  if (!step) {
    return {
      nextStep: 'fail',
      errorCode: 'WORKFLOW_VALIDATION_CONTEXT_MISSING',
      errorMessage: 'Validation could not resolve the active preprocessing step.'
    };
  }

  const runCell = extractLatestRunCellContext(state.toolResultHistory);
  const notes = runCell?.stderr?.trim()
    ? `Notebook execution stderr: ${runCell.stderr.trim().slice(0, 500)}`
    : undefined;

  return {
    pendingToolCalls: [
      buildValidationToolCall({
        runId: step.runId,
        stepId: step.stepId,
        requiresApproval: step.requiresApproval ?? true,
        ...(notes ? { notes } : {})
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
