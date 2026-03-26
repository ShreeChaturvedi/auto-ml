import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ToolContext } from '../phaseConfig.js';

import { featureEngineeringPhaseConfig, featureRunRepository } from './featureEngineering.js';

describe('featureEngineeringPhaseConfig', () => {
  const baseContext: ToolContext = {
    projectId: 'project-1',
    toolCallId: 'tool-1',
    run: {
      runId: 'workflow-run-1',
      threadId: 'workflow-thread-1',
      projectId: 'project-1',
      phase: 'feature_engineering',
      status: 'running',
      currentNode: 'propose_feature',
      revision: 1,
      retryBudget: 0,
      repairAttemptCount: 0,
      createdAt: new Date('2026-03-23T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-23T00:00:00.000Z').toISOString()
    },
    args: {},
    turn: {
      projectId: 'project-1',
      phase: 'feature_engineering',
      datasetId: 'dataset-1'
    }
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an explicit error when getOrCreate does not return a run', async () => {
    vi.spyOn(featureRunRepository, 'getOrCreate').mockResolvedValueOnce(undefined as never);

    const result = await featureEngineeringPhaseConfig.executePhaseSpecificTool(
      'propose_feature',
      {
        featureId: 'feat-1',
        featureName: 'log_salary',
        method: 'log_transform'
      },
      baseContext
    );

    expect(result).toEqual({
      error: 'Failed to initialize feature run for project project-1.'
    });
  });

  it('returns an explicit error when getOrCreate throws', async () => {
    vi.spyOn(featureRunRepository, 'getOrCreate').mockRejectedValueOnce(new Error('disk offline'));

    const result = await featureEngineeringPhaseConfig.executePhaseSpecificTool(
      'propose_feature',
      {
        featureId: 'feat-1',
        featureName: 'log_salary',
        method: 'log_transform'
      },
      baseContext
    );

    expect(result).toEqual({
      error: 'Failed to initialize feature run for project project-1: disk offline'
    });
  });
});
