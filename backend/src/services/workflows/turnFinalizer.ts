import { randomUUID } from 'node:crypto';

import type { Response } from 'express';

import {
  buildArtifactEvent,
  buildWorkflowErrorEvent,
  buildWorkflowPauseEvent,
  writeWorkflowEvent
} from './eventWriter.js';
import type { WorkflowGraphState } from './graphState.js';
import type { WorkflowRepository } from './repository/types.js';
import { buildSummaryArtifactPayload } from './turnState.js';
import type { WorkflowRunState, WorkflowStateEvent, WorkflowTurnRequest } from './types.js';

export async function appendRunEvent(
  repository: WorkflowRepository,
  run: WorkflowRunState,
  eventType: string,
  payload: Record<string, unknown>
) {
  await repository.appendEvent(run.runId, eventType, payload);
}

export async function persistNewToolExecutionEvents(
  repository: WorkflowRepository,
  run: WorkflowRunState,
  previousHistory: {
    toolCalls: WorkflowGraphState['toolCallHistory'];
    toolResults: WorkflowGraphState['toolResultHistory'];
  },
  result: WorkflowGraphState
) {
  const newToolCalls = result.toolCallHistory.slice(previousHistory.toolCalls.length);
  const newToolResults = result.toolResultHistory.slice(previousHistory.toolResults.length);

  for (const [index, call] of newToolCalls.entries()) {
    await appendRunEvent(repository, run, 'tool_executed', {
      call,
      result: newToolResults[index] ?? null
    });
  }
}

async function emitUiArtifact(
  repository: WorkflowRepository,
  res: Response,
  run: WorkflowRunState,
  turn: WorkflowTurnRequest,
  result: WorkflowGraphState,
  savedState: WorkflowStateEvent['state']
) {
  if (!result.uiPayload) {
    return;
  }

  const artifact = await repository.upsertArtifact({
    artifactId: randomUUID(),
    runId: run.runId,
    artifactType: 'ui',
    label: `${turn.phase}-ui`,
    payload: result.uiPayload as unknown as Record<string, unknown>
  });

  writeWorkflowEvent(res, buildArtifactEvent('ui', {
    artifactId: artifact.artifactId,
    label: artifact.label,
    ui: result.uiPayload,
    payload: result.uiPayload as unknown as Record<string, unknown>
  }, savedState));

  await appendRunEvent(repository, run, 'artifact_updated', {
    artifactId: artifact.artifactId,
    artifactType: 'ui'
  });
}

async function emitPlanArtifact(
  repository: WorkflowRepository,
  res: Response,
  run: WorkflowRunState,
  result: WorkflowGraphState,
  savedState: WorkflowStateEvent['state']
) {
  if (!result.planExitPayload) {
    return;
  }

  const artifact = await repository.upsertArtifact({
    artifactId: randomUUID(),
    runId: run.runId,
    artifactType: 'plan',
    label: result.planExitPayload.planName,
    payload: result.planExitPayload as unknown as Record<string, unknown>
  });

  writeWorkflowEvent(res, buildArtifactEvent('plan', {
    artifactId: artifact.artifactId,
    label: artifact.label,
    payload: result.planExitPayload as unknown as Record<string, unknown>
  }, savedState));

  await appendRunEvent(repository, run, 'artifact_updated', {
    artifactId: artifact.artifactId,
    artifactType: 'plan'
  });
}

async function emitSummaryArtifact(
  repository: WorkflowRepository,
  res: Response,
  run: WorkflowRunState,
  turn: WorkflowTurnRequest,
  message: string,
  savedState: WorkflowStateEvent['state']
) {
  const artifact = await repository.upsertArtifact({
    artifactId: randomUUID(),
    runId: run.runId,
    artifactType: 'summary',
    label: `${turn.phase}-summary`,
    payload: buildSummaryArtifactPayload(message)
  });

  writeWorkflowEvent(res, buildArtifactEvent('summary', {
    artifactId: artifact.artifactId,
    label: artifact.label,
    payload: buildSummaryArtifactPayload(message)
  }, savedState));

  await appendRunEvent(repository, run, 'artifact_updated', {
    artifactId: artifact.artifactId,
    artifactType: 'summary'
  });
  await appendRunEvent(repository, run, 'workflow_completed', { message });
}

async function emitPause(
  repository: WorkflowRepository,
  res: Response,
  run: WorkflowRunState,
  result: WorkflowGraphState,
  savedState: WorkflowStateEvent['state'],
  pauseReason: string | undefined,
  pendingInputKind: WorkflowRunState['pendingInputKind'] | undefined
) {
  if (result.askUserPayload) {
    writeWorkflowEvent(res, buildWorkflowPauseEvent(
      pauseReason ?? 'user_input_required',
      'clarification',
      result.latestMessage.trim() || undefined,
      null,
      savedState
    ));
    await appendRunEvent(repository, run, 'workflow_paused', {
      kind: 'clarification',
      questions: result.askUserPayload.questions
    });
    return true;
  }

  if (pendingInputKind === 'approval') {
    writeWorkflowEvent(res, buildWorkflowPauseEvent(
      pauseReason ?? 'awaiting_approval',
      'approval',
      result.latestMessage.trim() || undefined,
      null,
      savedState
    ));
    await appendRunEvent(repository, run, 'workflow_paused', {
      kind: 'approval',
      reason: pauseReason ?? 'awaiting_approval'
    });
    return true;
  }

  return false;
}

async function emitFailure(
  repository: WorkflowRepository,
  res: Response,
  run: WorkflowRunState,
  result: WorkflowGraphState,
  savedState: WorkflowStateEvent['state']
) {
  if (!result.errorMessage) {
    return false;
  }

  writeWorkflowEvent(res, buildWorkflowErrorEvent(
    result.errorMessage,
    run.status === 'failed_retryable',
    result.errorCode ?? undefined,
    savedState
  ));
  await appendRunEvent(repository, run, 'workflow_failed', {
    code: result.errorCode,
    message: result.errorMessage
  });
  return true;
}

export async function finalizeWorkflowTurn(
  repository: WorkflowRepository,
  res: Response,
  run: WorkflowRunState,
  turn: WorkflowTurnRequest,
  result: WorkflowGraphState,
  savedState: WorkflowStateEvent['state'],
  pauseReason: string | undefined,
  pendingInputKind: WorkflowRunState['pendingInputKind'] | undefined
) {
  await emitUiArtifact(repository, res, run, turn, result, savedState);
  await emitPlanArtifact(repository, res, run, result, savedState);

  if (await emitPause(repository, res, run, result, savedState, pauseReason, pendingInputKind)) {
    return;
  }

  if (await emitFailure(repository, res, run, result, savedState)) {
    return;
  }

  if (result.latestMessage.trim() && !result.uiPayload) {
    await emitSummaryArtifact(
      repository,
      res,
      run,
      turn,
      result.latestMessage.trim(),
      savedState
    );
    return;
  }

  await appendRunEvent(repository, run, 'workflow_completed', { runId: run.runId });
}
