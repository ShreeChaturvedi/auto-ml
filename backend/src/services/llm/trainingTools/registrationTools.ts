import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';

import { env } from '../../../config.js';
import { appLogger } from '../../../logging/logger.js';
import { createModelRepository } from '../../../repositories/modelRepository.js';
import type { DatasetProfileColumn } from '../../../types/dataset.js';
import type { ModelArtifact, ModelTaskType } from '../../../types/model.js';
import { runEvaluation } from '../../evaluationService.js';
import { resolveModelTemplateId } from '../../modelTemplates.js';
import {
  extractSuccessfulRuntimeDependenciesFromHistory,
  inferRuntimeDependenciesFromModelType,
  normalizeRuntimeDependencies,
} from '../../runtimeDependencies.js';
import { nowIso } from '../preprocessingTools/helpers.js';

import { resolveExperiment } from './types.js';
import type { TrainingToolContext, TrainingToolHandler, TrainingToolResult } from './types.js';
import {
  extractWorkflowPrepSegmentsFromToolCalls,
  normalizeWorkflowPrepSegments,
} from './workflowPrepSegments.js';

const modelRepository = createModelRepository(env.modelMetadataPath);

/**
 * Resolve an LLM-supplied artifactPath against the project's execution
 * workspace, guarding against path-traversal escapes. The LLM is expected
 * to write the model artifact with a relative filename (per the training
 * contract); we resolve it against `executionWorkspaceDir/{projectId}` and
 * verify the resulting path stays inside that workspace.
 *
 * Returns the absolute resolved path, or throws a descriptive error that
 * the tool handler surfaces to the LLM so it can retry its code cell.
 */
async function resolveWorkspaceArtifactPath(projectId: string, artifactPath: string): Promise<string> {
  if (!artifactPath.trim()) {
    throw new Error('artifactPath is empty. The training code must save a model file (e.g. joblib.dump(model, "model.joblib")) and pass the relative filename as artifactPath.');
  }
  if (isAbsolute(artifactPath)) {
    throw new Error(`artifactPath "${artifactPath}" must be a relative path inside the project workspace (e.g. "model.joblib"), not an absolute path.`);
  }
  const workspaceRoot = resolve(env.executionWorkspaceDir, projectId);
  const resolved = resolve(workspaceRoot, artifactPath);
  // Ensure the resolved path is a descendant of the workspace root; reject
  // any `..` escape before we touch the filesystem.
  const rootWithSep = workspaceRoot.endsWith(sep) ? workspaceRoot : `${workspaceRoot}${sep}`;
  if (resolved !== workspaceRoot && !resolved.startsWith(rootWithSep)) {
    throw new Error(`artifactPath "${artifactPath}" resolves outside the project workspace and was rejected for safety.`);
  }

  // Check the project root first.
  try {
    await stat(resolved);
    return resolved;
  } catch { /* not at project root — fall through to session search */ }

  // The execution service creates session-scoped workspaces at
  // `{executionWorkspaceDir}/{projectId}/{sessionId}/`. Files written by
  // run_cell land inside the session directory, not at the project root.
  // Search session subdirectories for the artifact.
  const normalizedRelativePath = artifactPath.replace(/^\.\/+/, '');
  const filename = normalizedRelativePath.split('/').pop()!;
  try {
    const entries = await readdir(workspaceRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'datasets') continue;
      const sessionRoot = join(workspaceRoot, entry.name);
      const candidateWithRelativePath = join(sessionRoot, normalizedRelativePath);
      try {
        await stat(candidateWithRelativePath);
        return candidateWithRelativePath;
      } catch { /* not in this session dir */ }

      if (normalizedRelativePath !== filename) {
        const candidateWithFilename = join(sessionRoot, filename);
        try {
          await stat(candidateWithFilename);
          return candidateWithFilename;
        } catch { /* not in this session dir */ }
      }
    }
  } catch { /* workspace root doesn't exist or can't be read */ }

  // Return the original resolved path — the caller's stat will produce
  // the ENOENT error with a clear message.
  return resolved;
}

