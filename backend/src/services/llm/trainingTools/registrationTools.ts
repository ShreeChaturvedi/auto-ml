import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';

import { env } from '../../../config.js';
import { appLogger } from '../../../logging/logger.js';
import { createModelRepository } from '../../../repositories/modelRepository.js';
import type { ModelArtifact, ModelTaskType } from '../../../types/model.js';
import { runEvaluation } from '../../evaluationService.js';
import { nowIso } from '../preprocessingTools/helpers.js';

import { resolveExperiment } from './types.js';
import type { TrainingToolContext, TrainingToolHandler, TrainingToolResult } from './types.js';

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

/** Best-effort task type inference from experiment metadata + metrics. */
function inferTaskType(
  experiment: Record<string, unknown>,
  explicitModelType: string | undefined,
  metrics: Record<string, number>
): ModelTaskType {
  const modelType = String(
    explicitModelType
    ?? experiment.modelType
    ?? experiment.registeredModelType
    ?? ''
  ).toLowerCase();

  // Classification checks come before regression so model types like
  // "logistic_regression" are not misclassified as regression.
  if (/classif|classifier|logistic|svc|svm|naive_bayes|knn/.test(modelType)) return 'classification';
  if (/cluster|kmeans|dbscan|hierarch|gmm|gaussian_mixture|birch/.test(modelType)) return 'clustering';
  if (/regress|regressor|svr|ridge|lasso|elastic/.test(modelType)) return 'regression';

  const inferredFromMetrics = detectTaskTypeFromMetrics(metrics);
  if (inferredFromMetrics) {
    return inferredFromMetrics;
  }

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
  const modelName = typeof args.modelName === 'string' ? args.modelName : 'Untitled Model';
  const modelType = typeof args.modelType === 'string' ? args.modelType : 'unknown';
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
      // Artifact is populated after the permanent copy succeeds below.
      evaluationStatus: 'pending',
      metadata: {
        experimentId: experiment.experimentId,
        source: 'llm-workflow',
        tags: args.tags ?? []
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
    experiment.registeredModelType = modelType;
    experiment.registeredHyperparameters = hyperparameters;
    experiment.registeredMetrics = metricsRecord;
    experiment.artifactPath = artifact.path;
    experiment.tags = args.tags;
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
