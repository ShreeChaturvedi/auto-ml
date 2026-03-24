import { describe, expect, it, vi } from 'vitest';

import { materializeFeatureCode, proposeFeature } from './proposalTools.js';

describe('proposalTools', () => {
  it('fails loudly when propose_feature has no feature run to persist into', async () => {
    const result = await proposeFeature({
      projectId: 'project-1',
      toolCallId: 'tool-1',
      args: {
        featureId: 'feat-1',
        featureName: 'log_salary',
        method: 'log_transform'
      }
    });

    expect(result).toEqual({
      error: 'propose_feature could not persist because the feature run is unavailable. Start a new feature engineering run and try again.'
    });
  });

  it('fails loudly when materialize_feature_code has no feature run to persist into', async () => {
    const result = await materializeFeatureCode({
      projectId: 'project-1',
      toolCallId: 'tool-2',
      args: {
        featureId: 'feat-1',
        code: 'df["log_salary"] = np.log(df["salary"])'
      }
    });

    expect(result).toEqual({
      error: 'materialize_feature_code could not persist because the feature run is unavailable. Start a new feature engineering run and try again.'
    });
  });

  it('persists the proposal when the feature run is available', async () => {
    const save = vi.fn(async () => undefined);
    const run = {
      runId: 'feature-run-1',
      projectId: 'project-1',
      features: {},
      createdAt: new Date('2026-03-23T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-23T00:00:00.000Z').toISOString()
    };

    const result = await proposeFeature({
      projectId: 'project-1',
      toolCallId: 'tool-3',
      args: {
        featureId: 'feat-2',
        featureName: 'salary_per_year',
        method: 'ratio'
      },
      run,
      runRepository: {
        save,
        getById: vi.fn(),
        listByProjectId: vi.fn(),
        getOrCreate: vi.fn()
      }
    });

    expect(result.error).toBeUndefined();
    expect(save).toHaveBeenCalledTimes(1);
    expect(run.features['feat-2']).toEqual(expect.objectContaining({
      featureId: 'feat-2',
      name: 'salary_per_year',
      method: 'ratio',
      status: 'proposed'
    }));
  });
});
