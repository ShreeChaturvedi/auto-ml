import { randomUUID } from 'node:crypto';

import { nowIso } from '../preprocessingTools/helpers.js';

import { resolveExperiment } from './types.js';
import type { TrainingToolContext, TrainingToolHandler, TrainingToolResult } from './types.js';

const MAX_EXPERIMENTS_PER_TURN = 3;

export const configureExperiment: TrainingToolHandler = async (
  ctx: TrainingToolContext
): Promise<TrainingToolResult> => {
  const { args, run } = ctx;

  const existingExperiments = Object.keys((run.metadata?.experiments as Record<string, unknown>) ?? {});
  if (existingExperiments.length >= MAX_EXPERIMENTS_PER_TURN) {
    return {
      output: {
        status: 'rejected',
        message: `Maximum of ${MAX_EXPERIMENTS_PER_TURN} experiments per turn reached. Proceed to propose_training_plan for one of the configured experiments.`,
        configuredExperiments: existingExperiments
      }
    };
  }

  const experimentId = `exp-${randomUUID()}`;
  const experimentName = (typeof args.experimentName === 'string' ? args.experimentName : null) ?? 'Untitled Experiment';
  const modelType = (typeof args.modelType === 'string' ? args.modelType : null) ?? 'unknown';
  const splitStrategy = (typeof args.splitStrategy === 'string' ? args.splitStrategy : null) ?? 'train_test';
  const now = nowIso();

  const experiments = ((run.metadata?.experiments as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  experiments[experimentId] = {
    experimentId,
    experimentName,
    modelType,
    status: 'configured',
    hyperparameters: (args.hyperparameters && typeof args.hyperparameters === 'object' ? args.hyperparameters : {}) as Record<string, unknown>,
    splitStrategy,
    splitRatio: typeof args.splitRatio === 'number' ? args.splitRatio : 0.8,
    targetColumn: typeof args.targetColumn === 'string' ? args.targetColumn : undefined,
    featureColumns: Array.isArray(args.featureColumns) ? args.featureColumns : undefined,
    randomSeed: typeof args.randomSeed === 'number' ? args.randomSeed : undefined,
    createdAt: now,
    updatedAt: now
  };

  run.metadata = { ...run.metadata, experiments };

  return {
    output: {
      experimentId,
      experimentName,
      modelType,
      splitStrategy,
      status: 'configured',
      message: `Experiment "${experimentName}" configured with ${modelType} model and ${splitStrategy} split strategy.`
    }
  };
};

export const proposeTrainingPlan: TrainingToolHandler = async (
  ctx: TrainingToolContext
): Promise<TrainingToolResult> => {
  const { args, run } = ctx;

  const resolved = resolveExperiment(run, args);
  if ('error' in resolved) return resolved;
  const { experiment } = resolved;

  experiment.status = 'proposed';
  experiment.rationale = args.rationale;
  experiment.expectedMetrics = args.expectedMetrics;
  experiment.risks = args.risks;
  experiment.alternatives = args.alternatives;
  experiment.updatedAt = nowIso();

  return {
    output: {
      experimentId: experiment.experimentId,
      status: 'proposed',
      rationale: args.rationale,
      expectedMetrics: args.expectedMetrics ?? {},
      risks: Array.isArray(args.risks) ? args.risks : [],
      alternatives: args.alternatives ?? [],
      message: `Training plan proposed for experiment "${experiment.experimentName as string}". Awaiting approval.`
    }
  };
};
