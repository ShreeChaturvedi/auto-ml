import { describe, expect, it } from 'vitest';

import type { WorkflowGraphState } from './graphState.js';
import {
  getApprovalPauseDetails,
  getToolResultPauseReason,
  prepareRunForTurn,
  resolvePauseReason,
  resolvePendingInputKind
} from './turnState.js';
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

describe('workflow pause detection', () => {
  it('detects approval pauses from top-level or nested step status', () => {
    expect(
      getToolResultPauseReason({
        output: { status: 'awaiting_approval' }
      })
    ).toBe('awaiting_approval');

    expect(
      getToolResultPauseReason({
        output: { step: { status: 'awaiting_approval' } }
      })
    ).toBe('awaiting_approval');

    expect(
      getToolResultPauseReason({
        output: { reasonCode: 'STEP_APPROVAL_REQUIRED' }
      })
    ).toBe('awaiting_approval');
  });

  it('builds approval pause details from any matching tool result', () => {
    expect(getApprovalPauseDetails([
      { output: { status: 'completed' } },
      { output: { step: { status: 'awaiting_approval' } } }
    ])).toEqual({
      pendingInputKind: 'approval',
      pauseReason: 'awaiting_approval'
    });
  });

  it('resolves approval pause state from tool results when explicit pause fields are absent', () => {
    const result = {
      pauseReason: null,
      pendingInputKind: null,
      askUserPayload: null,
      planExitPayload: null,
      uiPayload: null,
      toolResultHistory: [{ output: { reasonCode: 'STEP_APPROVAL_USER_REQUIRED' } }]
    } as unknown as WorkflowGraphState;

    expect(resolvePauseReason(result)).toBe('awaiting_approval');
    expect(resolvePendingInputKind(result)).toBe('approval');
  });
});
