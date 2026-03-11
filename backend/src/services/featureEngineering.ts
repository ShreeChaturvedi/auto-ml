/**
 * Feature Engineering Service
 *
 * Applies feature specs to a dataset using the Python runtime container,
 * saves the derived dataset, and updates metadata/storage.
 */

import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { extname, join } from 'path';

import { env } from '../config.js';
import { hasDatabaseConfiguration } from '../db.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import type { ColumnDataType, DatasetFileType } from '../types/dataset.js';
import type { PythonVersion } from '../types/execution.js';

import { getOrCreateContainer, isDockerAvailable } from './containerManager.js';
import { loadDatasetIntoPostgres, sanitizeTableName } from './datasetLoader.js';
import { syncWorkspaceDatasets } from './executionWorkspace.js';
import * as kernelManager from './kernelManager.js';

export const FEATURE_METHODS = [
  'log_transform',
  'log1p_transform',
  'sqrt_transform',
  'square_transform',
  'reciprocal_transform',
  'box_cox',
  'yeo_johnson',
  'standardize',
  'min_max_scale',
  'robust_scale',
  'max_abs_scale',
  'bucketize',
  'quantile_bin',
  'one_hot_encode',
  'label_encode',
  'target_encode',
  'frequency_encode',
  'binary_encode',
  'extract_year',
  'extract_month',
  'extract_day',
  'extract_weekday',
  'extract_hour',
  'cyclical_encode',
  'time_since',
  'polynomial',
  'ratio',
  'difference',
  'product',
  'text_length',
  'word_count',
  'contains_pattern',
  'missing_indicator'
] as const;

export type FeatureMethod = typeof FEATURE_METHODS[number];

export interface FeatureSpec {
  id?: string;
  projectId?: string;
  sourceColumn: string;
  secondaryColumn?: string;
  featureName: string;
  description?: string;
  method: FeatureMethod;
  category?: string;
  params?: Record<string, unknown>;
  enabled?: boolean;
}

interface FeatureEngineeringInput {
  projectId: string;
  datasetId: string;
  outputName?: string;
  outputFormat?: DatasetFileType;
  pythonVersion?: PythonVersion;
  features: FeatureSpec[];
}

interface FeatureMetadataResult {
  nRows: number;
  columns: Array<{ name: string; dtype: string; nullCount: number }>;
  sample: Record<string, unknown>[];
}

function normalizeColumnDataType(dtype: string): ColumnDataType {
  const normalized = dtype.toLowerCase().trim();
  if (['integer', 'int', 'int64', 'int32', 'int16', 'int8', 'long', 'bigint'].includes(normalized)) {
    return 'integer';
  }
  if (['float', 'float64', 'float32', 'double', 'real', 'numeric', 'decimal'].includes(normalized)) {
    return 'float';
  }
  if (['bool', 'boolean'].includes(normalized)) {
    return 'boolean';
  }
  if (['date', 'datetime', 'timestamp', 'datetime64', 'datetime64[ns]'].includes(normalized)) {
    return 'date';
  }
  if (['string', 'str', 'text', 'object', 'category'].includes(normalized)) {
    return 'string';
  }
  return 'unknown';
}

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);

const INTERACTION_METHODS = new Set<FeatureMethod>(['ratio', 'difference', 'product']);

function normalizeFeatureSpecs(features: FeatureSpec[]): FeatureSpec[] {
  return features.map((feature) => ({
    ...feature,
    featureName:
      feature.featureName?.trim() ||
      `${feature.sourceColumn}_${feature.method}`,
    params: feature.params ?? {},
    enabled: feature.enabled ?? true
  }));
}

function resolveOutputFormat(
  datasetFilename: string,
  outputName?: string,
  outputFormat?: DatasetFileType
): DatasetFileType {
  if (outputFormat) return outputFormat;
  const candidate = (outputName ? extname(outputName) : extname(datasetFilename)).replace('.', '').toLowerCase();
  if (candidate === 'csv' || candidate === 'json' || candidate === 'xlsx') {
    return candidate as DatasetFileType;
  }
  return 'csv';
}

function buildOutputFilename(
  datasetFilename: string,
  outputName: string | undefined,
  outputFormat: DatasetFileType
): string {
  const baseName = outputName
    ? outputName.replace(/\.[^/.]+$/, '')
    : `${datasetFilename.replace(/\.[^/.]+$/, '')}_features_${Date.now()}`;

  const sanitized = baseName
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+/, '')
    .slice(0, 80) || 'dataset_features';

  return `${sanitized}.${outputFormat}`;
}

function pyString(value: string): string {
  return JSON.stringify(value);
}

