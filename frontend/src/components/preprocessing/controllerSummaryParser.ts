import type { PreprocessingControllerSummary } from '@/types/preprocessing';
import type { WorkflowState } from '@/types/workflow';

export function getControllerSummaryFromWorkflowState(
  state: WorkflowState
): PreprocessingControllerSummary | null {
  const phaseContext = state.phaseContext;
  if (!phaseContext || typeof phaseContext !== 'object' || Array.isArray(phaseContext)) {
    return null;
  }

  const controller = (phaseContext as { controller?: unknown }).controller;
  if (!controller || typeof controller !== 'object' || Array.isArray(controller)) {
    return null;
  }

  const candidate = controller as Partial<PreprocessingControllerSummary>;
  if (
    typeof candidate.threadId !== 'string'
    || typeof candidate.turnMode !== 'string'
    || typeof candidate.currentNode !== 'string'
    || !Array.isArray(candidate.allowedTools)
    || typeof candidate.allowTextResponse !== 'boolean'
    || typeof candidate.requireToolCall !== 'boolean'
    || typeof candidate.pendingApproval !== 'boolean'
    || typeof candidate.updatedAt !== 'string'
  ) {
    return null;
  }

  return candidate as PreprocessingControllerSummary;
}
