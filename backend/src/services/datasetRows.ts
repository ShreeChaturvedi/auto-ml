import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { env } from '../config.js';
import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import type { DatasetProfile } from '../types/dataset.js';

import { parseDatasetRows, sanitizeTableName } from './datasetLoader.js';
import { quoteIdentifier } from './nlToSql/identifiers.js';

export interface DatasetRowsPage {
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
  offset: number;
  limit: number;
}

export interface DatasetRowsPageRequest {
  offset: number;
  limit: number;
}

export const DEFAULT_DATASET_ROWS_LIMIT = 200;
export const MAX_DATASET_ROWS_LIMIT = 1000;

export function resolveDatasetTableName(dataset: Pick<DatasetProfile, 'datasetId' | 'filename' | 'metadata'>) {
  return typeof dataset.metadata?.tableName === 'string'
    ? dataset.metadata.tableName
    : sanitizeTableName(dataset.filename, dataset.datasetId);
}

async function readDatasetRowsFromPostgres(dataset: DatasetProfile, page: DatasetRowsPageRequest) {
  const pool = getDbPool();
  const tableName = resolveDatasetTableName(dataset);
  const result = await pool.query(
    `SELECT * FROM ${quoteIdentifier(tableName)} ORDER BY ctid OFFSET $1 LIMIT $2`,
    [page.offset, page.limit]
  );
  return result.rows as Record<string, unknown>[];
}

async function readDatasetRowsFromFile(dataset: DatasetProfile, page: DatasetRowsPageRequest) {
  const datasetDir = join(env.datasetStorageDir, dataset.datasetId);
  const filePath = join(datasetDir, dataset.filename);

  if (!existsSync(filePath)) {
    throw Object.assign(new Error('Dataset file not found on disk'), { statusCode: 404 });
  }

  const buffer = readFileSync(filePath);
  const rows = await parseDatasetRows(buffer, dataset.fileType, dataset.filename);
  return rows.slice(page.offset, page.offset + page.limit);
}

export async function getDatasetRowsPage(
  dataset: DatasetProfile,
  page: DatasetRowsPageRequest
): Promise<DatasetRowsPage> {
  if (page.offset >= dataset.nRows) {
    return {
      rows: [],
      columns: dataset.columns.map((column) => column.name),
      rowCount: dataset.nRows,
      offset: page.offset,
      limit: page.limit
    };
  }

  let rows: Record<string, unknown>[];
  if (hasDatabaseConfiguration()) {
    try {
      rows = await readDatasetRowsFromPostgres(dataset, page);
    } catch (error) {
      console.warn(
        `[datasets] Failed to load rows from Postgres for ${dataset.datasetId}, falling back to file storage:`,
        error instanceof Error ? error.message : String(error)
      );
      rows = await readDatasetRowsFromFile(dataset, page);
    }
  } else {
    rows = await readDatasetRowsFromFile(dataset, page);
  }

  return {
    rows,
    columns: dataset.columns.map((column) => column.name),
    rowCount: dataset.nRows,
    offset: page.offset,
    limit: page.limit
  };
}
