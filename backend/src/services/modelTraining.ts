import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { env } from '../config.js';
import { appLogger } from '../logging/logger.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { createModelRepository } from '../repositories/modelRepository.js';
import type { ModelRecord, TrainModelRequest } from '../types/model.js';

import { getOrCreateContainer, isDockerAvailable } from './containerManager.js';
import { runEvaluation } from './evaluationService.js';
import { syncWorkspaceDatasets } from './executionWorkspace.js';
import * as kernelManager from './kernelManager.js';
import { getModelTemplate, listModelTemplates } from './modelTemplates.js';
import { deleteTuningStudiesByModelId } from './tuningService.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const modelRepository = createModelRepository(env.modelMetadataPath);

const DEFAULT_TEST_SIZE = 0.2;

function pyLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(pyLiteral).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${JSON.stringify(key)}: ${pyLiteral(val)}`);
    return `{${entries.join(', ')}}`;
  }
  return JSON.stringify(String(value));
}

function loadDatasetLines(filename: string): string[] {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'json') {
    return [
      'try:',
      '    df = pd.read_json(dataset_path)',
      'except ValueError:',
      '    df = pd.read_json(dataset_path, lines=True)'
    ];
  }
  if (ext === 'xlsx' || ext === 'xls') {
    return ['df = pd.read_excel(dataset_path)'];
  }
  return ['df = pd.read_csv(dataset_path)'];
}

function buildTrainingScript(params: {
  datasetFilename: string;
  datasetId: string;
  templateId: string;
  targetColumn?: string;
  parameters: Record<string, unknown>;
  testSize: number;
  outputDir: string;
}): string {
  const template = getModelTemplate(params.templateId);
  if (!template) {
    throw new Error('Unsupported model template.');
  }

  const { datasetFilename, datasetId, targetColumn, parameters, testSize, outputDir } = params;
  const lines: string[] = [];

  lines.push('import json');
  lines.push('import os');
  lines.push('import numpy as np');
  lines.push('import pandas as pd');
  lines.push('import joblib');
  lines.push(`from ${template.importPath} import ${template.modelClass}`);

  if (template.taskType !== 'clustering') {
    lines.push('from sklearn.model_selection import train_test_split');
    lines.push('from sklearn.pipeline import Pipeline');
    lines.push('from sklearn.compose import ColumnTransformer');
    lines.push('from sklearn.preprocessing import StandardScaler, OneHotEncoder');
    lines.push('from sklearn.impute import SimpleImputer');
  }

  if (template.taskType === 'classification') {
    lines.push('from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score');
  } else if (template.taskType === 'regression') {
    lines.push('from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score');
  } else {
    lines.push('from sklearn.metrics import silhouette_score');
  }

  lines.push('');
  lines.push(`dataset_path = resolve_dataset_path(${JSON.stringify(datasetFilename)}, ${JSON.stringify(datasetId)})`);
  lines.push(...loadDatasetLines(datasetFilename));
  lines.push('');
  lines.push('if len(df) < 4:');
  lines.push('    raise ValueError("Dataset needs at least 4 rows for training.")');

  if (template.taskType !== 'clustering') {
    lines.push(`target_col = ${JSON.stringify(targetColumn ?? '')}`);
    lines.push('if target_col not in df.columns:');
    lines.push('    raise ValueError(f"Target column {target_col} not found in dataset.")');
    lines.push('df = df.dropna(subset=[target_col])');
    lines.push('if len(df) < 4:');
    lines.push('    raise ValueError("Dataset needs at least 4 rows after dropping target nulls.")');
    lines.push('y = df[target_col]');
    lines.push('X = df.drop(columns=[target_col])');
  } else {
    lines.push('X = df.copy()');
  }

  lines.push('if X.shape[1] == 0:');
  lines.push('    raise ValueError("No feature columns available for training.")');

  lines.push('');
  lines.push('numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()');
  lines.push('categorical_cols = [col for col in X.columns if col not in numeric_cols]');
  lines.push('feature_columns = numeric_cols + categorical_cols');

  if (template.taskType === 'clustering') {
    // Clustering: keep inline preprocessing (no Pipeline)
    lines.push('if numeric_cols:');
    lines.push('    X[numeric_cols] = X[numeric_cols].fillna(X[numeric_cols].median())');
    lines.push('if categorical_cols:');
    lines.push("    X[categorical_cols] = X[categorical_cols].fillna('missing')");
    lines.push('if categorical_cols:');
    lines.push('    X = pd.get_dummies(X, columns=categorical_cols, drop_first=False)');
    lines.push('X = X.fillna(0)');
  } else {
    // Supervised: build Pipeline + ColumnTransformer
    lines.push('');
    lines.push('# Build feature type metadata');
    lines.push('feature_types = {}');
    lines.push('for col in numeric_cols:');
    lines.push('    dtype = X[col].dtype');
    lines.push("    feature_types[col] = 'int' if np.issubdtype(dtype, np.integer) else 'float'");
    lines.push('for col in categorical_cols:');
    lines.push("    feature_types[col] = 'str'");
    lines.push('');
    lines.push('# Build sample request from first row');
    lines.push('sample_row = X.iloc[0].to_dict()');
    lines.push('for k, v in sample_row.items():');
    lines.push('    if isinstance(v, (np.integer,)):');
    lines.push('        sample_row[k] = int(v)');
    lines.push('    elif isinstance(v, (np.floating,)):');
    lines.push('        sample_row[k] = float(v)');
    lines.push('    elif isinstance(v, (np.bool_,)):');
    lines.push('        sample_row[k] = bool(v)');
    lines.push('');
    lines.push('# Build ColumnTransformer preprocessor');
    lines.push("numeric_pipeline = Pipeline([('imputer', SimpleImputer(strategy='median')), ('scaler', StandardScaler())])");
    lines.push("categorical_pipeline = Pipeline([('imputer', SimpleImputer(strategy='constant', fill_value='missing')), ('encoder', OneHotEncoder(handle_unknown='ignore', sparse_output=False))])");
    lines.push('transformers = []');
    lines.push('if numeric_cols:');
    lines.push("    transformers.append(('num', numeric_pipeline, numeric_cols))");
    lines.push('if categorical_cols:');
    lines.push("    transformers.append(('cat', categorical_pipeline, categorical_cols))");
    lines.push("preprocessor = ColumnTransformer(transformers=transformers, remainder='drop')");
  }

  if (template.taskType !== 'clustering') {
    lines.push(`test_size = ${testSize}`);
    lines.push('stratify = None');
    lines.push('if len(y.unique()) > 1 and len(y) >= 10:');
    lines.push('    stratify = y');
    lines.push('X_train, X_test, y_train, y_test = train_test_split(');
    lines.push('    X, y, test_size=test_size, random_state=42, stratify=stratify');
    lines.push(')');
  }

  const paramEntries = Object.entries(parameters)
    .map(([key, value]) => `${key}=${pyLiteral(value)}`);

  lines.push('');

  if (template.taskType === 'clustering') {
    lines.push(`model = ${template.modelClass}(${paramEntries.join(', ')})`);
    lines.push('labels = model.fit_predict(X)');
  } else {
    lines.push(`pipeline = Pipeline([('preprocessor', preprocessor), ('model', ${template.modelClass}(${paramEntries.join(', ')}))])`);
    lines.push('pipeline.fit(X_train, y_train)');
    lines.push('y_pred = pipeline.predict(X_test)');
  }

  lines.push('metrics = {}');

  if (template.taskType === 'classification') {
    lines.push('metrics["accuracy"] = float(accuracy_score(y_test, y_pred))');
    lines.push('metrics["precision"] = float(precision_score(y_test, y_pred, average="weighted", zero_division=0))');
    lines.push('metrics["recall"] = float(recall_score(y_test, y_pred, average="weighted", zero_division=0))');
    lines.push('metrics["f1"] = float(f1_score(y_test, y_pred, average="weighted", zero_division=0))');
  } else if (template.taskType === 'regression') {
    lines.push('metrics["rmse"] = float(mean_squared_error(y_test, y_pred, squared=False))');
    lines.push('metrics["mae"] = float(mean_absolute_error(y_test, y_pred))');
    lines.push('metrics["r2"] = float(r2_score(y_test, y_pred))');
  } else {
    lines.push('cluster_sizes = pd.Series(labels).value_counts().to_dict()');
    lines.push('if len(set(labels)) > 1 and len(labels) > 1:');
    lines.push('    metrics["silhouette"] = float(silhouette_score(X, labels))');
    lines.push('else:');
    lines.push('    metrics["silhouette"] = 0.0');
  }

  lines.push('');
  lines.push(`output_dir = ${JSON.stringify(outputDir)}`);
  lines.push('os.makedirs(output_dir, exist_ok=True)');
  lines.push('model_path = os.path.join(output_dir, "model.joblib")');

  if (template.taskType === 'clustering') {
    lines.push('joblib.dump(model, model_path)');
  } else {
    lines.push('joblib.dump(pipeline, model_path)');
  }

  if (template.taskType !== 'clustering') {
    // Baseline statistics for drift detection (computed from X_train only)
    lines.push('');
    lines.push("baseline = {'numeric': {}, 'categorical': {}, 'prediction_distribution': {}}");
    lines.push('for col in numeric_cols:');
    lines.push('    col_data = X_train[col].dropna()');
    lines.push('    if len(col_data) > 0:');
    lines.push('        hist_counts, hist_edges = np.histogram(col_data, bins=20)');
    lines.push("        baseline['numeric'][col] = {");
    lines.push("            'mean': float(col_data.mean()), 'std': float(col_data.std()),");
    lines.push("            'min': float(col_data.min()), 'max': float(col_data.max()),");
    lines.push("            'q25': float(col_data.quantile(0.25)), 'q50': float(col_data.quantile(0.50)), 'q75': float(col_data.quantile(0.75)),");
    lines.push("            'histogram': {'bins': hist_edges.tolist(), 'counts': hist_counts.tolist()}");
    lines.push('        }');
    lines.push('for col in categorical_cols:');
    lines.push('    col_data = X_train[col].dropna()');
    lines.push("    baseline['categorical'][col] = dict(col_data.value_counts().head(50).items())");
    lines.push('y_pred_baseline = pipeline.predict(X_test)');
    lines.push("y_pred_list = y_pred_baseline.tolist() if hasattr(y_pred_baseline, 'tolist') else list(y_pred_baseline)");
    lines.push(`if '${template.taskType}' == 'classification':`);
    lines.push('    from collections import Counter');
    lines.push("    baseline['prediction_distribution'] = dict(Counter(str(v) for v in y_pred_list))");
    lines.push('else:');
    lines.push('    pred_arr = np.array(y_pred_list, dtype=float)');
    lines.push('    hist_counts, hist_edges = np.histogram(pred_arr, bins=20)');
    lines.push("    baseline['prediction_distribution'] = {'bins': hist_edges.tolist(), 'counts': hist_counts.tolist()}");
    lines.push('with open(os.path.join(output_dir, "baseline.json"), "w") as f:');
    lines.push('    json.dump(baseline, f)');
  }

  lines.push('');
  lines.push('meta = {');
  lines.push('    "metrics": metrics,');
  lines.push('    "featureColumns": feature_columns,');
  lines.push('    "sampleCount": int(len(df))');
  if (template.taskType !== 'clustering') {
    lines.push('    ,"targetColumn": target_col');
    lines.push('    ,"testSize": float(test_size)');
    lines.push('    ,"featureTypes": feature_types');
    lines.push('    ,"sampleRequest": sample_row');
  }
  if (template.taskType === 'clustering') {
    lines.push('    ,"clusterSizes": cluster_sizes');
  }
  lines.push('}');

  lines.push('with open(os.path.join(output_dir, "metrics.json"), "w") as f:');
  lines.push('    json.dump(meta, f)');

  return lines.join('\n');
}

export function listModels(projectId?: string) {
  return modelRepository.list(projectId);
}

export function getModelById(modelId: string) {
  return modelRepository.getById(modelId);
}

export function getModelTemplates() {
  return listModelTemplates();
}

export async function trainModel(input: TrainModelRequest): Promise<{ model: ModelRecord; success: boolean; message: string }> {
  const start = Date.now();
  const template = getModelTemplate(input.templateId);
  if (!template) {
    throw new Error(`Unsupported model template "${input.templateId}".`);
  }

  const dataset = await datasetRepository.getById(input.datasetId);
  if (!dataset) {
    throw new Error('Dataset not found.');
  }
  if (dataset.projectId && dataset.projectId !== input.projectId) {
    throw new Error('Dataset does not belong to this project.');
  }

  const datasetPath = join(env.datasetStorageDir, dataset.datasetId, dataset.filename);
  if (!existsSync(datasetPath)) {
    throw new Error('Dataset file is missing on disk.');
  }

  if (template.taskType !== 'clustering' && !input.targetColumn) {
    throw new Error('Target column is required for supervised training.');
  }

  if (!await isDockerAvailable()) {
    throw new Error('Docker runtime is unavailable. Start Docker to train models.');
  }

  const modelId = randomUUID();
  const testSize = Math.max(0.1, Math.min(input.testSize ?? DEFAULT_TEST_SIZE, 0.4));
  const mergedParams = Object.fromEntries(
    Object.entries({
      ...template.defaultParams,
      ...(input.parameters ?? {})
    }).filter(([, value]) => value !== undefined)
  );

  const container = await getOrCreateContainer({
    projectId: input.projectId,
    pythonVersion: '3.11',
    workspacePath: join(env.executionWorkspaceDir, input.projectId, 'model-runtime')
  });

  if (container.workspacePath) {
    await syncWorkspaceDatasets(input.projectId, container.workspacePath).catch((error) => {
      appLogger.warn('[modelTraining] Failed to sync datasets:', error);
    });
  }

  const outputDir = `/workspace/models/${modelId}`;
  const script = buildTrainingScript({
    datasetFilename: dataset.filename,
    datasetId: dataset.datasetId,
    templateId: template.id,
    targetColumn: input.targetColumn,
    parameters: mergedParams,
    testSize,
    outputDir
  });

  const result = await kernelManager.execute(container, script, env.executionTimeoutMs);

  const runDir = join(container.workspacePath, 'models', modelId);
  const metricsPath = join(runDir, 'metrics.json');
  const modelPath = join(runDir, 'model.joblib');

  const dateTag = new Date().toISOString().slice(0, 10);
  const name = input.name ?? `${template.name} · ${dateTag}`;

  if (result.status !== 'success' || !existsSync(metricsPath) || !existsSync(modelPath)) {
    const failedRecord = await modelRepository.create({
      projectId: input.projectId,
      datasetId: input.datasetId,
      name,
      templateId: template.id,
      taskType: template.taskType,
      library: template.library,
      algorithm: template.modelClass,
      parameters: mergedParams,
      metrics: {},
      status: 'failed',
      trainingMs: Date.now() - start,
      targetColumn: input.targetColumn,
      error: result.stderr || result.error || 'Training failed inside the runtime.'
    });
    await rm(runDir, { recursive: true, force: true }).catch(() => undefined);
    return { model: failedRecord, success: false, message: failedRecord.error ?? 'Training failed.' };
  }

  const [metricsRaw, artifactStat] = await Promise.all([
    readFile(metricsPath, 'utf8'),
    stat(modelPath)
  ]);

  const metricsPayload = JSON.parse(metricsRaw) as {
    metrics?: Record<string, number>;
    featureColumns?: string[];
    sampleCount?: number;
    targetColumn?: string;
    clusterSizes?: Record<string, number>;
    featureTypes?: Record<string, 'float' | 'int' | 'str'>;
    sampleRequest?: Record<string, unknown>;
  };

  const storageDir = join(env.modelStorageDir, modelId);
  await mkdir(storageDir, { recursive: true });
  const storedModelPath = join(storageDir, 'model.joblib');
  const storedMetricsPath = join(storageDir, 'metrics.json');

  const fileCopies: Promise<void>[] = [
    copyFile(modelPath, storedModelPath),
    copyFile(metricsPath, storedMetricsPath),
    writeFile(join(storageDir, 'train.py'), script, 'utf8')
  ];
  const baselinePath = join(runDir, 'baseline.json');
  if (existsSync(baselinePath)) {
    fileCopies.push(copyFile(baselinePath, join(storageDir, 'baseline.json')));
  }
  await Promise.all(fileCopies);

  const record = await modelRepository.create({
    projectId: input.projectId,
    datasetId: input.datasetId,
    name,
    templateId: template.id,
    taskType: template.taskType,
    library: template.library,
    algorithm: template.modelClass,
    parameters: mergedParams,
    metrics: metricsPayload.metrics ?? {},
    status: 'completed',
    trainingMs: Date.now() - start,
    targetColumn: metricsPayload.targetColumn ?? input.targetColumn,
    featureColumns: metricsPayload.featureColumns,
    featureTypes: metricsPayload.featureTypes,
    sampleRequest: metricsPayload.sampleRequest,
    sampleCount: metricsPayload.sampleCount,
    artifact: {
      filename: 'model.joblib',
      path: storedModelPath,
      size: artifactStat.size
    },
    metadata: metricsPayload.clusterSizes
      ? { clusterSizes: metricsPayload.clusterSizes }
      : undefined,
    evaluationStatus: 'pending'
  });

  // Fire-and-forget evaluation — training response returns immediately
  runEvaluation(record.modelId).catch(err =>
    appLogger.error('[modelTraining] Background evaluation failed', { modelId: record.modelId, error: err })
  );

  await rm(runDir, { recursive: true, force: true }).catch(() => undefined);

  return { model: record, success: true, message: 'Model trained successfully.' };
}

export async function deleteModel(modelId: string): Promise<boolean> {
  const model = await modelRepository.getById(modelId);
  if (!model) return false;
  const deleted = await modelRepository.delete(modelId);
  if (deleted) {
    const artifactDir = join(env.modelStorageDir, modelId);
    await Promise.all([
      rm(artifactDir, { recursive: true, force: true })
        .catch((err) => appLogger.warn('[modelTraining] artifact cleanup failed', { modelId, err })),
      deleteTuningStudiesByModelId(modelId)
        .catch((err) => appLogger.warn('[modelTraining] tuning study cleanup failed', { modelId, err })),
    ]);
  }
  return deleted;
}
