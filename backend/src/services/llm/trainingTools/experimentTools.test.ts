import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowRunState, WorkflowTurnRequest } from '../../workflows/types.js';

import type { TrainingToolContext } from './types.js';

// Mock projectRepository BEFORE the experimentTools module is imported so
// configureExperiment's auto-populate path (added in sprint11 Step 3a) can
// read a controllable project.metadata.features list.
const mockGetProjectById = vi.fn();
vi.mock('../../../repositories/projectRepository.js', () => ({
  createProjectRepository: () => ({
    getById: mockGetProjectById
  })
}));

const { configureExperiment, proposeTrainingPlan } = await import('./experimentTools.js');

const LIVE_BUG_THREAD_ID = 'thread-9adbfc59-9ef3-48ff-9201-9dc4e3f30ec9';

function buildRun(): WorkflowRunState {
  return {
    runId: 'baa7e743-7b4e-4ccb-8757-e76ae75af3c2',
    threadId: LIVE_BUG_THREAD_ID,
    projectId: '14be1dad-05cd-439b-a708-027b0447baf5',
    phase: 'training',
    status: 'running',
    currentNode: 'configure_experiment',
    revision: 1,
    retryBudget: 3,
    repairAttemptCount: 0,
    createdAt: new Date('2026-04-05T21:03:24.937Z').toISOString(),
    updatedAt: new Date('2026-04-05T21:03:24.937Z').toISOString(),
    metadata: {}
  };
}

function buildTurn(): WorkflowTurnRequest {
  return {
    projectId: '14be1dad-05cd-439b-a708-027b0447baf5',
    phase: 'training',
    datasetId: 'dataset-1',
    prompt: 'Tune regularization while predicting usage_log1p from feature_v1.'
  };
}

function buildCtx(run: WorkflowRunState, args: Record<string, unknown>): TrainingToolContext {
  return {
    projectId: '14be1dad-05cd-439b-a708-027b0447baf5',
    toolCallId: 'wf-call-test',
    args,
    datasetId: 'dataset-1',
    notebookId: 'nb-1',
    run,
    turn: buildTurn()
  };
}

