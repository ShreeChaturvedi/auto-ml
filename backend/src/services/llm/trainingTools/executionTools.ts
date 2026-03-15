import type { TrainingToolContext, TrainingToolHandler, TrainingToolResult } from './types.js';

/**
 * execute_training — record training execution outcome from notebook cells.
 * Updates the experiment status based on success/failure.
 */
export const executeTraining: TrainingToolHandler = async (
  ctx: TrainingToolContext
): Promise<TrainingToolResult> => {
  const { args, run } = ctx;

  const experimentId = args.experimentId as string | undefined;
  if (!experimentId) {
    return { error: 'execute_training requires experimentId.' };
  }

  const experiments = (run.metadata?.experiments as Record<string, Record<string, unknown>>) ?? {};
  const experiment = experiments[experimentId];
  if (!experiment) {
    return { error: `Experiment ${experimentId} not found. Call configure_experiment first.` };
  }

  const succeeded = args.succeeded as boolean;

  experiment.status = succeeded ? 'training' : 'failed';
  experiment.trainingCellIds = args.cellIds;
  experiment.trainingMetrics = args.metrics;
  experiment.trainingDurationMs = args.trainingDurationMs;
  experiment.errorMessage = succeeded ? undefined : args.errorMessage;
  experiment.updatedAt = new Date().toISOString();

  run.metadata = { ...run.metadata, experiments };

  if (!succeeded) {
    return {
      output: {
        experimentId,
        status: 'failed',
        errorMessage: args.errorMessage ?? 'Training failed without a specific error message.',
        message: `Training failed for experiment "${experiment.experimentName as string}".`
      }
    };
  }

  return {
    output: {
      experimentId,
      status: 'training',
      metrics: args.metrics ?? {},
      trainingDurationMs: args.trainingDurationMs,
      cellIds: args.cellIds ?? [],
      message: `Training completed for experiment "${experiment.experimentName as string}". Proceed to evaluate_results.`
    }
  };
};

/**
 * evaluate_results — record evaluation metrics for a trained model.
 * Updates the experiment status to 'evaluated' and stores comprehensive metrics.
 */
export const evaluateResults: TrainingToolHandler = async (
  ctx: TrainingToolContext
): Promise<TrainingToolResult> => {
  const { args, run } = ctx;

  const experimentId = args.experimentId as string | undefined;
  if (!experimentId) {
    return { error: 'evaluate_results requires experimentId.' };
  }

  const experiments = (run.metadata?.experiments as Record<string, Record<string, unknown>>) ?? {};
  const experiment = experiments[experimentId];
  if (!experiment) {
    return { error: `Experiment ${experimentId} not found.` };
  }

  experiment.status = 'evaluated';
  experiment.evaluationMetrics = args.metrics;
  experiment.learningCurve = args.learningCurve;
  experiment.featureImportance = args.featureImportance;
  experiment.evaluationNotes = args.notes;
  experiment.updatedAt = new Date().toISOString();

  run.metadata = { ...run.metadata, experiments };

  return {
    output: {
      experimentId,
      status: 'evaluated',
      metrics: args.metrics,
      learningCurve: args.learningCurve ?? null,
      featureImportance: args.featureImportance ?? [],
      notes: args.notes ?? null,
      message: `Evaluation complete for experiment "${experiment.experimentName as string}". Review results before registering.`
    }
  };
};
