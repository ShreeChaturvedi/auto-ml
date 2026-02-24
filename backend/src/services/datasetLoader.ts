/**
 * Dataset Loader - Loads uploaded datasets into Postgres tables for querying
 */

import { parse as parseCsv } from 'csv-parse/sync';
import type { PoolClient } from 'pg';
import XLSX from 'xlsx';

import { getDbPool } from '../db.js';
import type { DatasetProfileColumn } from '../types/dataset.js';

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
}): Promise<{ tableName: string; rowsLoaded: number }> {
  const { datasetId, filename, fileType, buffer, columns } = params;

  // Sanitize filename to create valid table name
  const tableName = sanitizeTableName(filename, datasetId);

  // Parse data based on file type
  const rows = params.rows ?? parseDatasetRows(buffer, fileType);

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
    const rowsLoaded = await insertRows(client, tableName, columns, rows);

    await client.query('COMMIT');

    console.log(`[datasetLoader] Loaded ${rowsLoaded} rows into "${tableName}"`);

    return { tableName, rowsLoaded };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[datasetLoader] Failed to load dataset into table "${tableName}"`, error);
    throw error;
  } finally {
    client.release();
  }
}

export function sanitizeTableName(filename: string, datasetId: string, forceUnique = false): string {
  // Remove extension and sanitize to create clean, user-friendly table name
  const baseName = filename.replace(/\.[^/.]+$/, '');
  let sanitized = baseName
    .replace(/[^a-zA-Z0-9_]/g, '_') // Replace invalid chars with underscore
    .replace(/^[^a-zA-Z]/, 'table_') // Ensure starts with letter
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/_$/, '') // Remove trailing underscore
    .toLowerCase();

  if (!sanitized) {
    sanitized = 'table_data';
  }

  // Only add suffix if forceUnique is requested (for collision handling)
  if (forceUnique) {
    const suffix = datasetId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    const separator = suffix ? `_${suffix}` : '';
    const maxBaseLength = 63 - separator.length;
    const trimmed = sanitized.slice(0, maxBaseLength);
    return `${trimmed || 'table_data'}${separator}`;
  }

  // Return clean name without suffix (max 63 chars for Postgres identifier)
  return sanitized.slice(0, 63) || 'table_data';
}

export function parseDatasetRows(
  buffer: Buffer,
  fileType: 'csv' | 'json' | 'xlsx'
): Record<string, unknown>[] {
  switch (fileType) {
    case 'csv': {
      const text = buffer.toString('utf8');
      return parseCsv(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      }) as Record<string, unknown>[];
    }
    case 'json': {
      const text = buffer.toString('utf8');
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return parsed.filter((item) => typeof item === 'object' && item !== null) as Record<string, unknown>[];
        }
        if (typeof parsed === 'object' && parsed !== null) {
          return [parsed as Record<string, unknown>];
        }
        throw new Error('JSON dataset must be an object or array of objects');
      } catch (error) {
        // Attempt to parse as NDJSON
        const lines = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        const rows: Record<string, unknown>[] = [];
        for (const line of lines) {
          try {
            const value = JSON.parse(line);
            if (typeof value === 'object' && value !== null) {
              rows.push(value as Record<string, unknown>);
            }
          } catch {
            console.warn('[datasetLoader] Skipping invalid JSON line');
          }
        }
        if (rows.length > 0) {
          return rows;
        }
        throw error;
      }
    }
    case 'xlsx': {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return [];
      const sheet = workbook.Sheets[sheetName];
      return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
    }
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

function generateCreateTableSql(tableName: string, columns: DatasetProfileColumn[]): string {
  const columnDefs = columns.map((col) => {
    const pgType = inferPostgresType(col.dtype);
    return `"${col.name}" ${pgType}`;
  });

  return `CREATE TABLE "${tableName}" (${columnDefs.join(', ')})`;
}

function inferPostgresType(dtype: string): string {
  switch (dtype) {
    case 'number':
      return 'DOUBLE PRECISION';
    case 'boolean':
      return 'BOOLEAN';
    case 'date':
      return 'TIMESTAMP';
    case 'string':
    default:
      return 'TEXT';
  }
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  }
  return null;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
}

function coerceDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    // Guard against Date.parse permissiveness for arbitrary expressions (e.g., "1 = 1").
    const hasDateLikeDelimiters = /[-/:T]/.test(trimmed);
    if (!hasDateLikeDelimiters) {
      return null;
    }
    const timestamp = Date.parse(trimmed);
    if (!Number.isNaN(timestamp)) {
      return new Date(timestamp).toISOString();
    }
  }

  return null;
}

export function normalizeValueForColumn(value: unknown, dtype: string): unknown {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  switch (dtype) {
    case 'number':
      return coerceNumber(value);
    case 'boolean':
      return coerceBoolean(value);
    case 'date':
      return coerceDate(value);
    case 'string':
    default:
      return value;
  }
}

async function insertRows(
  client: PoolClient,
  tableName: string,
  columns: DatasetProfileColumn[],
  rows: Record<string, unknown>[]
): Promise<number> {
  if (rows.length === 0) return 0;

  const columnNames = columns.map(c => c.name);

  // Postgres has a parameter limit of ~32k parameters
  // Calculate batch size to stay under this limit
  const maxParams = 30000; // Leave some buffer
  const paramsPerRow = columnNames.length;
  const batchSize = Math.floor(maxParams / paramsPerRow);

  let totalRowsInserted = 0;
  const dtypeByColumnName = new Map(columns.map((column) => [column.name, column.dtype]));

  // Insert in batches
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const placeholders = batch.map((_, rowIdx) => {
      const valuePlaceholders = columnNames.map((_, colIdx) => `$${rowIdx * columnNames.length + colIdx + 1}`);
      return `(${valuePlaceholders.join(', ')})`;
    });

    const values: unknown[] = [];
    batch.forEach((row) => {
      columnNames.forEach((colName) => {
        const dtype = dtypeByColumnName.get(colName) ?? 'string';
        values.push(normalizeValueForColumn(row[colName], dtype));
      });
    });

    const insertSql = `
      INSERT INTO "${tableName}" (${columnNames.map(n => `"${n}"`).join(', ')})
      VALUES ${placeholders.join(', ')}
    `;

    await client.query(insertSql, values);
    totalRowsInserted += batch.length;

    if (batch.length < batchSize) {
      console.log(`[datasetLoader] Inserted ${totalRowsInserted} rows in ${Math.ceil(rows.length / batchSize)} batches`);
    }
  }

  return totalRowsInserted;
}
