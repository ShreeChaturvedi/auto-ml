import { describe, expect, it } from 'vitest';

import { prepareRunForTurn } from './turnState.js';
import type { WorkflowRunState, WorkflowTurnRequest } from './types.js';

describe('prepareRunForTurn', () => {
  it('resets completed runs into a fresh running turn state', () => {
    const run: WorkflowRunState = {
      runId: 'run-1',
      threadId: 'thread-1',
      projectId: 'project-1',
      phase: 'preprocessing',
      status: 'completed',
      currentNode: 'summarize',
      revision: 2,
      activeDatasetId: 'dataset-1',
      pendingInputKind: 'approval',
      pauseReason: 'awaiting_approval',
      lastFailureCode: 'OLD',
      lastFailureMessage: 'old failure',
      retryBudget: 3,
      repairAttemptCount: 0,
      createdAt: '2026-03-13T00:00:00.000Z',
      updatedAt: '2026-03-13T00:00:00.000Z'
    };

    const turn: WorkflowTurnRequest = {
      projectId: 'project-1',
      phase: 'preprocessing',
      datasetId: 'dataset-2',
      prompt: 'Start the next step.'
    };

    expect(prepareRunForTurn(run, turn)).toMatchObject({
      status: 'running',
      currentNode: 'bootstrap_context',
      activeDatasetId: 'dataset-2',
      pendingInputKind: undefined,
      pauseReason: undefined,
      lastFailureCode: undefined,
      lastFailureMessage: undefined
    });
  });
});
