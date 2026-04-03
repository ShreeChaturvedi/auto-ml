/**
 * Tuning Service
 *
 * Builds and executes Optuna hyperparameter optimization scripts inside
 * Docker containers.  Results stream back as NDJSON so the frontend can
 * display real-time trial progress.
 */

import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { Response } from 'express';

import { env } from '../config.js';
import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import { appLogger } from '../logging/logger.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { createModelRepository } from '../repositories/modelRepository.js';
import {
  copyArtifactsToPermanentStorage,
  orchestrateContainerExecution,
} from '../utils/containerOrchestrator.js';

import { inferTargetColumn } from './modelSeedService.js';
import { getModelTemplate } from './modelTemplates.js';
import { resolveModelTestSize } from './modelTestSize.js';
export {
  buildTuningScript,
  isNegatedScorer,
  toSklearnScoring,
  type BuildTuningScriptOptions,
} from './tuningScriptBuilder.js';
import { buildTuningScript } from './tuningScriptBuilder.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const modelRepository = createModelRepository(env.modelMetadataPath);

const logger = appLogger.child({ service: 'tuningService' });

/* ------------------------------------------------------------------ */
/*  Orchestrator                                                       */
/* ------------------------------------------------------------------ */

function writeJsonLine(res: Response, obj: Record<string, unknown>): void {
  if (!res.writableEnded) {
    res.write(`${JSON.stringify(obj)}\n`);
  }
}

