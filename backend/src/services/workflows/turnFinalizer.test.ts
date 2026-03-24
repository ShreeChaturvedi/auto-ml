import { describe, expect, it } from 'vitest';

import type { WorkflowGraphState } from './graphState.js';
import { InMemoryWorkflowRepository } from './repository/inMemory.js';
import { finalizeWorkflowTurn } from './turnFinalizer.js';
import type { WorkflowRunState, WorkflowTurnRequest } from './types.js';

describe('finalizeWorkflowTurn', () => {
  it('includes the workflow runId in emitted artifact updates', async () => {
    const repository = new InMemoryWorkflowRepository();
    const emitted: unknown[] = [];
    const sink = {
      emit(event: unknown) {
        emitted.push(event);
      },
      isOpen() {
        return true;
      }
    };

    const run: WorkflowRunState = {
      runId: 'workflow-run-1',
      threadId: 'workflow-thread-1',
      projectId: 'project-1',
      phase: 'feature_engineering',
      status: 'completed',
      currentNode: 'summarize',
      revision: 2,
      retryBudget: 0,
      repairAttemptCount: 0,
      createdAt: new Date('2026-03-23T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-23T00:00:00.000Z').toISOString()
    };

    const turn: WorkflowTurnRequest = {
      projectId: 'project-1',
      phase: 'feature_engineering'
    };

    const result = {
      turn,
      run,
      request: null,
      latestMessage: 'Feature pipeline completed.',
      pendingToolCalls: [],
      toolCallHistory: [],
      toolResultHistory: [],
      askUserPayload: null,
      planExitPayload: {
        planName: 'Leakage-safe plan',
        planMarkdown: '- profile data\n- create features'
      },
      uiPayload: null,
      controllerSummary: null,
      iteration: 0,
      nextStep: 'complete',
      pendingInputKind: null,
      pauseReason: null,
      errorMessage: null,
      errorCode: null
    } satisfies WorkflowGraphState;

    const savedState = {
      ...run,
      mode: 'completed' as const
    };

    await finalizeWorkflowTurn(
      repository,
      sink,
      run,
      turn,
      result,
      savedState,
      undefined,
      undefined
    );

    const artifactEvents = emitted.filter((event): event is { type: 'artifact_updated'; artifact: { runId?: string } } => {
      return (
        typeof event === 'object'
        && event !== null
        && (event as { type?: unknown }).type === 'artifact_updated'
      );
    });

    expect(artifactEvents).not.toHaveLength(0);
    expect(artifactEvents.every((event) => event.artifact.runId === run.runId)).toBe(true);
  });
});
