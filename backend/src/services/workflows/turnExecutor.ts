import type { WorkflowEventSink } from './eventSink.js';
import { buildWorkflowStateEvent } from './eventWriter.js';
import { getCompiledGraph } from './graph.js';
import {
  WORKFLOW_GRAPH_RECURSION_LIMIT,
  type WorkflowGraphState
} from './graphState.js';
import { loadWorkflowHistory, persistWorkflowHistory } from './history.js';
import type { PhaseConfig } from './phaseConfig.js';
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

export async function executeWorkflowTurn(
  sink: WorkflowEventSink,
  turn: WorkflowTurnRequest,
  phaseConfig?: PhaseConfig
): Promise<void> {
  const repository = getWorkflowRepository();
  const existing = turn.runId ? await repository.getRun(turn.runId) : undefined;
  const persistedRun = existing?.run ?? await repository.createRun(buildInitialRun(turn));
  const run = prepareRunForTurn(persistedRun, turn);
  const history = loadWorkflowHistory(run.metadata);

  sink.emit(buildWorkflowStateEvent(run, buildPhaseContext(turn)));
  await appendRunEvent(repository, run, 'workflow_turn_started', {
    prompt: turn.prompt ?? '',
    phase: turn.phase
  });

  const graph = getCompiledGraph();
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
    recursionLimit: WORKFLOW_GRAPH_RECURSION_LIMIT,
    configurable: {
      sink,
      phaseConfig: phaseConfig ?? undefined
    }
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

  const savedStateEvent = buildWorkflowStateEvent(savedRun, phaseContext);
  const savedState = savedStateEvent.state;
  sink.emit(savedStateEvent);

  await persistNewToolExecutionEvents(repository, savedRun, history, result);
  await finalizeWorkflowTurn(
    repository,
    sink,
    savedRun,
    turn,
    result,
    savedState,
    pauseReason,
    pendingInputKind
  );
}
