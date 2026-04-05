import { copyFile, mkdir, stat } from 'node:fs/promises';
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
function resolveWorkspaceArtifactPath(projectId: string, artifactPath: string): string {
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
  let resolvedSourcePath: string | undefined;
  if (typeof args.artifactPath === 'string') {
    try {
      resolvedSourcePath = resolveWorkspaceArtifactPath(projectId, args.artifactPath);
      await stat(resolvedSourcePath);
    } catch (err) {
      return {
        error: `register_model could not locate the model artifact: ${
          err instanceof Error ? err.message : String(err)
        }`
      };
    }
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
    if (resolvedSourcePath) {
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
    }

    experiment.persistedModelId = record.modelId;

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
      metrics: args.metrics,
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