describe('configureExperiment — Feature Engineering pipeline handoff', () => {
  // Sprint11 Step 3a: when the project has enabled engineered features and
  // the LLM omits featureColumns, the handler defaults to the FE feature
  // names so models train on the engineered inputs — not raw dataset
  // columns that silently bypass the pipeline. On the user's actual
  // project this prevents a "successful" training run that computes
  // metrics against the derived usage_log1p target using raw columns.

  beforeEach(() => {
    mockGetProjectById.mockReset();
  });

  it('auto-populates featureColumns from project.metadata.features when the LLM omits them', async () => {
    mockGetProjectById.mockResolvedValue({
      projectId: '14be1dad-05cd-439b-a708-027b0447baf5',
      metadata: {
        features: [
          { featureName: 'dept_usage_rollavg_7d', enabled: true },
          { featureName: 'dept_subject_usage_rollavg_7d', enabled: true },
          { featureName: 'usage_weekday_seasonality', enabled: true }
        ]
      }
    });

    const run = buildRun();
    const result = await configureExperiment(buildCtx(run, {
      experimentName: 'Ridge Baseline',
      modelType: 'ridge',
      splitStrategy: 'train_test',
      targetColumn: 'usage_log1p'
      // Deliberately no featureColumns — LLM forgot to specify them.
    }));

    expect(result.error).toBeUndefined();
    const experiments = run.metadata?.experiments as Record<string, Record<string, unknown>>;
    const experimentId = Object.keys(experiments)[0];
    expect(experiments[experimentId].featureColumns).toEqual([
      'dept_usage_rollavg_7d',
      'dept_subject_usage_rollavg_7d',
      'usage_weekday_seasonality'
    ]);

    const output = result.output as Record<string, unknown>;
    expect(output.featureColumns).toEqual([
      'dept_usage_rollavg_7d',
      'dept_subject_usage_rollavg_7d',
      'usage_weekday_seasonality'
    ]);
    expect(output.message).toContain('3 feature columns');
  });

  it('skips disabled features when auto-populating', async () => {
    mockGetProjectById.mockResolvedValue({
      projectId: '14be1dad-05cd-439b-a708-027b0447baf5',
      metadata: {
        features: [
          { featureName: 'enabled_feat_1', enabled: true },
          { featureName: 'disabled_feat', enabled: false },
          { featureName: 'enabled_feat_2', enabled: true }
        ]
      }
    });

    const run = buildRun();
    await configureExperiment(buildCtx(run, {
      experimentName: 'Exp',
      modelType: 'ridge',
      targetColumn: 'y'
    }));

    const experiments = run.metadata?.experiments as Record<string, Record<string, unknown>>;
    const experimentId = Object.keys(experiments)[0];
    expect(experiments[experimentId].featureColumns).toEqual(['enabled_feat_1', 'enabled_feat_2']);
  });

  it('does NOT overwrite an explicit featureColumns supplied by the LLM', async () => {
    // The user may ask "train on only columns A and B" — honor that.
    mockGetProjectById.mockResolvedValue({
      projectId: '14be1dad-05cd-439b-a708-027b0447baf5',
      metadata: {
        features: [
          { featureName: 'feat_a', enabled: true },
          { featureName: 'feat_b', enabled: true },
          { featureName: 'feat_c', enabled: true }
        ]
      }
    });

    const run = buildRun();
    await configureExperiment(buildCtx(run, {
      experimentName: 'Exp',
      modelType: 'ridge',
      targetColumn: 'y',
      featureColumns: ['feat_a'] // explicit subset
    }));

    const experiments = run.metadata?.experiments as Record<string, Record<string, unknown>>;
    const experimentId = Object.keys(experiments)[0];
    expect(experiments[experimentId].featureColumns).toEqual(['feat_a']);
  });

  it('leaves featureColumns undefined when the project has no engineered features', async () => {
    mockGetProjectById.mockResolvedValue({
      projectId: '14be1dad-05cd-439b-a708-027b0447baf5',
      metadata: {}
    });

    const run = buildRun();
    await configureExperiment(buildCtx(run, {
      experimentName: 'Exp',
      modelType: 'linear_regression',
      targetColumn: 'y'
    }));

    const experiments = run.metadata?.experiments as Record<string, Record<string, unknown>>;
    const experimentId = Object.keys(experiments)[0];
    expect(experiments[experimentId].featureColumns).toBeUndefined();
  });

  it('does not block configure when projectRepository fails', async () => {
    // Defensive fallback: repo read errors must not prevent experiment
    // creation — the LLM can still proceed, just without the auto-populated
    // featureColumns. A warning is logged (not asserted here) and the
    // training contract asks the LLM to supply featureColumns explicitly.
    mockGetProjectById.mockRejectedValue(new Error('project store corrupted'));

    const run = buildRun();
    const result = await configureExperiment(buildCtx(run, {
      experimentName: 'Exp',
      modelType: 'ridge',
      targetColumn: 'y'
    }));

    expect(result.error).toBeUndefined();
    const experiments = run.metadata?.experiments as Record<string, Record<string, unknown>>;
    const experimentId = Object.keys(experiments)[0];
    expect(experiments[experimentId].featureColumns).toBeUndefined();
  });
});

