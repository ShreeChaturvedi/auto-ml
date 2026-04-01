import { randomUUID } from 'node:crypto';

import type { ToolResult } from '../../types/llm.js';

import type { WorkflowGraphState } from './graphState.js';
import type { WorkflowRunState, WorkflowTurnRequest } from './types.js';

export interface WorkflowPauseDetails {
  pendingInputKind: 'approval';
  pauseReason: 'awaiting_approval';
}

function getPauseRecord(output: unknown): Record<string, unknown> | null {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return null;
  }

  return output as Record<string, unknown>;
}

export function getToolResultPauseReason(
  result: Pick<ToolResult, 'output'> | undefined
): WorkflowPauseDetails['pauseReason'] | undefined {
  const record = getPauseRecord(result?.output);
  if (!record) {
    return undefined;
  }

  const step = getPauseRecord(record.step);
  const reasonCode = typeof record.reasonCode === 'string' ? record.reasonCode : undefined;
  const status = typeof record.status === 'string'
    ? record.status
    : typeof step?.status === 'string'
      ? step.status
      : undefined;

  if (reasonCode === 'STEP_APPROVAL_REQUIRED' || reasonCode === 'STEP_APPROVAL_USER_REQUIRED') {
    return 'awaiting_approval';
  }

  return status === 'awaiting_approval' ? 'awaiting_approval' : undefined;
}

export function getApprovalPauseDetails(
  results: readonly Pick<ToolResult, 'output'>[]
): WorkflowPauseDetails | null {
  return results.some((result) => getToolResultPauseReason(result) === 'awaiting_approval')
    ? {
        pendingInputKind: 'approval',
        pauseReason: 'awaiting_approval'
      }
    : null;
}

export function buildInitialRun(
  turn: WorkflowTurnRequest
): Omit<WorkflowRunState, 'createdAt' | 'updatedAt' | 'revision'> {
  return {
    runId: turn.runId?.trim() || randomUUID(),
    threadId: turn.threadId?.trim() || `thread-${randomUUID()}`,
    projectId: turn.projectId,
    phase: turn.phase,
    status: 'running',
    currentNode: 'bootstrap_context',
    activeDatasetId: turn.datasetId,
    activeNotebookId: turn.notebookId,
    pendingInputKind: undefined,
    pauseReason: undefined,
    lastFailureCode: undefined,
    lastFailureMessage: undefined,
    retryBudget: 3,
    repairAttemptCount: 0,
    handoffFromArtifactId: undefined,
    handoffToArtifactId: undefined,
    metadata: {}
  };
}

export function prepareRunForTurn(
  run: WorkflowRunState,
  turn: WorkflowTurnRequest
): WorkflowRunState {
  const nextDatasetId = turn.datasetId ?? run.activeDatasetId;
  const nextNotebookId = turn.notebookId ?? run.activeNotebookId;
  const nextMetadata = {
    ...(run.metadata ?? {}),
    workflowTurnStartStatus: run.status
  };
  if (run.status === 'running' || run.status === 'paused') {
    return {
      ...run,
      metadata: nextMetadata,
      activeDatasetId: nextDatasetId,
      activeNotebookId: nextNotebookId
    };
  }

  return {
    ...run,
    metadata: nextMetadata,
    status: 'running',
    currentNode: 'bootstrap_context',
    activeDatasetId: nextDatasetId,
    activeNotebookId: nextNotebookId,
    pendingInputKind: undefined,
    pauseReason: undefined,
    lastFailureCode: undefined,
    lastFailureMessage: undefined
  };
}

export function resolveFailureStatus(errorCode: string | null): WorkflowRunState['status'] {
  if (
    errorCode === 'DATASET_NOT_FOUND'
    || errorCode === 'DATASET_REQUIRED'
    || errorCode === 'FE_PIPELINE_APPROVAL_REQUIRED'
  ) {
    return 'failed_terminal';
  }

  return 'failed_retryable';
}

export function resolvePauseReason(result: WorkflowGraphState): string | undefined {
  if (result.pauseReason) {
    return result.pauseReason;
  }
  if (result.askUserPayload) {
    return 'user_input_required';
  }
  if (result.planExitPayload) {
    return 'plan_ready';
  }
  if (result.uiPayload) {
    return 'ui_ready';
  }

  return getToolResultPauseReason(result.toolResultHistory.at(-1));
}

export function resolvePendingInputKind(
  result: WorkflowGraphState
): WorkflowRunState['pendingInputKind'] | undefined {
  if (result.pendingInputKind) {
    return result.pendingInputKind;
  }
  if (result.askUserPayload) {
    return 'clarification';
  }

  return resolvePauseReason(result) === 'awaiting_approval'
    ? 'approval'
    : undefined;
}

export function buildPhaseContext(
  turn: WorkflowTurnRequest,
  controllerSummary?: Record<string, unknown> | null
) {
  return {
    datasetId: turn.datasetId,
    notebookId: turn.notebookId,
    targetColumn: turn.targetColumn,
    featureSummary: turn.featureSummary,
    controller: controllerSummary ?? undefined
  };
}

export function buildSummaryArtifactPayload(message: string): Record<string, unknown> {
  return { message };
}