/**
 * Copy a model artifact from the (ephemeral) workspace to its permanent
 * storage location under `modelStorageDir/{modelId}/model.joblib`. Returns
 * the permanent path plus the real file size read from disk.
 *
 * Matches the pattern used by the non-LLM `modelTraining.ts:306-315` path.
 * Without this step, the model record stores a dead sandbox path that
 * `runEvaluation` later fails to open.
 */
async function persistArtifactToPermanentStorage(
  resolvedSourcePath: string,
  modelId: string
): Promise<{ path: string; size: number; filename: string }> {
  const sourceStat = await stat(resolvedSourcePath);
  if (!sourceStat.isFile()) {
    throw new Error(`artifactPath "${resolvedSourcePath}" is not a regular file.`);
  }
  const storageDir = join(env.modelStorageDir, modelId);
  await mkdir(storageDir, { recursive: true });
  const permanentPath = join(storageDir, 'model.joblib');
  await copyFile(resolvedSourcePath, permanentPath);
  const permanentStat = await stat(permanentPath);
  return {
    path: permanentPath,
    size: permanentStat.size,
    filename: 'model.joblib'
  };
}

/** Best-effort task type inference from experiment metadata. */
function normalizeMetricsRecord(metrics: unknown): Record<string, number> {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    return {};
  }

  const normalized: Record<string, number> = {};
  for (const [key, value] of Object.entries(metrics as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      normalized[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        normalized[key] = parsed;
      }
    }
  }
  return normalized;
}

function resolveRegistrationMetrics(
  explicitMetrics: unknown,
  experiment: Record<string, unknown>
): Record<string, number> {
  const direct = normalizeMetricsRecord(explicitMetrics);
  if (Object.keys(direct).length > 0) {
    return direct;
  }

  const evaluated = normalizeMetricsRecord(experiment.evaluationMetrics);
  if (Object.keys(evaluated).length > 0) {
    return evaluated;
  }

  return normalizeMetricsRecord(experiment.trainingMetrics);
}

// Threshold above which a numeric target column is treated as continuous
// regression rather than categorical classification. Low-cardinality
// integers (e.g., 1-5 rating, 0-10 class IDs) stay ambiguous so the LLM
// must declare intent explicitly.
const CLASSIFICATION_MAX_UNIQUE = 20;
const BINARY_VALUE_MARKERS = new Set(['0', '1', 'true', 'false', '0.0', '1.0']);

export type TaskTypeInferenceVerdict = {
  taskType: ModelTaskType | 'ambiguous';
  reason: string;
};

/** Task-type inference from a target column's statistical profile. */
export function inferTaskTypeFromTargetProfile(
  column: DatasetProfileColumn | null | undefined,
): TaskTypeInferenceVerdict {
  if (!column) {
    return { taskType: 'ambiguous', reason: 'target column profile unavailable' };
  }

  if (column.dtype === 'string') {
    return { taskType: 'classification', reason: 'string/categorical dtype' };
  }
  if (column.dtype === 'boolean') {
    return { taskType: 'classification', reason: 'boolean dtype' };
  }
  if (column.dtype === 'date') {
    return { taskType: 'regression', reason: 'date dtype (time-series regression)' };
  }

  const unique = column.uniqueCount ?? 0;
  const topKeys = (column.topValues ?? []).map((entry) => String(entry.value).trim().toLowerCase());
  const isBinary01 = unique > 0 && unique <= 2 && topKeys.length > 0
    && topKeys.every((key) => BINARY_VALUE_MARKERS.has(key));
  if (isBinary01) {
    return { taskType: 'classification', reason: 'binary 0/1 target' };
  }

  if (column.dtype === 'integer' && unique > 0 && unique <= CLASSIFICATION_MAX_UNIQUE) {
    return {
      taskType: 'ambiguous',
      reason: `low-cardinality integer target (${unique} unique values) — could be ordinal classification or count regression`,
    };
  }

  if ((column.dtype === 'integer' || column.dtype === 'float') && unique > CLASSIFICATION_MAX_UNIQUE) {
    return {
      taskType: 'regression',
      reason: `continuous ${column.dtype} target with ${unique} unique values`,
    };
  }

  if (column.dtype === 'float') {
    return {
      taskType: 'regression',
      reason: 'float target (default to regression unless binary 0/1)',
    };
  }

  return { taskType: 'ambiguous', reason: 'numeric target with insufficient signal for auto-detection' };
}

