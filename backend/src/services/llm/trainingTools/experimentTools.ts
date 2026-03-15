import { randomUUID } from 'node:crypto';

import type { TrainingToolContext, TrainingToolHandler, TrainingToolResult } from './types.js';

/**
 * configure_experiment — set up experiment with model type, hyperparameters, and split strategy.
 * Creates a new experiment entry in the workflow run metadata.
 */
export const configureExperiment: TrainingToolHandler = async (
  ctx: TrainingToolContext
): Promise<TrainingToolResult> => {
  const { args, run } = ctx;

  const experimentId = `exp-${randomUUID()}`;
  const experimentName = (args.experimentName as string) ?? 'Untitled Experiment';
  const modelType = (args.modelType as string) ?? 'unknown';
  const splitStrategy = (args.splitStrategy as string) ?? 'train_test';

  // Store experiment state in run metadata
  const experiments = ((run.metadata?.experiments as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  experiments[experimentId] = {
    experimentId,
    experimentName,
    modelType,
    status: 'configured',
    hyperparameters: (args.hyperparameters as Record<string, unknown>) ?? {},
    splitStrategy,
    splitRatio: (args.splitRatio as number) ?? 0.8,
    targetColumn: args.targetColumn as string | undefined,
    featureColumns: args.featureColumns as string[] | undefined,
    randomSeed: args.randomSeed as number | undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
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

/**
 * propose_training_plan — propose a training approach with rationale.
 * Updates the experiment status to 'proposed' and records the plan details.
 */
export const proposeTrainingPlan: TrainingToolHandler = async (
  ctx: TrainingToolContext
): Promise<TrainingToolResult> => {
  const { args, run } = ctx;

  const experimentId = args.experimentId as string | undefined;
  if (!experimentId) {
    return { error: 'propose_training_plan requires experimentId.' };
  }

  const experiments = (run.metadata?.experiments as Record<string, Record<string, unknown>>) ?? {};
  const experiment = experiments[experimentId];
  if (!experiment) {
    return { error: `Experiment ${experimentId} not found. Call configure_experiment first.` };
  }

  experiment.status = 'proposed';
  experiment.rationale = args.rationale;
  experiment.expectedMetrics = args.expectedMetrics;
  experiment.risks = args.risks;
  experiment.alternatives = args.alternatives;
  experiment.updatedAt = new Date().toISOString();

  run.metadata = { ...run.metadata, experiments };

  return {
    output: {
      experimentId,
      status: 'proposed',
      rationale: args.rationale,
      expectedMetrics: args.expectedMetrics ?? {},
      risks: (args.risks as string[]) ?? [],
      alternatives: args.alternatives ?? [],
      message: `Training plan proposed for experiment "${experiment.experimentName as string}". Awaiting approval.`
    }
  };
};
