import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { env } from '../config.js';
import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import { createDatasetRepository, type DatasetRepository } from '../repositories/datasetRepository.js';
import type { DatasetProfile } from '../types/dataset.js';

import { loadDatasetIntoPostgres, parseDatasetRows, resolveDatasetTableName } from './datasetLoader.js';
import { profileDatasetRows } from './datasetProfiler.js';
import { buildEdaSummary } from './edaSummary.js';

const DATASET_EDA_MAX_ROWS = 5000;

export function getDatasetLoadWarning(dataset: DatasetProfile): string | undefined {
  const loadWarning = dataset.metadata?.loadWarning;
  return typeof loadWarning === 'string' && loadWarning.trim() ? loadWarning.trim() : undefined;
}

export async function datasetTableExists(tableName: string): Promise<boolean> {
  if (!hasDatabaseConfiguration()) {
    return false;
  }

  const pool = getDbPool();
  const result = await pool.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_tables
        WHERE schemaname = 'public' AND tablename = $1
      ) AS exists
    `,
    [tableName]
  );

  return Boolean(result.rows[0]?.exists);
}

export async function getDatasetQueryState(dataset: DatasetProfile): Promise<{
  tableName: string;
  queryable: boolean;
  queryError?: string;
}> {
  const tableName = resolveDatasetTableName(dataset);

  if (!hasDatabaseConfiguration()) {
    return {
      tableName,
      queryable: false,
      queryError: 'Database is not configured for SQL execution'
    };
  }

  const loadWarning = getDatasetLoadWarning(dataset);
  if (loadWarning) {
    return {
      tableName,
      queryable: false,
      queryError: loadWarning
    };
  }

  const exists = await datasetTableExists(tableName);
  if (exists) {
    return { tableName, queryable: true };
  }

  return {
    tableName,
    queryable: false,
    queryError: `Dataset table "${tableName}" is missing and must be rebuilt.`
  };
}

export async function rebuildDatasetTableFromSource(
  dataset: DatasetProfile,
  repository: DatasetRepository = createDatasetRepository(env.datasetMetadataPath)
): Promise<DatasetProfile> {
  if (!hasDatabaseConfiguration()) {
    throw Object.assign(new Error('Database is not configured for SQL execution'), { statusCode: 503 });
  }

  const datasetDir = join(env.datasetStorageDir, dataset.datasetId);
  const filePath = join(datasetDir, dataset.filename);

  if (!existsSync(filePath)) {
    throw Object.assign(new Error('Dataset file not found on disk'), { statusCode: 404 });
  }

  const buffer = readFileSync(filePath);
  const rows = await parseDatasetRows(buffer, dataset.fileType, dataset.filename);
  if (rows.length === 0) {
    throw new Error('Dataset has no rows to load');
  }

  const profiling = profileDatasetRows(rows);
  const eda = buildEdaSummary(rows.slice(0, DATASET_EDA_MAX_ROWS), {
    source: 'dataset-profile',
    totalRows: rows.length
  });
  const tableName = resolveDatasetTableName(dataset);

  const { rowsLoaded } = await loadDatasetIntoPostgres({
    datasetId: dataset.datasetId,
    filename: dataset.filename,
    fileType: dataset.fileType,
    buffer,
    columns: profiling.columns,
    rows,
    tableName
  });

  const updated = await repository.update(dataset.datasetId, (current) => {
    const nextMetadata: Record<string, unknown> = {
      ...(current.metadata ?? {}),
      tableName,
      rowsLoaded,
      eda
    };
    delete nextMetadata.loadWarning;

    return {
      ...current,
      nRows: rowsLoaded,
      nCols: profiling.columns.length,
      columns: profiling.columns,
      sample: profiling.sample,
      metadata: nextMetadata
    };
  });

  if (!updated) {
    throw new Error(`Dataset ${dataset.datasetId} no longer exists`);
  }

  return updated;
}

export async function ensureProjectDatasetTablesReady(params: {
  projectId: string;
  referencedTables: string[];
  datasets?: DatasetProfile[];
  repository?: DatasetRepository;
}): Promise<void> {
  if (!hasDatabaseConfiguration() || params.referencedTables.length === 0) {
    return;
  }

  const repository = params.repository ?? createDatasetRepository(env.datasetMetadataPath);
  const datasets = params.datasets ?? await repository.listByProject(params.projectId);
  const datasetsByTable = new Map<string, DatasetProfile>();

  for (const dataset of datasets) {
    datasetsByTable.set(resolveDatasetTableName(dataset).toLowerCase(), dataset);
  }

  const uniqueReferencedTables = [...new Set(params.referencedTables.map((table) => table.toLowerCase()))];

  for (const referencedTable of uniqueReferencedTables) {
    const dataset = datasetsByTable.get(referencedTable);
    if (!dataset) {
      continue;
    }

    const tableName = resolveDatasetTableName(dataset);
    if (await datasetTableExists(tableName)) {
      continue;
    }

    try {
      await rebuildDatasetTableFromSource(dataset, repository);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await repository.update(dataset.datasetId, (current) => ({
        ...current,
        metadata: {
          ...(current.metadata ?? {}),
          tableName,
          loadWarning: message
        }
      }));

      throw Object.assign(
        new Error(
          `Dataset "${dataset.filename}" is not queryable because its SQL table "${tableName}" is missing and automatic rebuild failed: ${message}`
        ),
        { statusCode: 409 }
      );
    }
  }
}