describe('training tools — propose_training_plan recovers from planner threadId leak', () => {
  // This is the full end-to-end reproduction of the sprint10 live bug on
  // workflow baa7e743-... / project 14be1dad-... The user prompted "Tune
  // regularization while predicting usage_log1p from feature_v1." The
  // generic planner was called twice:
  //
  //   iter 1: emitted configure_experiment → exp-a14496b1-...
  //   iter 2: emitted propose_training_plan with experimentId=thread-9adbfc59-...
  //           because summarizeToolResultPayload dropped the real exp id AND
  //           summarizeWorkflowState leaked the workflow threadId into the
  //           planner's user prompt.
  //
  // This test exercises the real handler path. configure_experiment mutates
  // run.metadata.experiments (experimentTools.ts:48). The follow-up call
  // simulates the planner leak by passing the threadId. Fix validates via
  // the narrow lenient fallback in resolveExperiment.

  it('propose_training_plan with a leaked threadId auto-resolves against the only configured experiment', async () => {
    const run = buildRun();

    // Iteration 1: LLM / planner emits configure_experiment.
    const configureResult = await configureExperiment(buildCtx(run, {
      experimentName: 'usage_log1p_regularization_tuning',
      modelType: 'elastic_net',
      splitStrategy: 'train_test',
      targetColumn: 'usage_log1p',
      hyperparameters: { alpha: 1.0, l1_ratio: 0.5 }
    }));

    expect(configureResult.error).toBeUndefined();
    const configureOutput = configureResult.output as Record<string, unknown>;
    expect(configureOutput.status).toBe('configured');
    expect(typeof configureOutput.experimentId).toBe('string');
    expect((configureOutput.experimentId as string).startsWith('exp-')).toBe(true);
    const realExperimentId = configureOutput.experimentId as string;

    // Iteration 2: planner leak — propose_training_plan is called with the
    // workflow threadId instead of the real experimentId. Fix should auto-
    // resolve to the one configured experiment.
    const proposeResult = await proposeTrainingPlan(buildCtx(run, {
      experimentId: LIVE_BUG_THREAD_ID,
      rationale: 'Ridge baseline with cross-validated alpha tuning.',
      expectedMetrics: { rmse: '<0.5', mae: '<0.4' },
      risks: ['Over-regularization causing underfitting'],
      alternatives: ['Lasso', 'Elastic Net']
    }));

    expect(proposeResult.error).toBeUndefined();
    const proposeOutput = proposeResult.output as Record<string, unknown>;
    expect(proposeOutput.experimentId).toBe(realExperimentId);
    expect(proposeOutput.status).toBe('awaiting_approval');
    expect(proposeOutput.rationale).toContain('Ridge');

    // Downstream: the experiment in run metadata must now carry the
    // proposal fields so subsequent tools (execute_training, evaluate_results)
    // see the updated state.
    const experiments = run.metadata?.experiments as Record<string, Record<string, unknown>>;
    const experiment = experiments[realExperimentId];
    expect(experiment).toBeDefined();
    expect(experiment.status).toBe('proposed');
    expect(experiment.rationale).toContain('Ridge');
  });

  it('propose_training_plan with leaked threadId errors when multiple experiments exist', async () => {
    const run = buildRun();

    const configureResult1 = await configureExperiment(buildCtx(run, {
      experimentName: 'Baseline',
      modelType: 'linear_regression',
      targetColumn: 'usage_log1p'
    }));
    expect(configureResult1.error).toBeUndefined();

    const configureResult2 = await configureExperiment(buildCtx(run, {
      experimentName: 'Tuned',
      modelType: 'elastic_net',
      targetColumn: 'usage_log1p'
    }));
    expect(configureResult2.error).toBeUndefined();

    // Now ambiguity: two experiments configured, planner leaks threadId.
    // The lenient fallback must REFUSE to pick one and error with a message
    // that explicitly names the leak so the bug is easy to debug.
    const proposeResult = await proposeTrainingPlan(buildCtx(run, {
      experimentId: LIVE_BUG_THREAD_ID,
      rationale: 'Ambiguous call.'
    }));

    expect(proposeResult.error).toBeDefined();
    expect(proposeResult.error).toContain('workflow thread id');
    expect(proposeResult.error).toContain('planner likely leaked');
    // Error must list the valid candidates so the retry can succeed.
    const exp1Id = (configureResult1.output as Record<string, unknown>).experimentId as string;
    const exp2Id = (configureResult2.output as Record<string, unknown>).experimentId as string;
    expect(proposeResult.error).toContain(exp1Id);
    expect(proposeResult.error).toContain(exp2Id);

    // Neither experiment should have been mutated.
    const experiments = run.metadata?.experiments as Record<string, Record<string, unknown>>;
    expect(experiments[exp1Id].status).toBe('configured');
    expect(experiments[exp2Id].status).toBe('configured');
  });

  it('propose_training_plan with correct experimentId still works (no regression)', async () => {
    const run = buildRun();

    const configureResult = await configureExperiment(buildCtx(run, {
      experimentName: 'Baseline',
      modelType: 'random_forest',
      targetColumn: 'usage_log1p'
    }));
    const realExperimentId = (configureResult.output as Record<string, unknown>).experimentId as string;

    const proposeResult = await proposeTrainingPlan(buildCtx(run, {
      experimentId: realExperimentId,
      rationale: 'Non-linear baseline.',
      risks: []
    }));

    expect(proposeResult.error).toBeUndefined();
    const proposeOutput = proposeResult.output as Record<string, unknown>;
    expect(proposeOutput.experimentId).toBe(realExperimentId);
    expect(proposeOutput.status).toBe('awaiting_approval');
  });
});
