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
import type { ModelTemplate, ModelTemplateParam } from '../types/model.js';
import {
  copyArtifactsToPermanentStorage,
  orchestrateContainerExecution,
} from '../utils/containerOrchestrator.js';

import { getModelTemplate } from './modelTemplates.js';
import {
  buildOutputDirSetup,
  buildResultSaving,
  buildStandardImports,
  buildTrainTestSplitLines,
} from './pythonScriptUtils.js';

/* ------------------------------------------------------------------ */
/*  Sklearn scoring-string mapping                                     */
/* ------------------------------------------------------------------ */

/**
 * Map user-facing metric names to valid sklearn scoring strings.
 *
 * sklearn's `cross_val_score` does NOT accept bare names like "rmse" or "mae".
 * Error metrics must use the `neg_` prefix (sklearn convention: higher = better
 * for all scorers, so error metrics are negated).
 *
 * When we use a negated scorer the raw values from `cross_val_score` are negative,
 * so the Optuna study direction must be "maximize" (closer to zero = better).
 */
const METRIC_TO_SKLEARN_SCORING: Record<string, string> = {
  rmse: 'neg_root_mean_squared_error',
  mae: 'neg_mean_absolute_error',
  mse: 'neg_mean_squared_error',
  mean_squared_error: 'neg_mean_squared_error',
  mean_absolute_error: 'neg_mean_absolute_error',
  log_loss: 'neg_log_loss',
};

/**
 * Return the sklearn scoring string for a given user-facing metric name.
 * Metrics not in the mapping are passed through unchanged (e.g. "accuracy", "r2", "f1").
 */
export function toSklearnScoring(metric: string): string {
  return METRIC_TO_SKLEARN_SCORING[metric] ?? metric;
}

/**
 * Whether the sklearn scoring string is a negated scorer.
 * When true, the raw CV values are negative and Optuna must maximize
 * (higher = closer to zero = less error).
 */