export function formatTargetProfileForPrompt(
  column: DatasetProfileColumn | null | undefined,
): string | null {
  if (!column) return null;
  const verdict = inferTaskTypeFromTargetProfile(column);
  const parts = [`${column.name} (${column.dtype})`];
  if (typeof column.uniqueCount === 'number') {
    parts.push(`${column.uniqueCount.toLocaleString('en-US')} unique values`);
  }
  if (typeof column.min === 'number' && typeof column.max === 'number') {
    parts.push(`range [${column.min}, ${column.max}]`);
  }
  parts.push(`inferred task type: ${verdict.taskType} (${verdict.reason})`);
  return `Target profile: ${parts.join(' — ')}`;
}

function detectTaskTypeFromMetrics(metrics: Record<string, number>): ModelTaskType | undefined {
  const keys = new Set(Object.keys(metrics).map((key) => key.toLowerCase()));
  if (keys.has('silhouette') || keys.has('davies_bouldin') || keys.has('calinski_harabasz')) {
    return 'clustering';
  }
  if (
    keys.has('accuracy')
    || keys.has('precision')
    || keys.has('recall')
    || keys.has('f1')
    || keys.has('roc_auc')
    || keys.has('auc')
  ) {
    return 'classification';
  }
  if (
    keys.has('rmse')
    || keys.has('mae')
    || keys.has('mse')
    || keys.has('r2')
    || keys.has('mape')
  ) {
    return 'regression';
  }
  return undefined;
}

function isModelTaskType(value: unknown): value is ModelTaskType {
  return value === 'classification' || value === 'regression' || value === 'clustering';
}

/** Best-effort task type inference from experiment metadata + metrics. */
function inferTaskType(
  experiment: Record<string, unknown>,
  explicitModelType: string | undefined,
  metrics: Record<string, number>
): ModelTaskType {
  // 1. Trust the value configure_experiment already stored (authoritative —
  //    validated against the target column profile at the time of the call).
  const storedTaskType = experiment.taskType;
  if (isModelTaskType(storedTaskType)) {
    return storedTaskType;
  }

  const modelType = String(
    explicitModelType
    ?? experiment.modelType
    ?? experiment.registeredModelType
    ?? ''
  ).toLowerCase();

  // 2. Narrow regex on explicit classifier/regressor/clusterer model suffixes.
  //    Classification rules come first so "logistic_regression" is not
  //    mis-routed to regression by the trailing "regression" token.
  if (/classif|classifier|logistic|svc|svm|naive_bayes|knn/.test(modelType)) return 'classification';
  if (/cluster|kmeans|dbscan|hierarch|gmm|gaussian_mixture|birch/.test(modelType)) return 'clustering';
  if (/regress|regressor|svr|ridge|lasso|elastic/.test(modelType)) return 'regression';

  // 3. Target column profile — authoritative for ambiguous bare model names
  //    like "catboost", "xgboost", "lightgbm" where the suffix is missing.
  const targetColumnProfile = experiment.targetColumnProfile;
  if (targetColumnProfile && typeof targetColumnProfile === 'object') {
    const verdict = inferTaskTypeFromTargetProfile(targetColumnProfile as DatasetProfileColumn);
    if (verdict.taskType !== 'ambiguous') {
      return verdict.taskType;
    }
  }

  // 4. Metrics keys as a last hint.
  const inferredFromMetrics = detectTaskTypeFromMetrics(metrics);
  if (inferredFromMetrics) {
    return inferredFromMetrics;
  }

  // 5. Supervised training with no signal: default to classification.
  return 'classification';
}

