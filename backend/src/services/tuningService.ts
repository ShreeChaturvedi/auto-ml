/**
 * Tuning Service
 *
 * Builds and executes Optuna hyperparameter optimization scripts inside
 * Docker containers.  Results stream back as NDJSON so the frontend can
 * display real-time trial progress.
 */

import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { Response } from 'express';

import { env } from '../config.js';
import { appLogger } from '../logging/logger.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { createModelRepository } from '../repositories/modelRepository.js';
import type { ModelTemplate, ModelTemplateParam } from '../types/model.js';

import { getOrCreateContainer } from './containerManager.js';
import { syncWorkspaceDatasets } from './executionWorkspace.js';
import * as kernelManager from './kernelManager.js';
import { getModelTemplate } from './modelTemplates.js';
import { buildPreprocessingLines, buildTrainTestSplitLines } from './pythonScriptUtils.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const modelRepository = createModelRepository(env.modelMetadataPath);

const logger = appLogger.child({ service: 'tuningService' });

/* ------------------------------------------------------------------ */
/*  Script generation                                                  */
/* ------------------------------------------------------------------ */

export interface BuildTuningScriptOptions {
  template: ModelTemplate;
  datasetPath: string;
  targetColumn: string;
  testSize: number;
  nTrials: number;
  metric: string;
  timeoutSeconds: number;
  outputDir: string;
}

/**
 * Generate the suggest call for a single parameter.
 */
function suggestLine(param: ModelTemplateParam): string {
  const key = param.key;

  if (param.type === 'select') {
    const values = (param.options ?? []).map((o) => JSON.stringify(o.value)).join(', ');
    return `    ${JSON.stringify(key)}: trial.suggest_categorical(${JSON.stringify(key)}, [${values}])`;
  }

  if (param.type === 'boolean') {
    return `    ${JSON.stringify(key)}: trial.suggest_categorical(${JSON.stringify(key)}, [True, False])`;
  }

  // type === 'number'
  const min = param.min ?? 0;
  const max = param.max ?? 100;
  const defaultVal = param.default;
  const isInt =
    Number.isInteger(defaultVal) &&
    Number.isInteger(min) &&
    Number.isInteger(max) &&
    (param.step === undefined || Number.isInteger(param.step));

  if (isInt) {
    return `    ${JSON.stringify(key)}: trial.suggest_int(${JSON.stringify(key)}, ${min}, ${max})`;
  }

  // Float — use log scale when the ratio is large (> 100)
  const useLog = min > 0 && max / min > 100;
  if (useLog) {
    return `    ${JSON.stringify(key)}: trial.suggest_float(${JSON.stringify(key)}, ${min}, ${max}, log=True)`;
  }
  return `    ${JSON.stringify(key)}: trial.suggest_float(${JSON.stringify(key)}, ${min}, ${max})`;
}

/**
 * Build a complete Python script that runs an Optuna hyperparameter study.
 */
