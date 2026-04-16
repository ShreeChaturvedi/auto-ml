import { randomUUID } from 'node:crypto';

import { env } from '../../../config.js';
import { appLogger } from '../../../logging/logger.js';
import { createDatasetRepository } from '../../../repositories/datasetRepository.js';
import { createProjectRepository } from '../../../repositories/projectRepository.js';
import type { ModelTaskType } from '../../../types/model.js';
import { inferSpecificModelType } from '../../runtimeDependencies.js';
import { nowIso } from '../preprocessingTools/helpers.js';

import { inferTaskTypeFromTargetProfile } from './registrationTools.js';
import { resolveExperiment } from './types.js';
import type { TrainingToolContext, TrainingToolHandler, TrainingToolResult } from './types.js';

const MAX_EXPERIMENTS_PER_TURN = 3;

const projectRepository = createProjectRepository(env.storagePath);
const datasetRepository = createDatasetRepository(env.datasetMetadataPath);

function normalizeTaskType(value: unknown): ModelTaskType | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'classification' || normalized === 'regression' || normalized === 'clustering') {
    return normalized;
  }
  return undefined;
}

function resolveConfiguredModelType(experimentName: string, requestedModelType: string): string {
  const trimmedRequested = requestedModelType.trim();
  const canonicalRequested = inferSpecificModelType(trimmedRequested);
  if (canonicalRequested) {
    return canonicalRequested;
  }

  const isGenericNeuralRequest = /^(?:unknown|neural[-_ ]?network|deep[-_ ]?learning|nn)$/i.test(trimmedRequested);
  if (isGenericNeuralRequest) {
    const canonicalFromName = inferSpecificModelType(experimentName);
    if (canonicalFromName) {
      return canonicalFromName;
    }
  }

  return trimmedRequested || 'unknown';
}

function normalizeColumnName(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/g, '').replace(/[^a-z0-9]/g, '');
}

/**
 * Load the list of enabled engineered feature column names for a project.
 * The FE pipeline stores human-readable `featureName` (e.g., "Event Weekday")
 * but the actual dataset CSV columns are snake_case (e.g., "event_weekday").
 * This function cross-references with the dataset's real column names to
 * resolve the mismatch — so configure_experiment stores column names the
 * training code can actually reference in `df[col]`.
 */
