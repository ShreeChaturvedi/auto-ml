import { randomUUID } from 'node:crypto';

import { env } from '../../../config.js';
import { appLogger } from '../../../logging/logger.js';
import { createProjectRepository } from '../../../repositories/projectRepository.js';
import { nowIso } from '../preprocessingTools/helpers.js';

import { resolveExperiment } from './types.js';
import type { TrainingToolContext, TrainingToolHandler, TrainingToolResult } from './types.js';

const MAX_EXPERIMENTS_PER_TURN = 3;

const projectRepository = createProjectRepository(env.storagePath);

/**
 * Load the list of enabled engineered feature names for a project. Used to
 * auto-populate `featureColumns` on configure_experiment when the LLM
 * omitted them, so models get trained on the engineered features produced
 * by the Feature Engineering phase — not the raw dataset columns. Without
 * this, a "successful" training run could silently use raw inputs while
 * reporting metrics against the FE-derived target (a correctness failure
 * that's invisible from the chat UI).
 */
async function loadEnabledFeatureNames(projectId: string): Promise<string[]> {
  try {
    const project = await projectRepository.getById(projectId);
    const features = project?.metadata?.features;
    if (!Array.isArray(features)) return [];
    return features
      .filter((f): f is { featureName?: unknown; enabled?: unknown } =>
        typeof f === 'object' && f !== null
      )
      .filter((f) => f.enabled !== false)
      .map((f) => (typeof f.featureName === 'string' ? f.featureName : null))
      .filter((name): name is string => Boolean(name && name.trim()));
  } catch (err) {
    appLogger.warn('[configureExperiment] Failed to load project features for auto-population', {
      projectId,
      error: err
    });
    return [];
  }
}

export const configureExperiment: TrainingToolHandler = async (
  ctx: TrainingToolContext
): Promise<TrainingToolResult> => {
  const { args, run, projectId, turn } = ctx;

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
  const requestedTargetColumn = typeof args.targetColumn === 'string' ? args.targetColumn.trim() : undefined;
  const selectedTargetColumn = typeof turn.targetColumn === 'string' && turn.targetColumn.trim().length > 0
    ? turn.targetColumn.trim()
    : undefined;
  const effectiveTargetColumn = selectedTargetColumn ?? requestedTargetColumn;

  if (selectedTargetColumn && requestedTargetColumn && selectedTargetColumn !== requestedTargetColumn) {
    return {
      error: `Selected target column is "${selectedTargetColumn}" but configure_experiment requested "${requestedTargetColumn}". Change the target dropdown or retry with the selected target.`
    };
  }

  // Enforce the Feature Engineering pipeline handoff. If the project has
  // enabled engineered features and the LLM didn't explicitly supply
  // `featureColumns`, default to the full set of FE feature names. If the
  // LLM supplied its own list we leave it alone — the user may have asked
  // for a specific subset, or the run may predate FE. The training contract
  // makes the stronger ask (must be a subset of the FE feature names when
  // FE features exist); this handler-level default makes the happy path
  // work even when the LLM forgets.
  const enabledFeatureNames = await loadEnabledFeatureNames(projectId);
  let featureColumns: string[] | undefined;
  if (Array.isArray(args.featureColumns)) {
    featureColumns = args.featureColumns as string[];
  } else if (enabledFeatureNames.length > 0) {
    featureColumns = enabledFeatureNames;
    appLogger.info('[configureExperiment] Auto-populated featureColumns from FE pipeline', {
      projectId,
      experimentId,
      featureCount: enabledFeatureNames.length
    });
  }

  const experiments = ((run.metadata?.experiments as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  experiments[experimentId] = {
    experimentId,
    experimentName,
    modelType,
    status: 'configured',
    hyperparameters: (args.hyperparameters && typeof args.hyperparameters === 'object' ? args.hyperparameters : {}) as Record<string, unknown>,
    splitStrategy,
    splitRatio: typeof args.splitRatio === 'number' ? args.splitRatio : 0.8,
    targetColumn: effectiveTargetColumn,
    featureColumns,
    randomSeed: typeof args.randomSeed === 'number' ? args.randomSeed : undefined,
    datasetId: turn.datasetId,
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
      targetColumn: effectiveTargetColumn,
      featureColumns,
      status: 'configured',
      message: `Experiment "${experimentName}" configured with ${modelType} model and ${splitStrategy} split strategy${
        featureColumns && featureColumns.length > 0
          ? ` across ${featureColumns.length} feature column${featureColumns.length === 1 ? '' : 's'}`
          : ''
      }${effectiveTargetColumn ? ` targeting ${effectiveTargetColumn}` : ''}.`
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
      // 'awaiting_approval' triggers the existing pause mechanism in
      // toolExecutor.ts via getApprovalPauseDetails/getToolResultPauseReason.
      // The turn ends here — user sees the proposal via StepProposalCard
      // and must send a follow-up message to continue. This replaces the
      // broken approach of asking the LLM to call render_ui (which
      // produced invisible output tokens with gpt-5.4).
      status: 'awaiting_approval',
      rationale: args.rationale,
      expectedMetrics: args.expectedMetrics ?? {},
      risks: Array.isArray(args.risks) ? args.risks : [],
      alternatives: args.alternatives ?? [],
      message: `Training plan proposed for experiment "${experiment.experimentName as string}". Awaiting approval.`
    }
  };
};