export function isNegatedScorer(sklearnScoring: string): boolean {
  return sklearnScoring.startsWith('neg_');
}

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
  sampler?: 'tpe' | 'random';
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
  lines.push(
    ...buildStandardImports([
      'import sys',
      'import joblib',
      'import optuna',
      'from sklearn.model_selection import train_test_split, cross_val_score',
      `from ${template.importPath} import ${template.modelClass}`,
    ])
  );

  // ── Suppress Optuna default logging (we stream our own) ──
  lines.push('optuna.logging.set_verbosity(optuna.logging.WARNING)');
  lines.push(`sampler = optuna.samplers.TPESampler(seed=42) if '${options.sampler ?? 'tpe'}' == 'tpe' else optuna.samplers.RandomSampler(seed=42)`);
  lines.push('');

  // ── Load dataset ──
  lines.push(`dataset_path = ${JSON.stringify(datasetPath)}`);
  lines.push('df = pd.read_csv(dataset_path)');
  lines.push('');

  // ── Extract target + build preprocessor (Pipeline-based) ──
  lines.push(`target_col = ${JSON.stringify(targetColumn)}`);
  lines.push('if target_col not in df.columns:');
  lines.push('    raise ValueError(f"Target column {target_col} not found in dataset.")');
  lines.push('df = df.dropna(subset=[target_col])');
  lines.push('y = df[target_col]');
  lines.push('X = df.drop(columns=[target_col])');
  lines.push('');
  lines.push('# Identify column types');
  lines.push('numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()');
  lines.push('categorical_cols = [col for col in X.columns if col not in numeric_cols]');
  lines.push('feature_columns = numeric_cols + categorical_cols  # pre-encoding names');
  lines.push('');
  lines.push('# Build preprocessor ONCE (reused across trials)');
  lines.push('from sklearn.pipeline import Pipeline as SkPipeline');
  lines.push('from sklearn.compose import ColumnTransformer');
  lines.push('from sklearn.preprocessing import StandardScaler, OneHotEncoder');
  lines.push('from sklearn.impute import SimpleImputer');
  lines.push('');
  lines.push("numeric_pipeline = SkPipeline([");
  lines.push("    ('imputer', SimpleImputer(strategy='median')),");
  lines.push("    ('scaler', StandardScaler())");
  lines.push("])");
  lines.push("categorical_pipeline = SkPipeline([");
  lines.push("    ('imputer', SimpleImputer(strategy='constant', fill_value='missing')),");
  lines.push("    ('encoder', OneHotEncoder(handle_unknown='ignore', sparse_output=False))");
  lines.push("])");
  lines.push('transformers = []');
  lines.push('if numeric_cols:');
  lines.push("    transformers.append(('num', numeric_pipeline, numeric_cols))");
  lines.push('if categorical_cols:');
  lines.push("    transformers.append(('cat', categorical_pipeline, categorical_cols))");
  lines.push("preprocessor = ColumnTransformer(transformers=transformers, remainder='drop')");
  lines.push('');

  // ── Train/test split ──
  lines.push(...buildTrainTestSplitLines({ taskType: template.taskType, testSize }));
  lines.push('');

  // ── Scoring + direction ──
  const sklearnScoring = toSklearnScoring(metric);
  const negated = isNegatedScorer(sklearnScoring);
  // sklearn scoring convention: higher = better for all scorers.
  // Error metrics use neg_ prefix (negative values), so maximizing still works.
  const direction = 'maximize';

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

  const randomStateSuffix = 'random_state' in template.defaultParams ? ', random_state=42' : '';
  lines.push(`    estimator = ${template.modelClass}(**params${randomStateSuffix})`);
  lines.push("    trial_pipeline = SkPipeline([('preprocessor', preprocessor), ('model', estimator)])");
  lines.push(`    scores = cross_val_score(trial_pipeline, X_train, y_train, cv=5, scoring=${JSON.stringify(sklearnScoring)})`);
  lines.push('    return scores.mean()');
  lines.push('');

  // ── Stream callback ──
  lines.push(`DIRECTION = ${JSON.stringify(direction)}`);
  lines.push(`N_TRIALS = ${nTrials}`);
  lines.push("_best_tracker = {'value': None, 'since': 0}");
  if (negated) {
    lines.push('_negate = lambda v: abs(v) if v is not None else None');
  }
  lines.push('def stream_callback(study, trial):');
  lines.push('    _n_complete = len([t for t in study.trials if t.state == optuna.trial.TrialState.COMPLETE])');
  lines.push('    print(json.dumps({');
  lines.push("        'type': 'trial_result',");
  lines.push("        'trial_number': trial.number,");
  lines.push("        'state': trial.state.name,");
  lines.push(`        'value': ${negated ? '_negate(trial.value)' : 'trial.value'},`);
  lines.push("        'params': trial.params,");
  lines.push(`        'best_value': ${negated ? '_negate(study.best_value)' : 'study.best_value'},`);
  lines.push("        'best_params': study.best_params,");
  lines.push("        'n_complete': _n_complete,");
  lines.push(`        'n_total': ${nTrials}`);
  lines.push('    }), flush=True)');
  lines.push('    # Convergence tracking');
  lines.push('    _cur_best = study.best_value if len(study.best_trials) > 0 else None');
  lines.push('    if _cur_best is not None:');
  lines.push("        if _best_tracker['value'] is None or _cur_best > _best_tracker['value']:");
  lines.push("            _best_tracker['since'] = 0");
  lines.push("            _best_tracker['value'] = _cur_best");
  lines.push('        else:');
  lines.push("            _best_tracker['since'] += 1");
  lines.push('        _patience = max(10, N_TRIALS // 5)');
  lines.push("        if _best_tracker['since'] == 0:");
  lines.push("            _conv_status = 'exploring'");
  lines.push("        elif _best_tracker['since'] < _patience:");
  lines.push("            _conv_status = 'narrowing'");
  lines.push('        else:');
  lines.push("            _conv_status = 'converging'");
  lines.push("        print(json.dumps({'type': 'convergence_update', 'status': _conv_status, 'trials_since_improvement': _best_tracker['since'], 'improvement_rate': 0.0}), flush=True)");
  lines.push('    if _n_complete in {10, 20, 30, 50, 75, 100, 150, 200} and _n_complete >= 10:');
  lines.push('        try:');
  lines.push('            _imp = optuna.importance.get_param_importances(study)');
  lines.push("            print(json.dumps({'type': 'importance_update', 'importances': dict(_imp), 'n_trials_used': _n_complete}), flush=True)");
  lines.push('        except Exception:');
  lines.push('            pass');
  lines.push('');

  // ── Create study and optimize ──
  lines.push(`study = optuna.create_study(direction=${JSON.stringify(direction)}, sampler=sampler)`);
  lines.push(`study.optimize(objective, n_trials=${nTrials}, timeout=${timeoutSeconds}, callbacks=[stream_callback])`);
  lines.push('');

  // ── Refit best model on full train set ──
  lines.push('best_params = study.best_params');
  lines.push(`best_estimator = ${template.modelClass}(**best_params${randomStateSuffix})`);
  lines.push("best_pipeline = SkPipeline([('preprocessor', preprocessor), ('model', best_estimator)])");
  lines.push('best_pipeline.fit(X_train, y_train)');
  lines.push('');

  // ── Save artifacts ──
  lines.push(...buildOutputDirSetup(outputDir));
  lines.push('joblib.dump(best_pipeline, os.path.join(output_dir, "model.joblib"))');
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
  if (negated) {
    lines.push('optimization_history["values"] = [abs(v) for v in optimization_history["values"]]');
    lines.push('optimization_history["best_values"] = [abs(v) for v in optimization_history["best_values"]]');
  }
  lines.push('');

  lines.push('summary = {');
  lines.push(`    "best_params": study.best_params,`);
  lines.push(`    "best_value": ${negated ? 'abs(study.best_value)' : 'study.best_value'},`);
  lines.push('    "best_trial_number": study.best_trial.number,');
  lines.push('    "optimization_history": optimization_history,');
  lines.push('    "param_importances": param_importances,');
  lines.push('    "feature_columns": feature_columns');
  lines.push('}');
  lines.push(
    ...buildResultSaving('output_dir', {
      resultVar: 'summary',
      filename: 'tuning_summary.json',
    })
  );

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
  options?: { sampler?: 'tpe' | 'random'; paramOverrides?: Record<string, { min?: number; max?: number; step?: number }> },
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

    // 3. Check for tunable parameters
    const tunableParams = template.parameters.filter(
      (p) => p.min !== undefined || p.options !== undefined || p.type === 'boolean'
    );
    if (tunableParams.length === 0) {
      writeJsonLine(res, { type: 'error', message: `Model "${template.name}" has no tunable hyperparameters.` });
      res.end();
      return;
    }

    // 4. Pre-compute workspace paths
    const workspacePath = join(env.executionWorkspaceDir, projectId, 'model-runtime');
    const tuningOutputDir = `/workspace/tuning/${modelId}`;
    const containerDatasetPath = `/workspace/datasets/${dataset.filename}`;
    const tuningTimeoutMs = (timeoutSeconds + 60) * 1000; // extra headroom for setup

    // 5. Orchestrate container execution with streaming callback
    const RELAY_TYPES = new Set(['trial_result', 'importance_update', 'convergence_update']);
    const { container, executionResult: result } = await orchestrateContainerExecution({
      projectId,
      pythonVersion: '3.11',
      scriptBuilder: () =>
        buildTuningScript({
          template,
          datasetPath: containerDatasetPath,
          targetColumn: model.targetColumn ?? '',
          testSize: 0.2,
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
        feature_columns?: string[];
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
        targetColumn: model.targetColumn,
        featureColumns: summary.feature_columns ?? model.featureColumns,
        featureTypes: model.featureTypes,
        sampleRequest: model.sampleRequest,
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
