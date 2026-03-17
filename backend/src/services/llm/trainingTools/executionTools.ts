import { nowIso } from '../preprocessingTools/helpers.js';

import { resolveExperiment } from './types.js';
import type { TrainingToolContext, TrainingToolHandler, TrainingToolResult } from './types.js';

export const executeTraining: TrainingToolHandler = async (
  ctx: TrainingToolContext
): Promise<TrainingToolResult> => {
  const { args, run } = ctx;

  const resolved = resolveExperiment(run, args);
  if ('error' in resolved) return resolved;
  const { experiment } = resolved;

  const succeeded = args.succeeded === true;

  experiment.status = succeeded ? 'training' : 'failed';
  experiment.trainingCellIds = args.cellIds;
  experiment.trainingMetrics = args.metrics;
  experiment.trainingDurationMs = args.trainingDurationMs;
  experiment.errorMessage = succeeded ? undefined : args.errorMessage;
  experiment.updatedAt = nowIso();

  if (!succeeded) {
    return {
      output: {
        experimentId: experiment.experimentId,
        status: 'failed',
        errorMessage: args.errorMessage ?? 'Training failed without a specific error message.',
        message: `Training failed for experiment "${experiment.experimentName as string}".`
      }
    };
  }

  return {
    output: {
      experimentId: experiment.experimentId,
      status: 'training',
      metrics: args.metrics ?? {},
      trainingDurationMs: args.trainingDurationMs,
      cellIds: args.cellIds ?? [],
      message: `Training completed for experiment "${experiment.experimentName as string}". Proceed to evaluate_results.`
    }
  };
};

export const evaluateResults: TrainingToolHandler = async (
  ctx: TrainingToolContext
): Promise<TrainingToolResult> => {
  const { args, run } = ctx;

  const resolved = resolveExperiment(run, args);
  if ('error' in resolved) return resolved;
  const { experiment } = resolved;

  experiment.status = 'evaluated';
  experiment.evaluationMetrics = args.metrics;
  experiment.learningCurve = args.learningCurve;
  experiment.featureImportance = args.featureImportance;
  experiment.evaluationNotes = args.notes;
  experiment.updatedAt = nowIso();

  return {
    output: {
      experimentId: experiment.experimentId,
      status: 'evaluated',
      metrics: args.metrics,
      learningCurve: args.learningCurve ?? null,
      featureImportance: args.featureImportance ?? [],
      notes: args.notes ?? null,
      message: `Evaluation complete for experiment "${experiment.experimentName as string}". Review results before registering.`
    }
  };
};
