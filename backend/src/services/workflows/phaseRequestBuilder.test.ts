import { describe, expect, it } from 'vitest';

import type { WorkflowGraphState } from './graphState.js';
import {
  selectFeatureRequestToolResults,
  shouldAllowFeatureCheckpointTool,
  shouldAllowFeatureProposeTool,
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
    ).toBe(true);
  });

  it('keeps proposal mode for implementation prompts without selected feature IDs', () => {
    expect(
      shouldRestrictFeatureToolsToProposalMode([], 'Implement the enabled feature in this draft.')
    ).toBe(true);
  });

  it('unlocks continuation tools when selected feature IDs are present', () => {
    expect(
      shouldRestrictFeatureToolsToProposalMode(
        [],
        [
          'Implement the enabled features in this draft.',
          'Selected feature IDs to implement: feat-1, feat-2'
        ].join('\n')
      )
    ).toBe(false);
  });
});

describe('shouldAllowFeatureCheckpointTool', () => {
  it('blocks checkpoint while any selected feature is not yet registered', () => {
    const results: WorkflowGraphState['toolResultHistory'] = [
      { id: '1', tool: 'register_feature', output: { featureId: 'feat-a' } },
      { id: '2', tool: 'validate_feature', output: { featureId: 'feat-b' } }
    ];

    expect(
      shouldAllowFeatureCheckpointTool(
        results,
        'Selected feature IDs to implement: feat-a, feat-b'
      )
    ).toBe(false);
  });

  it('allows checkpoint once all selected features are registered', () => {
    const results: WorkflowGraphState['toolResultHistory'] = [
      { id: '1', tool: 'register_feature', output: { featureId: 'feat-a' } },
      { id: '2', tool: 'register_feature', output: { featureId: 'feat-b' } }
    ];

    expect(
      shouldAllowFeatureCheckpointTool(
        results,
        'Selected feature IDs to implement: feat-a, feat-b'
      )
    ).toBe(true);
  });

  it('blocks checkpoint when a selected feature registration was rejected', () => {
    const results: WorkflowGraphState['toolResultHistory'] = [
      { id: '1', tool: 'register_feature', output: { featureId: 'feat-a', status: 'ok' } },
      { id: '2', tool: 'register_feature', output: { featureId: 'feat-b', status: 'rejected' } }
    ];

    expect(
      shouldAllowFeatureCheckpointTool(
        results,
        'Selected feature IDs to implement: feat-a, feat-b'
      )
    ).toBe(false);
  });
});

describe('shouldAllowFeatureProposeTool', () => {
  it('blocks propose_feature once selected feature IDs are present', () => {
    expect(
      shouldAllowFeatureProposeTool('Selected feature IDs to implement: feat-a, feat-b')
    ).toBe(false);
  });

  it('allows propose_feature when no selected IDs are present', () => {
    expect(shouldAllowFeatureProposeTool('Suggest useful features for this dataset.')).toBe(true);
  });
});

describe('selectFeatureRequestToolResults', () => {
  it('uses only current-turn results for fresh proposal-mode prompts', () => {
    const results: WorkflowGraphState['toolResultHistory'] = [
      { id: '1', tool: 'propose_feature', output: { featureId: 'feat-old' } },
      { id: '2', tool: 'checkpoint_feature_pipeline', output: { status: 'ok' } }
    ];

    expect(
      selectFeatureRequestToolResults(
        results,
        2,
        'Build interaction features between Presentation Table and CF EE Department.'
      )
    ).toEqual([]);
  });

  it('keeps full lifecycle history when selected feature IDs are present', () => {
    const results: WorkflowGraphState['toolResultHistory'] = [
      { id: '1', tool: 'propose_feature', output: { featureId: 'feat-a' } },
      { id: '2', tool: 'register_feature', output: { featureId: 'feat-a', status: 'ok' } }
    ];

    expect(
      selectFeatureRequestToolResults(
        results,
        2,
        'Selected feature IDs to implement: feat-a'
      )
    ).toEqual(results);
  });
});
