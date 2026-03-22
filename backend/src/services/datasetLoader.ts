/**
 * Dataset Loader - Orchestrates loading uploaded datasets into Postgres tables
 *
 * Parsing, schema inference, and row insertion are delegated to focused modules
 * under `dataLoading/`. This file wires them together and re-exports the public
 * API so existing consumers continue to work without import changes.
 */

import { getDbPool } from '../db.js';
import { appLogger } from '../logging/logger.js';
import type { DatasetProfile, DatasetProfileColumn } from '../types/dataset.js';

import { insertRows } from './dataLoading/dataInsertion.js';
import { parseDatasetRows } from './dataLoading/fileParser.js';
import { generateCreateTableSql, sanitizeTableName } from './dataLoading/schemaInference.js';

// ── Re-exports (preserve existing consumer imports) ─────────────────────────
export { normalizeValueForColumn } from './dataLoading/dataInsertion.js';
export { parseDatasetRows } from './dataLoading/fileParser.js';
export { sanitizeTableName } from './dataLoading/schemaInference.js';

/** Resolve the Postgres table name for a dataset, preferring stored metadata. */
export function resolveDatasetTableName(dataset: Pick<DatasetProfile, 'datasetId' | 'filename' | 'metadata'>): string {
  return typeof dataset.metadata?.tableName === 'string'
    ? dataset.metadata.tableName
    : sanitizeTableName(dataset.filename, dataset.datasetId);
}

/**
 * Load a dataset into a Postgres table
 */
export async function loadDatasetIntoPostgres(params: {
  datasetId: string;
  filename: string;
  fileType: 'csv' | 'json' | 'xlsx';
  buffer: Buffer;
  columns: DatasetProfileColumn[];
  rows?: Record<string, unknown>[];
  strictMode?: boolean;
  strictColumnNames?: string[];
}): Promise<{ tableName: string; rowsLoaded: number }> {
  const {
    datasetId,
    filename,
    fileType,
    buffer,
    columns,
    strictMode = false,
    strictColumnNames
  } = params;

  // Sanitize filename to create valid table name
  const tableName = sanitizeTableName(filename, datasetId);

  // Parse data based on file type
  const rows = params.rows ?? await parseDatasetRows(buffer, fileType, filename);

  if (rows.length === 0) {
    throw new Error('No data rows to load');
  }

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Drop table if it exists (idempotent uploads)
    await client.query(`DROP TABLE IF EXISTS "${tableName}"`);

    // Create table with inferred schema
    const createTableSql = generateCreateTableSql(tableName, columns);
    await client.query(createTableSql);

    // Insert data
    const rowsLoaded = await insertRows(
      client,
      tableName,
      columns,
      rows,
      strictMode,
      strictColumnNames
    );

    await client.query('COMMIT');

    appLogger.info(`[datasetLoader] Loaded ${rowsLoaded} rows into "${tableName}"`);

    return { tableName, rowsLoaded };
  } catch (error) {
    await client.query('ROLLBACK');
    appLogger.error(`[datasetLoader] Failed to load dataset into table "${tableName}"`, error);
    throw error;
  } finally {
    client.release();
  }
}
