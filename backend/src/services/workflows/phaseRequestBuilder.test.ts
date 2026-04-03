import { describe, expect, it } from 'vitest';

import type { WorkflowGraphState } from './graphState.js';
import {
  shouldContinuePreprocessingTurn,
  shouldRestrictFeatureToolsToProposalMode
} from './phaseRequestBuilder.js';

function createState(overrides: Partial<WorkflowGraphState> = {}): WorkflowGraphState {
  return {
    turn: {
      projectId: 'project-1',
      phase: 'preprocessing',
      prompt: undefined,
      datasetId: 'dataset-1'
    },
    run: {
      runId: 'workflow-run-1',
      threadId: 'workflow-thread-1',
      projectId: 'project-1',
      phase: 'preprocessing',
      status: 'running',
      currentNode: 'plan_step',
      revision: 0,
      retryBudget: 3,
      repairAttemptCount: 0,
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z'
    },
    request: null,
    latestMessage: '',
    pendingToolCalls: [],
    toolCallHistory: [
      {
        id: 'call-1',
        tool: 'profile_active_dataset',
        args: {}
      }
    ],
    toolResultHistory: [
      {
        id: 'call-1',
        tool: 'profile_active_dataset',
        output: { runId: 'prep-run-1' }
      }
    ],
    turnStartToolCallCount: 0,
    askUserPayload: null,
    planExitPayload: null,
    uiPayload: null,
    controllerSummary: null,
    iteration: 0,
    nextStep: 'invoke_model',
    pendingInputKind: null,
    pauseReason: null,
    errorMessage: null,
    errorCode: null,
    ...overrides
  } as WorkflowGraphState;
}

describe('shouldContinuePreprocessingTurn', () => {
  it('does not treat a fresh user prompt as a silent continuation of the previous run', () => {
    const state = createState({
      turn: {
        projectId: 'project-1',
        phase: 'preprocessing',
        prompt: 'Handle missing values in the active dataset.',
        datasetId: 'dataset-1'
      }
    });

    expect(shouldContinuePreprocessingTurn(state)).toBe(false);
  });

  it('still continues within the same turn after at least one workflow iteration', () => {
    const state = createState({
      iteration: 1,
      turn: {
        projectId: 'project-1',
        phase: 'preprocessing',
        prompt: 'Handle missing values in the active dataset.',
        datasetId: 'dataset-1'
      }
    });

    expect(shouldContinuePreprocessingTurn(state)).toBe(true);
  });
});

describe('shouldRestrictFeatureToolsToProposalMode', () => {
  it('uses proposal-only tools on the very first non-implementation FE turn', () => {
    expect(
      shouldRestrictFeatureToolsToProposalMode([], 'Suggest a few useful features for this dataset.')
    ).toBe(true);
  });

  it('keeps continuation tools available when prior FE lifecycle history exists', () => {
    expect(
      shouldRestrictFeatureToolsToProposalMode(
        [
          {
            id: 'tool-1',
            tool: 'validate_feature',
            output: { featureId: 'feat-1', status: 'validated' }
          }
        ],
        'Summarize progress so far and continue with the next step for this draft.'
      )
    ).toBe(false);
  });

  it('keeps continuation tools available for explicit implementation prompts', () => {
    expect(
      shouldRestrictFeatureToolsToProposalMode([], 'Implement the enabled feature in this draft.')
    ).toBe(false);
  });
});
