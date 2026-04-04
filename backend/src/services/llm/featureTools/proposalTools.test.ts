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
        code: 'df["log_salary"] = np.log(df["salary"])',
        outputColumns: ['log_salary']
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

  describe('materializeFeatureCode content guards', () => {
    const baseRun = () => ({
      runId: 'feature-run-1',
      projectId: 'project-1',
      features: {
        'feat-1': {
          featureId: 'feat-1',
          name: 'log_salary',
          method: 'log_transform',
          status: 'proposed' as const,
          createdAt: '2026-04-04T00:00:00Z',
          updatedAt: '2026-04-04T00:00:00Z'
        }
      },
      createdAt: '2026-04-04T00:00:00Z',
      updatedAt: '2026-04-04T00:00:00Z'
    });

    const stubRepository = () => ({
      save: vi.fn(async () => undefined),
      getById: vi.fn(),
      listByProjectId: vi.fn(),
      getOrCreate: vi.fn()
    });

    it('rejects the literal placeholder comment from the bug report', async () => {
      const run = baseRun();
      const result = await materializeFeatureCode({
        projectId: 'project-1',
        toolCallId: 't-1',
        args: {
          featureId: 'feat-1',
          code: '# Placeholder: materialization deferred until proposal confirmation\n',
          outputColumns: ['salary_log']
        },
        run,
        runRepository: stubRepository()
      });
      expect(result.error).toMatch(/not actionable/);
      expect(run.features['feat-1'].status).toBe('proposed');
    });

    it('rejects code that does not reference df', async () => {
      const result = await materializeFeatureCode({
        projectId: 'project-1',
        toolCallId: 't-1',
        args: {
          featureId: 'feat-1',
          code: 'x = 1 + 2',
          outputColumns: ['salary_log']
        },
        run: baseRun(),
        runRepository: stubRepository()
      });
      expect(result.error).toMatch(/not actionable/);
    });

    it('rejects empty outputColumns', async () => {
      const result = await materializeFeatureCode({
        projectId: 'project-1',
        toolCallId: 't-1',
        args: {
          featureId: 'feat-1',
          code: "df['x'] = 1",
          outputColumns: []
        },
        run: baseRun(),
        runRepository: stubRepository()
      });
      expect(result.error).toMatch(/non-empty outputColumns/);
    });

    it('rejects "placeholder" literal in outputColumns', async () => {
      const result = await materializeFeatureCode({
        projectId: 'project-1',
        toolCallId: 't-1',
        args: {
          featureId: 'feat-1',
          code: "df['x'] = 1",
          outputColumns: ['placeholder']
        },
        run: baseRun(),
        runRepository: stubRepository()
      });
      expect(result.error).toMatch(/placeholder/);
    });

    it('accepts real feature code with valid outputColumns', async () => {
      const run = baseRun();
      const repo = stubRepository();
      const result = await materializeFeatureCode({
        projectId: 'project-1',
        toolCallId: 't-1',
        args: {
          featureId: 'feat-1',
          code: 'df["salary_log"] = np.log1p(df["salary"])',
          outputColumns: ['salary_log']
        },
        run,
        runRepository: repo
      });
      expect(result.error).toBeUndefined();
      expect(run.features['feat-1'].status).toBe('code_ready');
      expect(run.features['feat-1'].code).toContain('np.log1p');
      expect(run.features['feat-1'].outputColumns).toEqual(['salary_log']);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });
  });
});