export const registerModel: TrainingToolHandler = async (
  ctx: TrainingToolContext
): Promise<TrainingToolResult> => {
  const { args, run, projectId, datasetId } = ctx;

  // Prefer the dataset the training run actually fit on, not the
  // upload dataset the client passed in. Preprocessing commits update
  // `run.activeDatasetId` to the latest derived dataset — that's the
  // file the training cell's `pd.read_csv(FILENAME)` loaded from. If we
  // persist the original upload id here, evaluation later reads the raw
  // CSV and `pipeline.predict(X_test)` crashes with "columns are
  // missing" because the fitted ColumnTransformer expects the one-hot
  // encoded schema. Issue #342.
  const trainedDatasetId = run.activeDatasetId ?? datasetId;

  const resolved = resolveExperiment(run, args);
  if ('error' in resolved) return resolved;
  const { experiment } = resolved;

  // Persist to model repository so the model appears in the Experiments leaderboard
  const metricsRecord = resolveRegistrationMetrics(args.metrics, experiment);
  if (Object.keys(metricsRecord).length === 0) {
    return {
      error: 'register_model requires non-empty numeric metrics. Call evaluate_results with real metrics (accuracy/F1 or RMSE/MAE/R2) and then retry register_model.'
    };
  }

  const hyperparameters = (args.hyperparameters && typeof args.hyperparameters === 'object'
    ? args.hyperparameters
    : {}) as Record<string, unknown>;
  const featureColumns = Array.isArray(experiment.featureColumns)
    ? experiment.featureColumns.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : undefined;
  const workflowPrepSegments = (() => {
    const stored = normalizeWorkflowPrepSegments(experiment.workflowPrepSegments);
    if (stored.length > 0) {
      return stored;
    }
    const cellIds = Array.isArray(experiment.trainingCellIds)
      ? experiment.trainingCellIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : null;
    const history = (run.metadata as { history?: unknown } | undefined)?.history as { toolCalls?: unknown[] } | undefined;
    return extractWorkflowPrepSegmentsFromToolCalls(history?.toolCalls, String(experiment.experimentId ?? ''), cellIds);
  })();
  const modelName = typeof args.modelName === 'string' ? args.modelName : 'Untitled Model';
  const modelType = typeof args.modelType === 'string' ? args.modelType : 'unknown';
  const runtimeDependencies = (() => {
    const stored = normalizeRuntimeDependencies(experiment.runtimeDependencies);
    const history = (run.metadata as { history?: unknown } | undefined)?.history as {
      toolCalls?: unknown[];
      toolResults?: unknown[];
    } | undefined;
    const installed = extractSuccessfulRuntimeDependenciesFromHistory(
      history?.toolCalls,
      history?.toolResults,
    );
    const inferred = inferRuntimeDependenciesFromModelType(modelType);
    return normalizeRuntimeDependencies([...stored, ...installed, ...inferred]);
  })();
  const taskType = inferTaskType(experiment, modelType, metricsRecord);
  const artifactPath = typeof args.artifactPath === 'string' ? args.artifactPath.trim() : '';
  if (!artifactPath) {
    return {
      error: 'register_model requires artifactPath. Save the trained model first (e.g. joblib.dump(model, "model.joblib")) and pass artifactPath: "model.joblib".'
    };
  }

  // Resolve & copy the artifact BEFORE creating the model record. If the LLM
  // supplied a missing or unsafe path we return an error to the tool caller
  // so the LLM can retry its write/save code cell instead of persisting a
  // record that points at a file the evaluation service cannot read.
  //
  // Without this, the non-LLM path at modelTraining.ts:306-315 creates a
  // permanent copy under modelStorageDir/{modelId}/model.joblib, but the LLM
  // path used to skip the copy entirely — storing whatever string the LLM
  // hallucinated as the artifact path, with `size: 0`. That's why
  // backend/storage/models/metadata.json has been empty (no evaluations ever
  // populated) even on projects where register_model was called.
  let resolvedSourcePath: string;
  try {
    resolvedSourcePath = await resolveWorkspaceArtifactPath(projectId, artifactPath);
    await stat(resolvedSourcePath);
  } catch (err) {
    return {
      error: `register_model could not locate the model artifact: ${
        err instanceof Error ? err.message : String(err)
      }`
    };
  }

  let artifact: ModelArtifact | undefined;
  try {
    const resolvedTemplateId = resolveModelTemplateId(modelType, taskType) ?? `llm-${modelType}`;
    const record = await modelRepository.create({
      projectId,
      datasetId: trainedDatasetId ?? '',
      name: modelName,
      templateId: resolvedTemplateId,
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
      featureColumns,
      // Artifact is populated after the permanent copy succeeds below.
      evaluationStatus: 'pending',
      metadata: {
        workflowRunId: run.runId,
        experimentId: experiment.experimentId,
        source: 'llm-workflow',
        tags: args.tags ?? [],
        ...(workflowPrepSegments.length > 0 ? { workflowPrepSegments } : {}),
        ...(runtimeDependencies.length > 0 ? { runtimeDependencies } : {}),
      }
    });

    // Now that we have a modelId, copy the sandbox artifact into its
    // permanent home and update the record with the real path + file size.
    try {
      artifact = await persistArtifactToPermanentStorage(resolvedSourcePath, record.modelId);
      const resolvedArtifact = artifact;
      await modelRepository.update(record.modelId, (current) => ({
        ...current,
        artifact: resolvedArtifact
      }));
      experiment.artifactPath = artifact.path;
    } catch (copyErr) {
      appLogger.error('[registerModel] Failed to persist artifact to permanent storage', {
        modelId: record.modelId,
        sourcePath: resolvedSourcePath,
        error: copyErr
      });
      // Roll back the bare model record so we don't leave dangling rows
      // pointing at a non-existent artifact. runEvaluation would fail
      // on the stale path and the user would see a confusing model in
      // the Experiments tab that cannot be inspected.
      await modelRepository.delete(record.modelId).catch(() => undefined);
      return {
        error: `register_model created the model record but failed to copy the artifact: ${
          copyErr instanceof Error ? copyErr.message : String(copyErr)
        }`
      };
    }

    experiment.persistedModelId = record.modelId;
    experiment.status = 'registered';
    experiment.registeredModelName = modelName;
    experiment.modelType = modelType;
    experiment.registeredModelType = modelType;
    experiment.registeredHyperparameters = hyperparameters;
    experiment.registeredMetrics = metricsRecord;
    experiment.artifactPath = artifact.path;
    experiment.tags = args.tags;
    if (runtimeDependencies.length > 0) {
      experiment.runtimeDependencies = runtimeDependencies;
    }
    experiment.updatedAt = nowIso();

    // Fire-and-forget evaluation so the model gets eval metrics like the direct API path.
    // Failures are recorded on the model row via evaluationError column so the
    // Experiments tab can surface them without blocking the training turn.
    runEvaluation(record.modelId).catch(err =>
      appLogger.error('[registerModel] Background evaluation failed', { modelId: record.modelId, error: err })
    );
  } catch (err) {
    // Persistence failures now surface to the LLM (and through it, the
    // chat UI) instead of silently reporting success. See Step 2.
    appLogger.error('[registerModel] Failed to persist model', { err });
    return {
      error: `register_model failed to persist the model record: ${
        err instanceof Error ? err.message : String(err)
      }`
    };
  }

  return {
    output: {
      experimentId: experiment.experimentId,
      modelId: experiment.persistedModelId,
      modelName,
      modelType,
      taskType,
      status: 'registered',
      metrics: metricsRecord,
      tags: args.tags ?? [],
      artifactPath: artifact?.path,
      artifactSize: artifact?.size,
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

  const LOWER_IS_BETTER = new Set(['rmse', 'mse', 'mae', 'mape', 'log_loss', 'hinge_loss', 'cross_entropy', 'brier_score', 'loss', 'error']);
  const sortAscending = args.sortOrder === 'ascending' ||
    (args.sortOrder !== 'descending' && LOWER_IS_BETTER.has(primaryMetric.toLowerCase()));

  comparisonRows.sort((a, b) => {
    const fallback = sortAscending ? Infinity : -Infinity;
    const aVal = (a.primaryMetricValue as number) ?? fallback;
    const bVal = (b.primaryMetricValue as number) ?? fallback;
    return sortAscending ? aVal - bVal : bVal - aVal;
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
