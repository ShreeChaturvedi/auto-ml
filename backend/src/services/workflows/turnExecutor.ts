import type { Response } from 'express';

import { buildWorkflowStateEvent, writeWorkflowEvent } from './eventWriter.js';
import { buildWorkflowGraph } from './graph.js';
import {
  WORKFLOW_GRAPH_RECURSION_LIMIT,
  type WorkflowGraphState
} from './graphState.js';
import { loadWorkflowHistory, persistWorkflowHistory } from './history.js';
import { getWorkflowRepository } from './repository/index.js';
import {
  appendRunEvent,
  finalizeWorkflowTurn,
  persistNewToolExecutionEvents
} from './turnFinalizer.js';
import {
  buildInitialRun,
  buildPhaseContext,
  prepareRunForTurn,
  resolveFailureStatus,
  resolvePauseReason,
  resolvePendingInputKind
} from './turnState.js';
import type { WorkflowTurnRequest } from './types.js';

export async function executeWorkflowTurn(res: Response, turn: WorkflowTurnRequest): Promise<void> {
  const repository = getWorkflowRepository();
  const existing = turn.runId ? await repository.getRun(turn.runId) : undefined;
  const persistedRun = existing?.run ?? await repository.createRun(buildInitialRun(turn));
  const run = prepareRunForTurn(persistedRun, turn);
  const history = loadWorkflowHistory(run.metadata);

  writeWorkflowEvent(res, buildWorkflowStateEvent(run, buildPhaseContext(turn)));
  await appendRunEvent(repository, run, 'workflow_turn_started', {
    prompt: turn.prompt ?? '',
    phase: turn.phase
  });

  const graph = buildWorkflowGraph(res);
  const result = await graph.invoke({
    turn,
    run,
    request: null,
    latestMessage: '',
    pendingToolCalls: [],
    toolCallHistory: history.toolCalls,
    toolResultHistory: history.toolResults,
    askUserPayload: null,
    planExitPayload: null,
    uiPayload: null,
    controllerSummary: null,
    iteration: 0,
    nextStep: 'invoke_model',
    pendingInputKind: null,
    pauseReason: null,
    errorMessage: null,
    errorCode: null
  }, {
    recursionLimit: WORKFLOW_GRAPH_RECURSION_LIMIT
  }) as WorkflowGraphState;

  const pauseReason = result.nextStep === 'pause' ? resolvePauseReason(result) : undefined;
  const pendingInputKind = result.nextStep === 'pause' ? resolvePendingInputKind(result) : undefined;
  const phaseContext = buildPhaseContext(turn, result.controllerSummary);

  const savedRun = await repository.saveRun({
    ...result.run,
    status: result.nextStep === 'pause'
      ? 'paused'
      : result.nextStep === 'fail'
        ? resolveFailureStatus(result.errorCode)
        : 'completed',
    pauseReason,
    pendingInputKind,
    lastFailureCode: result.errorCode ?? undefined,
    lastFailureMessage: result.errorMessage ?? undefined,
    activeDatasetId: turn.datasetId ?? result.run.activeDatasetId,
    activeNotebookId: turn.notebookId ?? result.run.activeNotebookId,
    metadata: persistWorkflowHistory(
      {
        ...(result.run.metadata ?? {}),
        controller: result.controllerSummary ?? undefined
      },
      {
        toolCalls: result.toolCallHistory,
        toolResults: result.toolResultHistory
      }
    )
  });

  const savedState = buildWorkflowStateEvent(savedRun, phaseContext).state;
  writeWorkflowEvent(res, buildWorkflowStateEvent(savedRun, phaseContext));

  await persistNewToolExecutionEvents(repository, savedRun, history, result);
  await finalizeWorkflowTurn(
    repository,
    res,
    savedRun,
    turn,
    result,
    savedState,
    pauseReason,
    pendingInputKind
  );
}
