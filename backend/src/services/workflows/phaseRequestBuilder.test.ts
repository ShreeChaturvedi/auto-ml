import { describe, expect, it } from 'vitest';

import type { WorkflowGraphState } from './graphState.js';
import {
  MAX_FE_HISTORY_PAIRS,
  selectFeatureRequestToolResults,
  shouldAllowFeatureCheckpointTool,
  shouldAllowFeatureProposeTool,
  shouldContinuePreprocessingTurn,
  shouldRestrictFeatureToolsToProposalMode,
  trimFeatureEngineeringHistory
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

describe('trimFeatureEngineeringHistory', () => {
  // Regression: in multi-feature runs the old slice(-8) trim would drop
  // propose_feature entries after feature 1 finished, causing the LLM to
  // lose track of features 2+ and stall with text-only output.
  //
  // The new strategy keeps ALL propose_feature pairs unconditionally plus
  // the last MAX_FE_HISTORY_PAIRS non-proposal pairs in chronological order.

  type TestCall = { name: string };
  type TestResult = { output: unknown };

  function mkCalls(...names: string[]): TestCall[] {
    return names.map((name) => ({ name }));
  }
  function mkResults(count: number): TestResult[] {
    return Array.from({ length: count }, (_, i) => ({ output: { index: i } }));
  }

  it('preserves all propose_feature pairs even when non-proposal history exceeds the cap', () => {
    // Scenario: 3 features proposed, then 3 × (materialize, write_cell,
    // run_cell, execute_feature, validate_feature, register_feature)
    // = 18 non-proposal pairs. Old 8-cap trim would drop all 3 proposals.
    const calls = mkCalls(
      'propose_feature',
      'propose_feature',
      'propose_feature',
      ...Array.from({ length: 18 }, (_, i) => (i % 6 === 0 ? 'materialize_feature_code' : 'write_cell'))
    );
    const results = mkResults(calls.length);

    const { calls: trimmed } = trimFeatureEngineeringHistory(calls, results, false);

    const proposalCount = trimmed.filter((c) => c.name === 'propose_feature').length;
    expect(proposalCount).toBe(3);
    // Non-proposal tail capped to MAX_FE_HISTORY_PAIRS (16)
    const nonProposalCount = trimmed.filter((c) => c.name !== 'propose_feature').length;
    expect(nonProposalCount).toBe(MAX_FE_HISTORY_PAIRS);
  });

  it('caps non-proposal pairs at MAX_FE_HISTORY_PAIRS while keeping the most recent', () => {
    const calls = mkCalls(
      'propose_feature',
      ...Array.from({ length: 30 }, (_, i) => `tool_${i}`)
    );
    const results = mkResults(calls.length);

    const { calls: trimmed } = trimFeatureEngineeringHistory(calls, results, false);

    // 1 proposal + 16 most recent non-proposals = 17 total
    expect(trimmed.length).toBe(1 + MAX_FE_HISTORY_PAIRS);
    expect(trimmed[0].name).toBe('propose_feature');
    // Last non-proposal retained is tool_29 (most recent), first retained is tool_14
    expect(trimmed[trimmed.length - 1].name).toBe('tool_29');
    expect(trimmed[1].name).toBe('tool_14');
  });

  it('preserves chronological order after combining proposals and recent pairs', () => {
    const calls = mkCalls(
      'tool_a',
      'propose_feature',
      'tool_b',
      'propose_feature',
      'tool_c'
    );
    const results = mkResults(calls.length);

    const { calls: trimmed } = trimFeatureEngineeringHistory(calls, results, false);

    // Everything fits under the cap, so order should be preserved exactly
    expect(trimmed.map((c) => c.name)).toEqual([
      'tool_a',
      'propose_feature',
      'tool_b',
      'propose_feature',
      'tool_c'
    ]);
  });

  it('bypasses trim and returns everything when restrictToProposalMode is true', () => {
    const calls = mkCalls(
      ...Array.from({ length: 25 }, (_, i) => `tool_${i}`)
    );
    const results = mkResults(calls.length);

    const { calls: trimmed } = trimFeatureEngineeringHistory(calls, results, true);

    expect(trimmed.length).toBe(25);
  });

  it('filters out get_dataset_profile pairs (dataset context is already in the user message)', () => {
    const calls = mkCalls(
      'get_dataset_profile',
      'propose_feature',
      'get_dataset_profile',
      'materialize_feature_code'
    );
    const results = mkResults(calls.length);

    const { calls: trimmed } = trimFeatureEngineeringHistory(calls, results, false);

    expect(trimmed.map((c) => c.name)).toEqual(['propose_feature', 'materialize_feature_code']);
  });

  it('skips pairs whose result is undefined (in-flight calls)', () => {
    const calls = mkCalls('propose_feature', 'materialize_feature_code');
    const results: (TestResult | undefined)[] = [{ output: {} }, undefined];

    const { calls: trimmed } = trimFeatureEngineeringHistory(calls, results, false);

    expect(trimmed.length).toBe(1);
    expect(trimmed[0].name).toBe('propose_feature');
  });

  it('returns paired calls and results aligned by original index', () => {
    const calls = mkCalls('propose_feature', 'materialize_feature_code', 'write_cell');
    const results: TestResult[] = [
      { output: { id: 0 } },
      { output: { id: 1 } },
      { output: { id: 2 } }
    ];

    const { calls: trimmedCalls, results: trimmedResults } = trimFeatureEngineeringHistory(calls, results, false);

    expect(trimmedCalls.length).toBe(trimmedResults.length);
    expect(trimmedCalls[0].name).toBe('propose_feature');
    expect(trimmedResults[0]).toEqual({ output: { id: 0 } });
    expect(trimmedCalls[1].name).toBe('materialize_feature_code');
    expect(trimmedResults[1]).toEqual({ output: { id: 1 } });
  });
});
