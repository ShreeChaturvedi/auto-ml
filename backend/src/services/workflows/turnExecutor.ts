import { appLogger } from '../../logging/logger.js';
import { normalizeLlmStreamError } from '../llm/streamErrors.js';

import type { WorkflowEventSink } from './eventSink.js';
import { buildWorkflowErrorEvent, buildWorkflowStateEvent } from './eventWriter.js';
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
  resolvePendingInputKind,
  shouldRestoreWorkflowHistory
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
  const history = shouldRestoreWorkflowHistory(persistedRun)
    ? loadWorkflowHistory(run.metadata)
    : { toolCalls: [], toolResults: [] };

  sink.emit(buildWorkflowStateEvent(run, buildPhaseContext(turn)));
  await appendRunEvent(repository, run, 'workflow_turn_started', {
    prompt: turn.prompt ?? '',
    phase: turn.phase
  });

  let result: WorkflowGraphState;
  try {
    const graph = getCompiledGraph();
    result = await graph.invoke({
      turn,
      run,
      request: null,
      latestMessage: '',
      pendingToolCalls: [],
      // Restore previous history so continuation detection works
      // (shouldContinuePreprocessingTurn checks hasWorkflowHistory).
      // The turnStartToolCallCount tells the tool limiter to skip these
      // when counting — only THIS turn's calls are limited.
      toolCallHistory: history.toolCalls,
      toolResultHistory: history.toolResults,
      turnStartToolCallCount: history.toolCalls.length,
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
  } catch (error) {
    // Graph invocation threw (e.g. upstream 429 from OpenAI). Without this
    // catch the DB row stays at status='running' forever, causing
    // WORKFLOW_ALREADY_RUNNING on the next turn. Normalize the error,
    // persist the failure state, emit SSE events, then rethrow so the
    // route handler can close the response.
    const normalized = normalizeLlmStreamError(error);
    appLogger.error(
      `[turnExecutor] Workflow turn failed for runId=${run.runId} phase=${turn.phase}: ${
        error instanceof Error ? error.stack ?? error.message : String(error)
      }`
    );

    try {
      const failureStatus = resolveFailureStatus(normalized.code);
      const savedRun = await repository.saveRun({
        ...run,
        status: failureStatus,
        pendingInputKind: undefined,
        pauseReason: undefined,
        lastFailureCode: normalized.code,
        lastFailureMessage: normalized.message,
        activeDatasetId: turn.datasetId ?? run.activeDatasetId,
        activeNotebookId: turn.notebookId ?? run.activeNotebookId,
        metadata: persistWorkflowHistory(run.metadata ?? {}, {
          toolCalls: history.toolCalls,
          toolResults: history.toolResults
        })
      });

      const failurePhaseContext = buildPhaseContext(turn);
      const savedStateEvent = buildWorkflowStateEvent(savedRun, failurePhaseContext);
      sink.emit(savedStateEvent);
      sink.emit(
        buildWorkflowErrorEvent(
          normalized.message,
          normalized.retryable,
          normalized.code,
          savedStateEvent.state
        )
      );

      await appendRunEvent(repository, savedRun, 'workflow_failed', {
        code: normalized.code,
        message: normalized.message
      });
    } catch (persistError) {
      appLogger.error(
        `[turnExecutor] Failed to persist failure state for runId=${run.runId}: ${
          persistError instanceof Error ? persistError.message : String(persistError)
        }`
      );
    }

    throw error;
  }

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