function pyBool(value: unknown, defaultValue = false): string {
  return value === undefined || value === null
    ? defaultValue ? 'True' : 'False'
    : value === true ? 'True' : 'False';
}

function numericParam(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

type CodegenFn = (
  feature: FeatureSpec,
  dataframeName: string,
  src: string,
  dst: string,
  secondary: string | undefined
) => string;

const FEATURE_CODEGEN_MAP = new Map<FeatureMethod, CodegenFn>([
  ['log_transform', (feature, df, src, dst) => {
    const offset = numericParam(feature.params?.offset, 1);
    return `${df}[${dst}] = np.log(${df}[${src}] + ${offset})`;
  }],
  ['log1p_transform', (_feature, df, src, dst) =>
    `${df}[${dst}] = np.log1p(${df}[${src}])`
  ],
  ['sqrt_transform', (_feature, df, src, dst) =>
    `${df}[${dst}] = np.sqrt(${df}[${src}])`
  ],
  ['square_transform', (_feature, df, src, dst) =>
    `${df}[${dst}] = ${df}[${src}] ** 2`
  ],
  ['reciprocal_transform', (_feature, df, src, dst) =>
    `${df}[${dst}] = 1 / ${df}[${src}].replace(0, np.nan)`
  ],
  ['box_cox', (_feature, df, src, dst) =>
    `${df}[${dst}], _ = boxcox(${df}[${src}] + 1e-10)`
  ],
  ['yeo_johnson', (_feature, df, src, dst) =>
    `${df}[${dst}], _ = yeojohnson(${df}[${src}])`
  ],
  ['standardize', (_feature, df, src, dst) =>
    `${df}[${dst}] = (${df}[${src}] - ${df}[${src}].mean()) / ${df}[${src}].std()`
  ],
  ['min_max_scale', (feature, df, src, dst) => {
    const minVal = numericParam(feature.params?.min, 0);
    const maxVal = numericParam(feature.params?.max, 1);
    return `_min, _max = ${df}[${src}].min(), ${df}[${src}].max()
${df}[${dst}] = (${df}[${src}] - _min) / (_max - _min) * ${maxVal - minVal} + ${minVal}`;
  }],
  ['robust_scale', (_feature, df, src, dst) =>
    `_median = ${df}[${src}].median()
_q1, _q3 = ${df}[${src}].quantile(0.25), ${df}[${src}].quantile(0.75)
${df}[${dst}] = (${df}[${src}] - _median) / (_q3 - _q1)`
  ],
  ['max_abs_scale', (_feature, df, src, dst) =>
    `${df}[${dst}] = ${df}[${src}] / ${df}[${src}].abs().max()`
  ],
  ['bucketize', (feature, df, src, dst) => {
    const bins = numericParam(feature.params?.bins, 5);
    return `${df}[${dst}] = pd.cut(${df}[${src}], bins=${bins}, labels=False)`;
  }],
  ['quantile_bin', (feature, df, src, dst) => {
    const quantiles = numericParam(feature.params?.quantiles, 4);
    return `${df}[${dst}] = pd.qcut(${df}[${src}], q=${quantiles}, labels=False, duplicates='drop')`;
  }],
  ['one_hot_encode', (feature, df, src, dst) => {
    const dropFirst = pyBool(feature.params?.drop_first, false);
    return `_dummies = pd.get_dummies(${df}[${src}], prefix=${dst}, drop_first=${dropFirst})
${df} = pd.concat([${df}, _dummies], axis=1)`;
  }],
  ['label_encode', (_feature, df, src, dst) =>
    `${df}[${dst}] = ${df}[${src}].astype('category').cat.codes`
  ],
  ['target_encode', (feature, df, src, dst) => {
    const targetColumn = feature.params?.targetColumn ? pyString(String(feature.params.targetColumn)) : undefined;
    const smoothing = numericParam(feature.params?.smoothing, 1);
    return `_target = ${targetColumn}
_global_mean = ${df}[_target].mean()
_stats = ${df}.groupby(${src})[_target].agg(['mean', 'count'])
_smooth = (_stats['mean'] * _stats['count'] + _global_mean * ${smoothing}) / (_stats['count'] + ${smoothing})
${df}[${dst}] = ${df}[${src}].map(_smooth)`;
  }],
  ['frequency_encode', (feature, df, src, dst) => {
    const normalize = pyBool(feature.params?.normalize, true);
    return normalize === 'True'
      ? `_counts = ${df}[${src}].value_counts(normalize=True)
${df}[${dst}] = ${df}[${src}].map(_counts)`
      : `_counts = ${df}[${src}].value_counts()
${df}[${dst}] = ${df}[${src}].map(_counts)`;
  }],
  ['binary_encode', (feature, df, src) => {
    const prefix = pyString(feature.featureName);
    return `_series = ${df}[${src}].astype('category')
_codes = _series.cat.codes
_codes = _codes.where(_codes >= 0, 0)
_max = int(_codes.max()) if len(_codes) else 0
_bits = int(np.ceil(np.log2(_max + 1))) if _max > 0 else 1
for _i in range(_bits):
    ${df}[${prefix} + '_bin' + str(_i)] = ((_codes >> _i) & 1).astype(int)`;
  }],
  ['extract_year', (_feature, df, src, dst) =>
    `${df}[${dst}] = pd.to_datetime(${df}[${src}]).dt.year`
  ],
  ['extract_month', (_feature, df, src, dst) =>
    `${df}[${dst}] = pd.to_datetime(${df}[${src}]).dt.month`
  ],
  ['extract_day', (_feature, df, src, dst) =>
    `${df}[${dst}] = pd.to_datetime(${df}[${src}]).dt.day`
  ],
  ['extract_weekday', (_feature, df, src, dst) =>
    `${df}[${dst}] = pd.to_datetime(${df}[${src}]).dt.weekday`
  ],
  ['extract_hour', (_feature, df, src, dst) =>
    `${df}[${dst}] = pd.to_datetime(${df}[${src}]).dt.hour`
  ],
  ['cyclical_encode', (feature, df, src) => {
    const periodKey = String(feature.params?.period ?? 'month');
    const periodMap: Record<string, { attr: string; period: number }> = {
      hour: { attr: 'hour', period: 24 },
      weekday: { attr: 'weekday', period: 7 },
      month: { attr: 'month', period: 12 },
      day_of_year: { attr: 'dayofyear', period: 365 }
    };
    const mapping = periodMap[periodKey] ?? periodMap.month;
    const prefix = pyString(feature.featureName);
    return `_val = pd.to_datetime(${df}[${src}]).dt.${mapping.attr}
${df}[${prefix} + '_sin'] = np.sin(2 * np.pi * _val / ${mapping.period})
${df}[${prefix} + '_cos'] = np.cos(2 * np.pi * _val / ${mapping.period})`;
  }],
  ['time_since', (feature, df, src, dst) => {
    const unitMap: Record<string, string> = {
      days: 'D',
      hours: 'h',
      weeks: 'W',
      months: 'M'
    };
    const unit = unitMap[String(feature.params?.unit ?? 'days')] ?? 'D';
    return `${df}[${dst}] = (pd.Timestamp.now() - pd.to_datetime(${df}[${src}])) / np.timedelta64(1, '${unit}')`;
  }],
  ['polynomial', (feature, df, src) => {
    const degree = Math.max(2, Math.round(numericParam(feature.params?.degree, 2)));
    const prefix = pyString(feature.featureName);
    return `for _i in range(2, ${degree + 1}):
    ${df}[${prefix} + '_pow' + str(_i)] = ${df}[${src}] ** _i`;
  }],
  ['ratio', (_feature, df, src, dst, secondary) => {
    if (!secondary) return '# Missing secondary column for ratio';
    return `${df}[${dst}] = ${df}[${src}] / ${df}[${secondary}].replace(0, np.nan)`;
  }],
  ['difference', (_feature, df, src, dst, secondary) => {
    if (!secondary) return '# Missing secondary column for difference';
    return `${df}[${dst}] = ${df}[${src}] - ${df}[${secondary}]`;
  }],
  ['product', (_feature, df, src, dst, secondary) => {
    if (!secondary) return '# Missing secondary column for product';
    return `${df}[${dst}] = ${df}[${src}] * ${df}[${secondary}]`;
  }],
  ['text_length', (_feature, df, src, dst) =>
    `${df}[${dst}] = ${df}[${src}].astype(str).str.len()`
  ],
  ['word_count', (_feature, df, src, dst) =>
    `${df}[${dst}] = ${df}[${src}].astype(str).str.split().str.len()`
  ],
  ['contains_pattern', (feature, df, src, dst) => {
    const pattern = pyString(String(feature.params?.pattern ?? ''));
    const caseSensitive = pyBool(feature.params?.case_sensitive, false);
    return `${df}[${dst}] = ${df}[${src}].astype(str).str.contains(${pattern}, case=${caseSensitive}, regex=False).astype(int)`;
  }],
  ['missing_indicator', (_feature, df, src, dst) =>
    `${df}[${dst}] = ${df}[${src}].isna().astype(int)`
  ]
]);

function buildFeatureCode(feature: FeatureSpec, dataframeName: string): string {
  const src = pyString(feature.sourceColumn);
  const dst = pyString(feature.featureName);
  const secondary = feature.secondaryColumn ? pyString(feature.secondaryColumn) : undefined;

  const codegen = FEATURE_CODEGEN_MAP.get(feature.method);
  if (!codegen) {
    return `# Unsupported method: ${feature.method}`;
  }
  return codegen(feature, dataframeName, src, dst, secondary);
}

function buildFeatureEngineeringScript(params: {
  datasetFilename: string;
  datasetId: string;
  outputFilename: string;
  outputFormat: DatasetFileType;
  features: FeatureSpec[];
}): string {
  const { datasetFilename, datasetId, outputFilename, outputFormat, features } = params;
  const dataframeName = 'df';
  const lines: string[] = [];

  lines.push('import json');
  lines.push('import numpy as np');
  lines.push('import pandas as pd');

  const needsBoxCox = features.some((feature) => feature.method === 'box_cox');
  const needsYeoJohnson = features.some((feature) => feature.method === 'yeo_johnson');
  if (needsBoxCox) {
    lines.push('from scipy.stats import boxcox');
  }
  if (needsYeoJohnson) {
    lines.push('from scipy.stats import yeojohnson');
  }

  lines.push('');
  lines.push(`dataset_path = resolve_dataset_path(${pyString(datasetFilename)}, ${pyString(datasetId)})`);

  const ext = datasetFilename.split('.').pop()?.toLowerCase();
  if (ext === 'csv') {
    lines.push(`${dataframeName} = pd.read_csv(dataset_path)`);
  } else if (ext === 'json') {
    lines.push(`try:
    ${dataframeName} = pd.read_json(dataset_path)
except ValueError:
    ${dataframeName} = pd.read_json(dataset_path, lines=True)`);
  } else if (ext === 'xlsx' || ext === 'xls') {
    lines.push(`${dataframeName} = pd.read_excel(dataset_path)`);
  } else {
    lines.push(`${dataframeName} = pd.read_csv(dataset_path)`);
  }

  lines.push('');

  for (const feature of features) {
    lines.push(`# Feature: ${feature.featureName}`);
    lines.push(buildFeatureCode(feature, dataframeName));
    lines.push('');
  }

  const outputPath = `/workspace/${outputFilename}`;
  lines.push(`output_path = ${pyString(outputPath)}`);
  if (outputFormat === 'csv') {
    lines.push(`${dataframeName}.to_csv(output_path, index=False)`);
  } else if (outputFormat === 'json') {
    lines.push(`${dataframeName}.to_json(output_path, orient='records')`);
  } else {
    lines.push(`${dataframeName}.to_excel(output_path, index=False)`);
  }

  lines.push('');
  lines.push('from pandas.api import types as _types');
  lines.push('def _map_dtype(series):');
  lines.push('    if _types.is_bool_dtype(series):');
  lines.push("        return 'boolean'");
  lines.push('    if _types.is_numeric_dtype(series):');
  lines.push("        return 'number'");
  lines.push('    if _types.is_datetime64_any_dtype(series):');
  lines.push("        return 'date'");
  lines.push("    return 'string'");
  lines.push('');
  lines.push('_columns = []');
  lines.push(`for _col in ${dataframeName}.columns:`);
  lines.push(`    _series = ${dataframeName}[_col]`);
  lines.push('    _columns.append({');
  lines.push('        "name": _col,');
  lines.push('        "dtype": _map_dtype(_series),');
  lines.push('        "nullCount": int(_series.isna().sum())');
  lines.push('    })');
  lines.push('');
  lines.push(`_sample = json.loads(${dataframeName}.head(20).to_json(orient='records'))`);
  lines.push('_meta = {');
  lines.push(`    "nRows": int(len(${dataframeName})),`);
  lines.push('    "columns": _columns,');
  lines.push('    "sample": _sample');
  lines.push('}');
  lines.push(`with open('/workspace/_feature_meta.json', 'w') as _f:`);
  lines.push('    json.dump(_meta, _f)');

  return lines.join('\n');
}

export async function applyFeatureEngineering(input: FeatureEngineeringInput) {
  if (!await isDockerAvailable()) {
    throw new Error('Docker runtime is unavailable. Start Docker to apply features.');
  }

  const dataset = await datasetRepository.getById(input.datasetId);
  if (!dataset) {
    throw new Error('Dataset not found.');
  }

  if (dataset.projectId && dataset.projectId !== input.projectId) {
    throw new Error('Dataset does not belong to this project.');
  }

  const enabledFeatures = normalizeFeatureSpecs(input.features).filter((feature) => feature.enabled);
  if (enabledFeatures.length === 0) {
    throw new Error('No enabled features to apply.');
  }

  const datasetFilePath = join(env.datasetStorageDir, dataset.datasetId, dataset.filename);
  if (!existsSync(datasetFilePath)) {
    throw new Error('Dataset file is missing on disk.');
  }

  for (const feature of enabledFeatures) {
    if (INTERACTION_METHODS.has(feature.method) && !feature.secondaryColumn) {
      throw new Error(`Feature "${feature.featureName}" requires a secondary column.`);
    }
    if (feature.method === 'target_encode') {
      const targetColumn = feature.params?.targetColumn;
      if (!targetColumn || typeof targetColumn !== 'string') {
        throw new Error(`Feature "${feature.featureName}" requires a target column.`);
      }
    }
  }

  const outputFormat = resolveOutputFormat(dataset.filename, input.outputName, input.outputFormat);
  const outputFilename = buildOutputFilename(dataset.filename, input.outputName, outputFormat);

  const container = await getOrCreateContainer({
    projectId: input.projectId,
    pythonVersion: input.pythonVersion ?? '3.11',
    workspacePath: join(env.executionWorkspaceDir, input.projectId, `feature-${randomUUID()}`)
  });

  if (container.workspacePath) {
    await syncWorkspaceDatasets(input.projectId, container.workspacePath).catch(() => undefined);
  }

  const script = buildFeatureEngineeringScript({
    datasetFilename: dataset.filename,
    datasetId: dataset.datasetId,
    outputFilename,
    outputFormat,
    features: enabledFeatures
  });

  const result = await kernelManager.execute(container, script, env.executionTimeoutMs);

  if (result.status !== 'success') {
    throw new Error(result.stderr || 'Feature engineering failed inside the runtime.');
  }

  const hostOutputPath = join(container.workspacePath, outputFilename);
  const hostMetaPath = join(container.workspacePath, '_feature_meta.json');

  if (!existsSync(hostOutputPath) || !existsSync(hostMetaPath)) {
    throw new Error('Feature engineering did not produce output.');
  }

  const [outputBuffer, metaBuffer, outputStats] = await Promise.all([
    readFile(hostOutputPath),
    readFile(hostMetaPath, 'utf8'),
    stat(hostOutputPath)
  ]);

  const metadata = JSON.parse(metaBuffer) as FeatureMetadataResult;
  const normalizedColumns = metadata.columns.map((column) => ({
    ...column,
    dtype: normalizeColumnDataType(column.dtype)
  }));

  const derivedDataset = await datasetRepository.create({
    projectId: input.projectId,
    filename: outputFilename,
    fileType: outputFormat,
    size: outputStats.size,
    profile: {
      nRows: metadata.nRows,
      columns: normalizedColumns,
      sample: metadata.sample
    },
    metadata: {
      derivedFrom: dataset.datasetId,
      featureEngineering: {
        featureCount: enabledFeatures.length,
        createdAt: new Date().toISOString()
      }
    }
  });

  const datasetDir = join(env.datasetStorageDir, derivedDataset.datasetId);
  await mkdir(datasetDir, { recursive: true });
  await writeFile(join(datasetDir, outputFilename), outputBuffer);

  let tableName = sanitizeTableName(outputFilename, derivedDataset.datasetId);

  if (hasDatabaseConfiguration()) {
    const { tableName: loadedName, rowsLoaded } = await loadDatasetIntoPostgres({
      datasetId: derivedDataset.datasetId,
      filename: outputFilename,
      fileType: outputFormat,
      buffer: outputBuffer,
      columns: normalizedColumns
    });
    tableName = loadedName;
    const updated = await datasetRepository.update(derivedDataset.datasetId, (current) => ({
      ...current,
      nRows: rowsLoaded,
      metadata: {
        ...(current.metadata ?? {}),
        tableName,
        rowsLoaded
      }
    }));
    if (updated) {
      derivedDataset.nRows = updated.nRows;
      derivedDataset.metadata = updated.metadata;
    }
  } else {
    const updated = await datasetRepository.update(derivedDataset.datasetId, (current) => ({
      ...current,
      metadata: {
        ...(current.metadata ?? {}),
        tableName
      }
    }));
    if (updated) {
      derivedDataset.metadata = updated.metadata;
    }
  }

  await Promise.all([
    rm(hostOutputPath, { force: true }),
    rm(hostMetaPath, { force: true })
  ]).catch(() => undefined);

  return {
    dataset: derivedDataset,
    tableName
  };
}