export async function runTuningStudy(
  projectId: string,
  modelId: string,
  nTrials: number,
  metric: string,
  timeoutSeconds: number,
  res: Response,
  options?: { sampler?: 'tpe' | 'random' },
): Promise<void> {
  try {
    // 1. Read source model + template
    const model = await modelRepository.getById(modelId);
    if (!model) {
      writeJsonLine(res, { type: 'error', message: 'Source model not found.' });
      res.end();
      return;
    }

    const template = getModelTemplate(model.templateId);
    if (!template) {
      writeJsonLine(res, { type: 'error', message: `Model template "${model.templateId}" not found.` });
      res.end();
      return;
    }

    if (template.taskType === 'clustering') {
      writeJsonLine(res, { type: 'error', message: 'Tuning is not supported for clustering models.' });
      res.end();
      return;
    }

    // 2. Get dataset
    const dataset = await datasetRepository.getById(model.datasetId);
    if (!dataset) {
      writeJsonLine(res, { type: 'error', message: 'Dataset not found.' });
      res.end();
      return;
    }

    // 3. Resolve target column — prefer model metadata if it exists in the dataset, else infer
    const datasetColumnNames = dataset.columns.map((c) => c.name);
    const modelTarget = model.targetColumn && datasetColumnNames.includes(model.targetColumn)
      ? model.targetColumn
      : undefined;
    const targetColumn = modelTarget
      ?? (dataset.columns.length > 0 ? inferTargetColumn(dataset.columns) : undefined);
    if (!targetColumn) {
      writeJsonLine(res, { type: 'error', message: 'Cannot determine target column for tuning.' });
      res.end();
      return;
    }

    // 4. Check for tunable parameters
    const tunableParams = template.parameters.filter(
      (p) => p.min !== undefined || p.options !== undefined || p.type === 'boolean'
    );
    if (tunableParams.length === 0) {
      writeJsonLine(res, { type: 'error', message: `Model "${template.name}" has no tunable hyperparameters.` });
      res.end();
      return;
    }

    // 5. Pre-compute workspace paths
    const workspacePath = join(env.executionWorkspaceDir, projectId, 'model-runtime');
    const tuningOutputDir = `/workspace/tuning/${modelId}`;
    const containerDatasetPath = `/workspace/datasets/${dataset.filename}`;
    const tuningTimeoutMs = Math.max(timeoutSeconds * 4, timeoutSeconds + 300) * 1000;
    const testSize = resolveModelTestSize(model);

    // 6. Orchestrate container execution with streaming callback
    const RELAY_TYPES = new Set(['trial_result', 'importance_update', 'convergence_update']);
    const { container, executionResult: result } = await orchestrateContainerExecution({
      projectId,
      pythonVersion: '3.11',
      scriptBuilder: () =>
        buildTuningScript({
          template,
          datasetPath: containerDatasetPath,
          targetColumn,
          testSize,
          nTrials,
          metric,
          timeoutSeconds,
          outputDir: tuningOutputDir,
          sampler: options?.sampler,
        }),
      filesToCopy: [],
      timeoutMs: tuningTimeoutMs,
      containerOutputDir: tuningOutputDir,
      onOutput: (output) => {
        // Each RichOutput of type 'text' may contain one or more JSON lines
        if (output.type !== 'text') return;
        const text = output.content;
        const textLines = text.split('\n').filter((l) => l.trim());
        for (const line of textLines) {
          try {
            const parsed = JSON.parse(line) as Record<string, unknown>;
            if (RELAY_TYPES.has(parsed.type as string)) {
              writeJsonLine(res, parsed);
            }
            // Ignore 'done' here — we emit our own done event below
          } catch {
            // Not JSON — skip
          }
        }
      },
    });

    // 6. On success — register the best model as a new ModelRecord
    const workspaceOutputDir = join(workspacePath, 'tuning', modelId);
    const summaryPath = join(workspaceOutputDir, 'tuning_summary.json');

    if (result.status === 'success') {
      const summaryRaw = await readFile(summaryPath, 'utf8');
      const summary = JSON.parse(summaryRaw) as {
        best_params: Record<string, unknown>;
        best_value: number;
        best_trial_number: number;
        optimization_history: { trial_numbers: number[]; values: number[]; best_values: number[] };
        param_importances: { params?: string[]; importances?: number[] };
      };

      // Create new model ID and copy artifacts to permanent storage
      const newModelId = `${modelId}-tuned-${Date.now()}`;
      await copyArtifactsToPermanentStorage(newModelId, container, [
        { workspace: `tuning/${modelId}/model.joblib`, permanent: 'model.joblib' },
        { workspace: `tuning/${modelId}/tuning_summary.json`, permanent: 'tuning_summary.json' },
      ]);

      // Get artifact size for storage metadata
      const storedModelPath = join(env.modelStorageDir, newModelId, 'model.joblib');
      const artifactStat = await stat(storedModelPath);

      const dateTag = new Date().toISOString().slice(0, 10);
      const newRecord = await modelRepository.create({
        projectId,
        datasetId: model.datasetId,
        name: `${model.name} (tuned · ${dateTag})`,
        templateId: model.templateId,
        taskType: template.taskType,
        library: template.library,
        algorithm: template.modelClass,
        parameters: summary.best_params,
        metrics: { [metric]: summary.best_value },
        status: 'completed',
        trainingMs: result.executionMs,
        targetColumn,
        featureColumns: model.featureColumns,
        sampleCount: model.sampleCount,
        artifact: {
          filename: 'model.joblib',
          path: storedModelPath,
          size: artifactStat.size,
        },
        metadata: {
          tuning: {
            sourceModelId: modelId,
            nTrials,
            metric,
            bestTrialNumber: summary.best_trial_number,
            optimizationHistory: summary.optimization_history,
            paramImportances: summary.param_importances,
          },
        },
      });

      writeJsonLine(res, { type: 'done', resultModelId: newRecord.modelId });

      // Cleanup workspace tuning dir
      await rm(workspaceOutputDir, { recursive: true, force: true }).catch(() => undefined);
    } else {
      const errorMsg = result.stderr || result.error || 'Tuning study failed.';
      writeJsonLine(res, { type: 'error', message: errorMsg });
    }

    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Tuning study failed', { projectId, modelId, error: message });
    writeJsonLine(res, { type: 'error', message });
    res.end();
  }
}

/**
 * Delete all tuning study rows that reference a given model ID
 * (as source or result). Called when a model is deleted to prevent orphans.
 */
export async function deleteTuningStudiesByModelId(modelId: string): Promise<number> {
  if (!hasDatabaseConfiguration()) return 0;
  const pool = getDbPool();
  const result = await pool.query(
    'DELETE FROM tuning_studies WHERE source_model_id = $1 OR result_model_id = $1',
    [modelId],
  );
  return result.rowCount ?? 0;
}
