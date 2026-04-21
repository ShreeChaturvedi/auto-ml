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
import { appLogger } from '../logging/logger.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import type { ColumnDataType, DatasetFileType } from '../types/dataset.js';
import type { PythonVersion } from '../types/execution.js';

import { getOrCreateContainer, isDockerAvailable } from './containerManager.js';
import { buildDatasetTableName, loadDatasetIntoPostgres } from './datasetLoader.js';
import { assignDatasetSqlName } from './datasetSqlNames.js';
import { syncWorkspaceDatasets } from './executionWorkspace.js';
import { buildFeatureEngineeringScript } from './featureEngineering/scriptBuilder.js';
import * as kernelManager from './kernelManager.js';

// Re-export extracted modules for backward compatibility
export { buildFeatureCode, FEATURE_CODEGEN_MAP, numericParam, pyBool, pyString } from './featureEngineering/codeGenerator.js';
export { buildFeatureEngineeringScript } from './featureEngineering/scriptBuilder.js';

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
  /**
   * Optional LLM-authored Python code for this feature. When present, the
   * apply pipeline uses this code verbatim (wrapped in a function scope)
   * instead of regenerating from the method-based codegen map. This ensures
   * complex features like groupby transforms (labelled method: 'ratio')
   * produce the same data in export as they did in the notebook.
   */
  code?: string;
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

/**
 * Apply pipeline degenerate-feature guard.
 *
 * After the feature engineering script runs, the output dataset's columns
 * must include AT LEAST ONE column that wasn't in the source dataset.
 * If the output schema is identical to (or a subset of) the source, the
 * features silently produced nothing useful — typically because the LLM
 * materialized placeholder code (`# Placeholder...`) that Python ran as
 * a no-op, or because the features targeted columns that don't exist in
 * the active dataset.
 *
 * Exported as a pure helper so it can be unit-tested without spinning up
 * Docker or the full apply pipeline.
 *
 * CRITICAL: This guard MUST run BEFORE datasetRepository.create() so a
 * failure doesn't leave orphaned metadata behind.
 */
export function assertFeaturesProducedNewColumns(
  sourceColumnNames: string[],
  outputColumnNames: string[],
  features: Array<{ featureName: string }>,
  datasetFilename: string,
  featureCount: number
): void {
  const sourceSet = new Set(sourceColumnNames);
  const newColumns = outputColumnNames.filter((name) => !sourceSet.has(name));
  if (newColumns.length === 0) {
    const featureList = features.map((f) => `"${f.featureName}"`).join(', ');
    throw new Error(
      `Feature engineering produced no new columns in ${datasetFilename}. ` +
      `Applied ${featureCount} feature(s) [${featureList}] but the output schema ` +
      `matches the source exactly. This usually means the feature code was a ` +
      `placeholder, or the features targeted columns that don't exist in this dataset. ` +
      `Review the feature code in the notebook and re-run the lifecycle.`
    );
  }
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

  // Guard against featureName collisions — duplicates silently overwrite in
  // the generated pandas script, and a name matching an existing dataset
  // column overwrites the source column before any downstream feature can
  // reference it. Both produce confusing "no new columns" errors later.
  // Issue #341/#343.
  const seenNames = new Set<string>();
  const existingColumns = new Set(dataset.columns.map((column) => column.name));
  for (const feature of enabledFeatures) {
    if (!feature.featureName) {
      throw new Error('Each feature must have a non-empty featureName.');
    }
    if (seenNames.has(feature.featureName)) {
      throw new Error(`Duplicate featureName "${feature.featureName}" in apply request.`);
    }
    if (existingColumns.has(feature.featureName)) {
      throw new Error(
        `Feature "${feature.featureName}" collides with an existing dataset column. `
          + 'Pick a different name or drop the source column first.',
      );
    }
    seenNames.add(feature.featureName);
  }

  const datasetFilePath = join(env.datasetStorageDir, dataset.datasetId, dataset.filename);
  if (!existsSync(datasetFilePath)) {
    throw new Error('Dataset file is missing on disk.');
  }

  for (const feature of enabledFeatures) {
    // When the LLM authored the code for this feature, skip structural
    // validation — the notebook already ran it successfully, and the code
    // handles its own column references. Structural guards only apply to
    // features that fall back to the method-based codegen map.
    const hasLlmCode = typeof feature.code === 'string' && feature.code.trim().length > 0;
    if (hasLlmCode) continue;

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

  // Degenerate-feature guard: verify the apply actually added new columns.
  // Runs BEFORE datasetRepository.create to prevent orphaned metadata when
  // the script was a no-op (placeholder code, missing source columns, etc.)
  const sourceColumnNames = dataset.columns.map((col) => col.name);
  const outputColumnNames = normalizedColumns.map((col) => col.name);
  assertFeaturesProducedNewColumns(
    sourceColumnNames,
    outputColumnNames,
    enabledFeatures,
    dataset.filename,
    enabledFeatures.length
  );

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
  const sqlName = await assignDatasetSqlName({
    repository: datasetRepository,
    projectId: input.projectId,
    filename: outputFilename,
    datasetId: derivedDataset.datasetId
  });

  const datasetDir = join(env.datasetStorageDir, derivedDataset.datasetId);
  await mkdir(datasetDir, { recursive: true });
  await writeFile(join(datasetDir, outputFilename), outputBuffer);

  let tableName = buildDatasetTableName(outputFilename, derivedDataset.datasetId);
  let warning: string | undefined;

  if (hasDatabaseConfiguration()) {
    try {
      const { tableName: loadedName, rowsLoaded } = await loadDatasetIntoPostgres({
        datasetId: derivedDataset.datasetId,
        filename: outputFilename,
        fileType: outputFormat,
        buffer: outputBuffer,
        columns: normalizedColumns,
        tableName
      });
      tableName = loadedName;
      const updated = await datasetRepository.update(derivedDataset.datasetId, (current) => ({
        ...current,
        nRows: rowsLoaded,
        metadata: {
          ...(current.metadata ?? {}),
          sqlName,
          tableName,
          rowsLoaded
        }
      }));
      if (updated) {
        derivedDataset.nRows = updated.nRows;
        derivedDataset.metadata = updated.metadata;
      }
    } catch (error) {
      warning = 'Dataset was created, but database indexing failed. It may be temporarily non-queryable.';
      appLogger.warn('[feature-engineering] Derived dataset DB load failed; keeping file-backed dataset', {
        datasetId: derivedDataset.datasetId,
        projectId: input.projectId,
        error: error instanceof Error ? error.message : String(error)
      });

      const updated = await datasetRepository.update(derivedDataset.datasetId, (current) => ({
        ...current,
        metadata: {
          ...(current.metadata ?? {}),
          sqlName,
          tableName,
          loadWarning: warning,
          queryError: error instanceof Error ? error.message : String(error)
        }
      }));
      if (updated) {
        derivedDataset.metadata = updated.metadata;
      }
    }
  } else {
    const updated = await datasetRepository.update(derivedDataset.datasetId, (current) => ({
      ...current,
      metadata: {
        ...(current.metadata ?? {}),
        sqlName,
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
    tableName,
    warning
  };
}
