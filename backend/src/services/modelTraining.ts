import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { env } from '../config.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { createModelRepository } from '../repositories/modelRepository.js';
import type { ModelRecord, TrainModelRequest } from '../types/model.js';
import { executeInContainer, getOrCreateContainer, isDockerAvailable } from './containerManager.js';
import { syncWorkspaceDatasets } from './executionWorkspace.js';
import { getModelTemplate, listModelTemplates } from './modelTemplates.js';

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

  lines.push('numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()');
  lines.push('categorical_cols = [col for col in X.columns if col not in numeric_cols]');
  lines.push('if numeric_cols:');
  lines.push('    X[numeric_cols] = X[numeric_cols].fillna(X[numeric_cols].median())');
  lines.push('if categorical_cols:');
  lines.push("    X[categorical_cols] = X[categorical_cols].fillna('missing')");
  lines.push('if categorical_cols:');
  lines.push('    X = pd.get_dummies(X, columns=categorical_cols, drop_first=False)');
  lines.push('X = X.fillna(0)');
  lines.push('feature_columns = list(X.columns)');

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
  lines.push(`model = ${template.modelClass}(${paramEntries.join(', ')})`);

  if (template.taskType === 'clustering') {
    lines.push('labels = model.fit_predict(X)');
  } else {
    lines.push('model.fit(X_train, y_train)');
    lines.push('y_pred = model.predict(X_test)');
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
  lines.push('joblib.dump(model, model_path)');

  lines.push('meta = {');
  lines.push('    "metrics": metrics,');
  lines.push('    "featureColumns": feature_columns,');
  lines.push('    "sampleCount": int(len(df))');
  if (template.taskType !== 'clustering') {
    lines.push('    ,"targetColumn": target_col');
    lines.push('    ,"testSize": float(test_size)');
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
      console.warn('[modelTraining] Failed to sync datasets:', error);
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

  const result = await executeInContainer(container, script, env.executionTimeoutMs, {
    executionId: `train_${modelId.slice(0, 8)}`
  });

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
  };

  const storageDir = join(env.modelStorageDir, modelId);
  await mkdir(storageDir, { recursive: true });
  const storedModelPath = join(storageDir, 'model.joblib');
  const storedMetricsPath = join(storageDir, 'metrics.json');

  await Promise.all([
    copyFile(modelPath, storedModelPath),
    copyFile(metricsPath, storedMetricsPath),
    writeFile(join(storageDir, 'train.py'), script, 'utf8')
  ]);

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
    sampleCount: metricsPayload.sampleCount,
    artifact: {
      filename: 'model.joblib',
      path: storedModelPath,
      size: artifactStat.size
    },
    metadata: metricsPayload.clusterSizes
      ? { clusterSizes: metricsPayload.clusterSizes }
      : undefined
  });

  await rm(runDir, { recursive: true, force: true }).catch(() => undefined);

  return { model: record, success: true, message: 'Model trained successfully.' };
}
