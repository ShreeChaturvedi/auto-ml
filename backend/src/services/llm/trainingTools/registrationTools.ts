import type { TrainingToolContext, TrainingToolHandler, TrainingToolResult } from './types.js';

/**
 * register_model — commit a trained model to the experiment registry.
 * Updates the experiment status to 'registered' and stores final metadata.
 */
export const registerModel: TrainingToolHandler = async (
  ctx: TrainingToolContext
): Promise<TrainingToolResult> => {
  const { args, run } = ctx;

  const experimentId = args.experimentId as string | undefined;
  if (!experimentId) {
    return { error: 'register_model requires experimentId.' };
  }

  const experiments = (run.metadata?.experiments as Record<string, Record<string, unknown>>) ?? {};
  const experiment = experiments[experimentId];
  if (!experiment) {
    return { error: `Experiment ${experimentId} not found.` };
  }

  experiment.status = 'registered';
  experiment.registeredModelName = args.modelName;
  experiment.registeredModelType = args.modelType;
  experiment.registeredMetrics = args.metrics;
  experiment.registeredHyperparameters = args.hyperparameters;
  experiment.artifactPath = args.artifactPath;
  experiment.tags = args.tags;
  experiment.updatedAt = new Date().toISOString();

  run.metadata = { ...run.metadata, experiments };

  return {
    output: {
      experimentId,
      modelName: args.modelName,
      modelType: args.modelType,
      status: 'registered',
      metrics: args.metrics,
      tags: args.tags ?? [],
      message: `Model "${args.modelName as string}" registered successfully for experiment ${experimentId}.`
    }
  };
};

/**
 * compare_models — side-by-side comparison of registered experiments.
 * Returns a comparison summary with rankings based on the primary metric.
 */
export const compareModels: TrainingToolHandler = async (
  ctx: TrainingToolContext
): Promise<TrainingToolResult> => {
  const { args, run } = ctx;

  const experimentIds = args.experimentIds as string[] | undefined;
  if (!experimentIds || experimentIds.length === 0) {
    return { error: 'compare_models requires at least one experimentId.' };
  }

  const primaryMetric = args.primaryMetric as string;
  if (!primaryMetric) {
    return { error: 'compare_models requires primaryMetric.' };
  }

  const experiments = (run.metadata?.experiments as Record<string, Record<string, unknown>>) ?? {};
  const includeHyperparameters = (args.includeHyperparameters as boolean) ?? false;

  const comparisonRows: Array<Record<string, unknown>> = [];
  const missingIds: string[] = [];

  for (const id of experimentIds) {
    const experiment = experiments[id];
    if (!experiment) {
      missingIds.push(id);
      continue;
    }

    const metrics = (experiment.evaluationMetrics ?? experiment.registeredMetrics ?? {}) as Record<string, unknown>;
    const row: Record<string, unknown> = {
      experimentId: id,
      experimentName: experiment.experimentName,
      modelType: experiment.modelType ?? experiment.registeredModelType,
      status: experiment.status,
      primaryMetricValue: metrics[primaryMetric] ?? null,
      metrics
    };

    if (includeHyperparameters) {
      row.hyperparameters = experiment.hyperparameters ?? experiment.registeredHyperparameters ?? {};
    }

    comparisonRows.push(row);
  }

  // Sort by primary metric descending (higher is better by default)
  comparisonRows.sort((a, b) => {
    const aVal = (a.primaryMetricValue as number) ?? -Infinity;
    const bVal = (b.primaryMetricValue as number) ?? -Infinity;
    return bVal - aVal;
  });

  // Add ranking
  comparisonRows.forEach((row, index) => {
    row.rank = index + 1;
  });

  return {
    output: {
      primaryMetric,
      comparison: comparisonRows,
      missingExperiments: missingIds,
      bestExperiment: comparisonRows[0]?.experimentId ?? null,
      message:
        comparisonRows.length > 0
          ? `Compared ${comparisonRows.length} models by ${primaryMetric}. Best: "${comparisonRows[0].experimentName as string}".`
          : 'No experiments found for comparison.'
    }
  };
};
