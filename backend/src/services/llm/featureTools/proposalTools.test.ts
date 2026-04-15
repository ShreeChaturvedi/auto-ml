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

  describe('propose_feature implementation-mode guard', () => {
    // Regression: the user reported the LLM calling propose_feature 3 times
    // in a row (re-proposing the same features) instead of materializing the
    // ones the user had already selected. The tool list filter correctly
    // removed propose_feature from the LLM's options, but OpenAI's Responses
    // API accepts hallucinated tool calls for unlisted tools — especially
    // when the turn's tool call history has a strong prior pattern of
    // proposing. This handler-level guard hard-rejects propose_feature when
    // the prompt contains the "Selected feature IDs to implement" marker, so
    // the LLM sees a clear error and retries with materialize_feature_code.

    function buildRunWithRepo() {
      const save = vi.fn(async () => undefined);
      const run = {
        runId: 'feature-run-1',
        projectId: 'project-1',
        features: {},
        createdAt: '2026-04-05T00:00:00.000Z',
        updatedAt: '2026-04-05T00:00:00.000Z'
      };
      return {
        save,
        run,
        runRepository: {
          save,
          getById: vi.fn(),
          listByProjectId: vi.fn(),
          getOrCreate: vi.fn()
        }
      };
    }

    it('rejects propose_feature when the prompt contains selected feature IDs', async () => {
      const { save, run, runRepository } = buildRunWithRepo();
      const result = await proposeFeature({
        projectId: 'project-1',
        toolCallId: 'tool-reject-1',
        prompt: [
          'Implement the enabled features in the notebook.',
          '',
          'Selected feature IDs to implement: feat-a, feat-b',
          'Enabled features to implement: feat_a (log1p on salary); feat_b (bucketize on years)'
        ].join('\n'),
        args: {
          featureId: 'feat-hallucinated',
          featureName: 'new_idea',
          method: 'log1p_transform',
          sourceColumns: ['salary']
        },
        run,
        runRepository
      });

      expect(result.error).toMatch(/not allowed in implementation mode/i);
      expect(result.error).toMatch(/materialize_feature_code/);
      // Must NOT have persisted the hallucinated proposal.
      expect(save).not.toHaveBeenCalled();
      expect(run.features).toEqual({});
    });

    it('allows propose_feature on the initial proposal turn (no selected IDs)', async () => {
      const { save, run, runRepository } = buildRunWithRepo();
      const result = await proposeFeature({
        projectId: 'project-1',
        toolCallId: 'tool-allow-1',
        prompt: 'Propose 3 diverse feature engineering transformations for this dataset.',
        args: {
          featureId: 'feat-legit',
          featureName: 'salary_log',
          method: 'log1p_transform',
          sourceColumns: ['salary']
        },
        run,
        runRepository
      });

      expect(result.error).toBeUndefined();
      expect(save).toHaveBeenCalledTimes(1);
      expect(run.features['feat-legit']).toBeDefined();
    });

    it('allows propose_feature when the prompt mentions selection but has no "Selected feature IDs" marker', async () => {
      // Edge case: the user's prompt mentions "selected" in a narrative sense
      // but lacks the exact marker. The guard keys on the literal marker so
      // ambiguous prompts don't accidentally block propose_feature.
      const { save, run, runRepository } = buildRunWithRepo();
      const result = await proposeFeature({
        projectId: 'project-1',
        toolCallId: 'tool-allow-2',
        prompt: 'I have selected the dataset. Now propose 3 features for it.',
        args: {
          featureId: 'feat-legit-2',
          featureName: 'years_bucket',
          method: 'bucketize',
          sourceColumns: ['years_of_service']
        },
        run,
        runRepository
      });

      expect(result.error).toBeUndefined();
      expect(save).toHaveBeenCalledTimes(1);
    });

    it('allows propose_feature when the marker is present with no IDs on the same line', async () => {
      // Edge case: marker with only whitespace before end of line. The id list
      // is empty, so the guard must not fire.
      const { save, run, runRepository } = buildRunWithRepo();
      const result = await proposeFeature({
        projectId: 'project-1',
        toolCallId: 'tool-allow-3',
        prompt: 'Selected feature IDs to implement: ',
        args: {
          featureId: 'feat-legit-3',
          featureName: 'salary_log',
          method: 'log1p_transform',
          sourceColumns: ['salary']
        },
        run,
        runRepository
      });

      expect(result.error).toBeUndefined();
      expect(save).toHaveBeenCalledTimes(1);
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

  it('uses the tool call rationale when args.rationale is absent', async () => {
    const save = vi.fn(async () => undefined);
    const run = {
      runId: 'feature-run-2',
      projectId: 'project-1',
      features: {},
      createdAt: new Date('2026-03-23T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-23T00:00:00.000Z').toISOString()
    };

    const result = await proposeFeature({
      projectId: 'project-1',
      toolCallId: 'tool-4',
      rationale: 'Flag rows where CF EE Division is missing so downstream modeling can preserve missingness as signal.',
      args: {
        featureId: 'feat-3',
        featureName: 'division_missing_flag',
        method: 'missing_indicator',
        sourceColumns: ['CF EE Division']
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
    expect(result.output).toEqual(expect.objectContaining({
      featureId: 'feat-3',
      rationale: 'Flag rows where CF EE Division is missing so downstream modeling can preserve missingness as signal.'
    }));
    expect(run.features['feat-3']).toEqual(expect.objectContaining({
      rationale: 'Flag rows where CF EE Division is missing so downstream modeling can preserve missingness as signal.'
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

    it('creates a new feature entry when featureId is not in run.features (regression: MAX_ITERATIONS loop)', async () => {
      // Bug: when the LLM called materialize_feature_code with a featureId
      // that didn't exist in run.features (e.g., because the user selected
      // IDs that never went through propose_feature), the handler silently
      // skipped the persist and returned {status: 'ok'}. Then execute_feature
      // looked up the feature and found no code, returning an error. The LLM
      // retried materialize, which again silently skipped — burning iterations
      // until MAX_ITERATIONS_EXCEEDED.
      const run = baseRun();
      const repo = stubRepository();
      const result = await materializeFeatureCode({
        projectId: 'project-1',
        toolCallId: 't-1',
        args: {
          featureId: 'f_brand_new',
          featureName: 'Brand New Feature',
          method: 'log1p_transform',
          sourceColumns: ['salary'],
          code: 'df["brand_new_col"] = np.log1p(df["salary"])',
          outputColumns: ['brand_new_col']
        },
        run,
        runRepository: repo
      });
      expect(result.error).toBeUndefined();
      // The new entry must exist and be fully populated so execute_feature
      // can find the code.
      expect(run.features['f_brand_new']).toBeDefined();
      expect(run.features['f_brand_new'].code).toContain('np.log1p');
      expect(run.features['f_brand_new'].outputColumns).toEqual(['brand_new_col']);
      expect(run.features['f_brand_new'].status).toBe('code_ready');
      expect(run.features['f_brand_new'].name).toBe('Brand New Feature');
      expect(run.features['f_brand_new'].method).toBe('log1p_transform');
      expect(run.features['f_brand_new'].sourceColumns).toEqual(['salary']);
      // Must have saved the run so the change is durable.
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('creates a new entry with sensible defaults when featureName/method are missing', async () => {
      const run = baseRun();
      const repo = stubRepository();
      await materializeFeatureCode({
        projectId: 'project-1',
        toolCallId: 't-1',
        args: {
          featureId: 'f_minimal',
          code: 'df["x"] = 1',
          outputColumns: ['x']
        },
        run,
        runRepository: repo
      });
      expect(run.features['f_minimal']).toBeDefined();
      expect(run.features['f_minimal'].name).toBe('f_minimal');
      expect(run.features['f_minimal'].method).toBe('custom');
      expect(run.features['f_minimal'].sourceColumns).toEqual([]);
      expect(run.features['f_minimal'].code).toBe('df["x"] = 1');
    });
  });
});