async function loadEnabledFeatureNames(projectId: string, datasetId?: string): Promise<string[]> {
  try {
    const project = await projectRepository.getById(projectId);
    const features = project?.metadata?.features;
    if (!Array.isArray(features)) return [];
    const enabledHumanNames = features
      .filter((f): f is { featureName?: unknown; enabled?: unknown } =>
        typeof f === 'object' && f !== null
      )
      .filter((f) => f.enabled !== false)
      .map((f) => (typeof f.featureName === 'string' ? f.featureName : null))
      .filter((name): name is string => Boolean(name && name.trim()));

    if (enabledHumanNames.length === 0) return [];

    // Cross-reference with actual dataset columns to resolve name mismatches.
    // Build a normalized → actualName map from the dataset, then match each
    // FE featureName to the closest dataset column.
    if (datasetId) {
      try {
        const dataset = await datasetRepository.getById(datasetId);
        if (dataset?.columns && dataset.columns.length > 0) {
          const actualColumns = dataset.columns.map((col) => col.name);
          const normalizedMap = new Map<string, string>();
          for (const col of actualColumns) {
            normalizedMap.set(normalizeColumnName(col), col);
          }

          const resolved: string[] = [];
          for (const humanName of enabledHumanNames) {
            // Try exact match first
            if (actualColumns.includes(humanName)) {
              resolved.push(humanName);
              continue;
            }
            // Try normalized match (Event Weekday → eventweekday → event_weekday)
            const normalized = normalizeColumnName(humanName);
            const match = normalizedMap.get(normalized);
            if (match) {
              resolved.push(match);
              continue;
            }
            // Try substring/contains match: find any dataset column whose
            // normalized form contains the normalized human name or vice versa
            // (handles abbreviation gaps like "pct" in
            // "feature_adoption_pct_missing_flag" vs "Feature Adoption Missing Flag").
            let substringMatch: string | undefined;
            for (const [normCol, actualCol] of normalizedMap) {
              if (normCol.includes(normalized) || normalized.includes(normCol)) {
                substringMatch = actualCol;
                break;
              }
            }
            if (substringMatch) {
              resolved.push(substringMatch);
              continue;
            }
            // Fallback: keep the original name (may fail downstream, but
            // better than silently dropping it)
            resolved.push(humanName);
          }
          return resolved;
        }
      } catch {
        // Dataset lookup failed — fall through to returning raw names
      }
    }

    return enabledHumanNames;
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
  const requestedModelType = (typeof args.modelType === 'string' ? args.modelType : null) ?? 'unknown';
  const modelType = resolveConfiguredModelType(experimentName, requestedModelType);
  const modelTypeFromExperimentName = inferSpecificModelType(experimentName);
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

  if (modelTypeFromExperimentName && modelType !== modelTypeFromExperimentName) {
    return {
      error:
        `Experiment name "${experimentName}" implies modelType="${modelTypeFromExperimentName}" `
        + `but configure_experiment requested "${modelType}". Retry with modelType="${modelTypeFromExperimentName}" `
        + 'and do not substitute a proxy model.'
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
  const enabledFeatureNames = await loadEnabledFeatureNames(projectId, turn.datasetId ?? undefined);
  let featureColumns: string[] | undefined;
  if (Array.isArray(args.featureColumns)) {
    featureColumns = args.featureColumns as string[];
  } else if (enabledFeatureNames.length > 0) {
    // FE features exist. Use ALL dataset columns (minus target) as features,
    // not just the FE-produced columns — the FE pipeline adds derived columns
    // to the existing dataset, so training should use the full column set.
    const datasetProfile = turn.datasetId
      ? await datasetRepository.getById(turn.datasetId).catch(() => undefined)
      : undefined;
    if (datasetProfile?.columns && datasetProfile.columns.length > 0) {
      const targetCol = effectiveTargetColumn;
      featureColumns = datasetProfile.columns
        .map((col) => col.name)
        .filter((name) => name !== targetCol);
      appLogger.info('[configureExperiment] Auto-populated featureColumns from dataset columns (FE-derived dataset)', {
        projectId,
        experimentId,
        featureCount: featureColumns.length,
        feFeatureCount: enabledFeatureNames.length,
      });
    } else {
      featureColumns = enabledFeatureNames;
      appLogger.info('[configureExperiment] Auto-populated featureColumns from FE pipeline names', {
        projectId,
        experimentId,
        featureCount: enabledFeatureNames.length
      });
    }
  }

  // Resolve taskType against the target column's profile. The LLM may pass
  // taskType; we validate against the dataset profile so a classifier can't
  // land on a continuous target (or vice versa). If the LLM omitted it and
  // the profile is unambiguous, we fill it in here so registration and
  // evaluation downstream use a trustworthy value.
  const datasetProfile = turn.datasetId
    ? await datasetRepository.getById(turn.datasetId).catch(() => undefined)
    : undefined;
  const targetColumnProfile = effectiveTargetColumn && datasetProfile
    ? datasetProfile.columns.find((col) => col.name === effectiveTargetColumn) ?? null
    : null;
  const profileVerdict = inferTaskTypeFromTargetProfile(targetColumnProfile);
  const requestedTaskType = normalizeTaskType(args.taskType);
  const profileAvailable = Boolean(targetColumnProfile);
  let resolvedTaskType: ModelTaskType | undefined;

  if (profileAvailable && profileVerdict.taskType !== 'ambiguous') {
    if (requestedTaskType && requestedTaskType !== profileVerdict.taskType) {
      return {
        error:
          `configure_experiment taskType="${requestedTaskType}" contradicts the target column profile: `
          + `"${effectiveTargetColumn}" is ${profileVerdict.taskType} (${profileVerdict.reason}). `
          + `Retry with taskType="${profileVerdict.taskType}" and a ${profileVerdict.taskType}-compatible modelType.`
      };
    }
    resolvedTaskType = profileVerdict.taskType;
  } else if (requestedTaskType) {
    resolvedTaskType = requestedTaskType;
  } else {
    // Profile unavailable or ambiguous, and the LLM didn't declare taskType.
    // Leave unresolved; downstream inferTaskType at registerModel will fill
    // in from modelType regex + metrics. This keeps legacy flows unblocked.
    resolvedTaskType = undefined;
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
    taskType: resolvedTaskType,
    targetColumnProfile: targetColumnProfile ?? undefined,
    createdAt: now,
    updatedAt: now
  };

  run.metadata = { ...run.metadata, experiments };

  return {
    output: {
      experimentId,
      experimentName,
      modelType,
      taskType: resolvedTaskType,
      splitStrategy,
      targetColumn: effectiveTargetColumn,
      featureColumns,
      status: 'configured',
      message: `Experiment "${experimentName}" configured with ${modelType} model and ${splitStrategy} split strategy${
        featureColumns && featureColumns.length > 0
          ? ` across ${featureColumns.length} feature column${featureColumns.length === 1 ? '' : 's'}`
          : ''
      }${effectiveTargetColumn ? ` targeting ${effectiveTargetColumn}` : ''}${
        resolvedTaskType ? ` as a ${resolvedTaskType} task` : ''
      }.`
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
      experimentName: experiment.experimentName as string,
      modelType: experiment.modelType as string,
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
