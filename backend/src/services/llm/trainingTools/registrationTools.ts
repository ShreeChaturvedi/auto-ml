import { env } from '../../../config.js';
import { appLogger } from '../../../logging/logger.js';
import { createModelRepository } from '../../../repositories/modelRepository.js';
import type { ModelTaskType } from '../../../types/model.js';
import { nowIso } from '../preprocessingTools/helpers.js';

import { resolveExperiment } from './types.js';
import type { TrainingToolContext, TrainingToolHandler, TrainingToolResult } from './types.js';

const modelRepository = createModelRepository(env.modelMetadataPath);

/** Best-effort task type inference from experiment metadata. */
function inferTaskType(experiment: Record<string, unknown>): ModelTaskType {
  const modelType = String(experiment.modelType ?? experiment.registeredModelType ?? '').toLowerCase();
  if (/cluster|kmeans|dbscan/.test(modelType)) return 'clustering';
  if (/regress|svr|ridge|lasso|elastic/.test(modelType)) return 'regression';
  // If a target column is set, it's supervised; default to classification.
  return 'classification';
}

export const registerModel: TrainingToolHandler = async (
  ctx: TrainingToolContext
): Promise<TrainingToolResult> => {
  const { args, run, projectId, datasetId } = ctx;

  const resolved = resolveExperiment(run, args);
  if ('error' in resolved) return resolved;
  const { experiment } = resolved;

  experiment.status = 'registered';
  experiment.registeredModelName = args.modelName;
  experiment.registeredModelType = args.modelType;
  experiment.registeredMetrics = args.metrics;
  experiment.registeredHyperparameters = args.hyperparameters;
  experiment.artifactPath = args.artifactPath;
  experiment.tags = args.tags;
  experiment.updatedAt = nowIso();

  // Persist to model repository so the model appears in the Experiments leaderboard
  const metricsRecord = (args.metrics && typeof args.metrics === 'object'
    ? args.metrics
    : {}) as Record<string, number>;
  const hyperparameters = (args.hyperparameters && typeof args.hyperparameters === 'object'
    ? args.hyperparameters
    : {}) as Record<string, unknown>;
  const modelName = typeof args.modelName === 'string' ? args.modelName : 'Untitled Model';
  const modelType = typeof args.modelType === 'string' ? args.modelType : 'unknown';
  const taskType = inferTaskType(experiment);

  try {
    const record = await modelRepository.create({
      projectId,
      datasetId: datasetId ?? '',
      name: modelName,
      templateId: `llm-${modelType}`,
      taskType,
      library: 'llm-guided',
      algorithm: modelType,
      parameters: hyperparameters,
      metrics: metricsRecord,
      status: 'completed',
      trainingMs: typeof experiment.trainingDurationMs === 'number'
        ? experiment.trainingDurationMs
        : undefined,
      targetColumn: typeof experiment.targetColumn === 'string'
        ? experiment.targetColumn
        : undefined,
      metadata: {
        experimentId: experiment.experimentId,
        source: 'llm-workflow',
        tags: args.tags ?? []
      }
    });

    experiment.persistedModelId = record.modelId;
  } catch (err) {
    appLogger.error('[registerModel] Failed to persist model', { err });
    // Don't block the LLM workflow — the in-memory state is still updated
  }

  return {
    output: {
      experimentId: experiment.experimentId,
      modelName,
      modelType,
      status: 'registered',
      metrics: args.metrics,
      tags: args.tags ?? [],
      message: `Model "${modelName}" registered successfully for experiment ${experiment.experimentId as string}.`
    }
  };
};

export const compareModels: TrainingToolHandler = async (
  ctx: TrainingToolContext
): Promise<TrainingToolResult> => {
  const { args, run } = ctx;

  const experimentIds = Array.isArray(args.experimentIds) ? args.experimentIds as string[] : undefined;
  if (!experimentIds || experimentIds.length === 0) {
    return { error: 'compare_models requires at least one experimentId.' };
  }

  const primaryMetric = typeof args.primaryMetric === 'string' ? args.primaryMetric : undefined;
  if (!primaryMetric) {
    return { error: 'compare_models requires primaryMetric.' };
  }

  const experiments = (run.metadata?.experiments as Record<string, Record<string, unknown>>) ?? {};
  const includeHyperparameters = args.includeHyperparameters === true;

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

  comparisonRows.sort((a, b) => {
    const aVal = (a.primaryMetricValue as number) ?? -Infinity;
    const bVal = (b.primaryMetricValue as number) ?? -Infinity;
    return bVal - aVal;
  });

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