export function buildTuningScript(options: BuildTuningScriptOptions): string {
  const {
    template,
    datasetPath,
    targetColumn,
    testSize,
    nTrials,
    metric,
    timeoutSeconds,
    outputDir,
  } = options;

  const lines: string[] = [];

  // ── Imports ──
  lines.push('import json');
  lines.push('import sys');
  lines.push('import os');
  lines.push('import numpy as np');
  lines.push('import pandas as pd');
  lines.push('import joblib');
  lines.push('import optuna');
  lines.push('from sklearn.model_selection import train_test_split, cross_val_score');
  lines.push(`from ${template.importPath} import ${template.modelClass}`);
  lines.push('');

  // ── Suppress Optuna default logging (we stream our own) ──
  lines.push('optuna.logging.set_verbosity(optuna.logging.WARNING)');
  lines.push('');

  // ── Load dataset ──
  lines.push(`dataset_path = ${JSON.stringify(datasetPath)}`);
  lines.push('df = pd.read_csv(dataset_path)');
  lines.push('');

  // ── Preprocessing (same as training) ──
  lines.push(...buildPreprocessingLines({
    targetColumn,
    validateColumnExists: true,
  }));
  lines.push('');

  // ── Train/test split ──
  lines.push(...buildTrainTestSplitLines({ taskType: template.taskType, testSize }));
  lines.push('');

  // ── Objective ──
  lines.push('def objective(trial):');

  // Build param suggestions
  const tunable = template.parameters.filter(
    (p) => p.min !== undefined || p.options !== undefined || p.type === 'boolean'
  );

  if (tunable.length > 0) {
    lines.push('    params = {');
    lines.push(tunable.map(suggestLine).join(',\n'));
    lines.push('    }');
  } else {
    lines.push('    params = {}');
  }

  lines.push(`    model = ${template.modelClass}(**params, random_state=42)`);
  lines.push(`    scores = cross_val_score(model, X_train, y_train, cv=5, scoring=${JSON.stringify(metric)})`);
  lines.push('    return scores.mean()');
  lines.push('');

  // ── Stream callback ──
  lines.push('def stream_callback(study, trial):');
  lines.push('    print(json.dumps({');
  lines.push("        'type': 'trial_result',");
  lines.push("        'trial_number': trial.number,");
  lines.push("        'state': trial.state.name,");
  lines.push("        'value': trial.value,");
  lines.push("        'params': trial.params,");
  lines.push("        'best_value': study.best_value,");
  lines.push("        'best_params': study.best_params,");
  lines.push("        'n_complete': len([t for t in study.trials if t.state == optuna.trial.TrialState.COMPLETE]),");
  lines.push(`        'n_total': ${nTrials}`);
  lines.push('    }), flush=True)');
  lines.push('');

  // ── Create study and optimize ──
  lines.push(`study = optuna.create_study(direction='maximize')`);
  lines.push(`study.optimize(objective, n_trials=${nTrials}, timeout=${timeoutSeconds}, callbacks=[stream_callback])`);
  lines.push('');

  // ── Refit best model on full train set ──
  lines.push('best_params = study.best_params');
  lines.push(`best_model = ${template.modelClass}(**best_params, random_state=42)`);
  lines.push('best_model.fit(X_train, y_train)');
  lines.push('');

  // ── Save artifacts ──
  lines.push(`output_dir = ${JSON.stringify(outputDir)}`);
  lines.push('os.makedirs(output_dir, exist_ok=True)');
  lines.push('joblib.dump(best_model, os.path.join(output_dir, "model.joblib"))');
  lines.push('');

  // ── Param importances (best-effort) ──
  lines.push('param_importances = {}');
  lines.push('try:');
  lines.push('    imp = optuna.importance.get_param_importances(study)');
  lines.push('    param_importances = {"params": list(imp.keys()), "importances": list(imp.values())}');
  lines.push('except Exception:');
  lines.push('    pass');
  lines.push('');

  // ── Save tuning_summary.json ──
  lines.push('optimization_history = {');
  lines.push('    "trial_numbers": [t.number for t in study.trials if t.state == optuna.trial.TrialState.COMPLETE],');
  lines.push('    "values": [t.value for t in study.trials if t.state == optuna.trial.TrialState.COMPLETE],');
  lines.push('    "best_values": []');
  lines.push('}');
  lines.push('running_best = None');
  lines.push('for t in study.trials:');
  lines.push('    if t.state == optuna.trial.TrialState.COMPLETE:');
  lines.push('        if running_best is None or t.value > running_best:');
  lines.push('            running_best = t.value');
  lines.push('        optimization_history["best_values"].append(running_best)');
  lines.push('');
  lines.push('summary = {');
  lines.push('    "best_params": study.best_params,');
  lines.push('    "best_value": study.best_value,');
  lines.push('    "best_trial_number": study.best_trial.number,');
  lines.push('    "optimization_history": optimization_history,');
  lines.push('    "param_importances": param_importances');
  lines.push('}');
  lines.push('with open(os.path.join(output_dir, "tuning_summary.json"), "w") as f:');
  lines.push('    json.dump(summary, f)');
  lines.push('');

  // ── Final done marker ──
  lines.push('print(json.dumps({"type": "done"}), flush=True)');

  return lines.join('\n');
}

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

    // 3. Get container + sync datasets
    const container = await getOrCreateContainer({
      projectId,
      pythonVersion: '3.11',
      workspacePath: join(env.executionWorkspaceDir, projectId, 'model-runtime'),
    });

    if (container.workspacePath) {
      await syncWorkspaceDatasets(projectId, container.workspacePath).catch((error) => {
        logger.warn('Failed to sync datasets', { modelId, error });
      });
    }

    // 4. Build tuning script
    const tuningOutputDir = `/workspace/tuning/${modelId}`;
    const containerDatasetPath = `/workspace/datasets/${dataset.filename}`;

    const script = buildTuningScript({
      template,
      datasetPath: containerDatasetPath,
      targetColumn: model.targetColumn ?? '',
      testSize: 0.2,
      nTrials,
      metric,
      timeoutSeconds,
      outputDir: tuningOutputDir,
    });

    // 5. Execute with streaming output
    const tuningTimeoutMs = (timeoutSeconds + 60) * 1000; // extra headroom for setup

    const result = await kernelManager.execute(container, script, tuningTimeoutMs, (output) => {
      // Each RichOutput of type 'text' may contain one or more JSON lines
      if (output.type !== 'text') return;
      const text = output.content;
      const textLines = text.split('\n').filter((l) => l.trim());
      for (const line of textLines) {
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          if (parsed.type === 'trial_result') {
            writeJsonLine(res, parsed);
          }
          // Ignore 'done' here — we emit our own done event below
        } catch {
          // Not JSON — skip
        }
      }
    });

    // 6. On success — register the best model as a new ModelRecord
    const workspaceOutputDir = join(container.workspacePath, 'tuning', modelId);
    const summaryPath = join(workspaceOutputDir, 'tuning_summary.json');
    const modelArtifactPath = join(workspaceOutputDir, 'model.joblib');

    if (result.status === 'success' && existsSync(summaryPath) && existsSync(modelArtifactPath)) {
      const summaryRaw = await readFile(summaryPath, 'utf8');
      const summary = JSON.parse(summaryRaw) as {
        best_params: Record<string, unknown>;
        best_value: number;
        best_trial_number: number;
        optimization_history: { trial_numbers: number[]; values: number[]; best_values: number[] };
        param_importances: { params?: string[]; importances?: number[] };
      };

      // Copy artifacts to permanent storage
      const newModelId = `${modelId}-tuned-${Date.now()}`;
      const storageDir = join(env.modelStorageDir, newModelId);
      await mkdir(storageDir, { recursive: true });

      const storedModelPath = join(storageDir, 'model.joblib');
      const storedSummaryPath = join(storageDir, 'tuning_summary.json');

      const artifactStat = await stat(modelArtifactPath);

      await Promise.all([
        copyFile(modelArtifactPath, storedModelPath),
        copyFile(summaryPath, storedSummaryPath),
      ]);

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
        targetColumn: model.targetColumn,
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
