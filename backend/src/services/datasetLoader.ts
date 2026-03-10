/**
 * Dataset Loader - Loads uploaded datasets into Postgres tables for querying
 */

import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import type { PoolClient } from 'pg';

import { getDbPool } from '../db.js';
import type { ColumnDataType, DatasetProfileColumn } from '../types/dataset.js';

import {
  coerceBoolean,
  coerceDate,
  coerceFloat,
  coerceInteger,
  isMissingValue
} from './valueCoercion.js';

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

const LEGACY_XLS_ERROR =
  'Legacy .xls spreadsheets are no longer supported. Please convert the file to .xlsx or .csv and upload it again.';

function assertSupportedSpreadsheetFilename(filename?: string) {
  if (filename?.toLowerCase().endsWith('.xls')) {
    throw new Error(LEGACY_XLS_ERROR);
  }
}

export async function parseDatasetRows(
  buffer: Buffer,
  fileType: 'csv' | 'json' | 'xlsx',
  filename?: string
): Promise<Record<string, unknown>[]> {
  switch (fileType) {
    case 'csv': {
      const text = buffer.toString('utf8');
      const rows = parseCsv(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      }) as Record<string, unknown>[];
      return sanitizeDatasetRows(rows);
    }
    case 'json': {
      const text = buffer.toString('utf8');
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          const rows = parsed.filter((item) => typeof item === 'object' && item !== null) as Record<string, unknown>[];
          return sanitizeDatasetRows(rows);
        }
        if (typeof parsed === 'object' && parsed !== null) {
          return sanitizeDatasetRows([parsed as Record<string, unknown>]);
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
          return sanitizeDatasetRows(rows);
        }
        throw error;
      }
    }
    case 'xlsx': {
      assertSupportedSpreadsheetFilename(filename);
      const workbook = new ExcelJS.Workbook();
      void (await workbook.xlsx.load(buffer));
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return [];
      }

      const headerRow = worksheet.getRow(1);
      const headers = headerRow.values
        .slice(1)
        .map((value, index) => {
          const header = stringifySpreadsheetCell(value).trim();
          return header || `column_${index + 1}`;
        });

      if (!headers.length) {
        return [];
      }

      const rows: Record<string, unknown>[] = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          return;
        }

        const record: Record<string, unknown> = {};
        let hasValue = false;

        headers.forEach((header, columnIndex) => {
          const cell = row.getCell(columnIndex + 1);
          const value = normalizeSpreadsheetCell(cell.value);
          if (value !== null && value !== undefined && value !== '') {
            hasValue = true;
          }
          record[header] = value;
        });

        if (hasValue) {
          rows.push(record);
        }
      });

      return sanitizeDatasetRows(rows);
    }
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

function normalizeSpreadsheetCell(value: ExcelJS.CellValue | undefined): unknown {
  if (value === undefined) {
    return null;
  }
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeSpreadsheetCell(entry));
  }
  if (typeof value === 'object') {
    if ('result' in value) {
      return normalizeSpreadsheetCell(value.result);
    }
    if ('text' in value) {
      return value.text;
    }
    if ('hyperlink' in value) {
      return value.text ?? value.hyperlink ?? null;
    }
    if ('richText' in value) {
      return value.richText.map((entry) => entry.text).join('');
    }
    if ('error' in value) {
      return value.error;
    }
  }
  return String(value);
}

function stringifySpreadsheetCell(value: ExcelJS.CellValue | undefined): string {
  const normalized = normalizeSpreadsheetCell(value);
  return normalized === null || normalized === undefined ? '' : String(normalized);
}

function sanitizeDatasetRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => sanitizeObjectValue(row) as Record<string, unknown>);
}

function sanitizeObjectValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeStringValue(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObjectValue(item));
  }

  if (value instanceof Date || value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, nestedValue]) => {
      sanitized[sanitizeStringValue(key)] = sanitizeObjectValue(nestedValue);
    });
    return sanitized;
  }

  return value;
}

function sanitizeStringValue(input: string): string {
  let output = '';

  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);

    // Postgres text/jsonb cannot store NUL bytes.
    if (code === 0x0000) {
      continue;
    }

    // High surrogate must be followed by a low surrogate.
    if (code >= 0xD800 && code <= 0xDBFF) {
      const nextCode = i + 1 < input.length ? input.charCodeAt(i + 1) : undefined;
      if (nextCode !== undefined && nextCode >= 0xDC00 && nextCode <= 0xDFFF) {
        output += input[i];
        output += input[i + 1];
        i += 1;
      } else {
        output += '\uFFFD';
      }
      continue;
    }

    // Unpaired low surrogate.
    if (code >= 0xDC00 && code <= 0xDFFF) {
      output += '\uFFFD';
      continue;
    }

    output += input[i];
  }

  return output;
}

function generateCreateTableSql(tableName: string, columns: DatasetProfileColumn[]): string {
  const columnDefs = columns.map((col) => {
    const pgType = inferPostgresType(col.dtype);
    return `"${col.name}" ${pgType}`;
  });

  return `CREATE TABLE "${tableName}" (${columnDefs.join(', ')})`;
}

function inferPostgresType(dtype: ColumnDataType): string {
  switch (dtype) {
    case 'integer':
      return 'BIGINT';
    case 'float':
      return 'DOUBLE PRECISION';
    case 'boolean':
      return 'BOOLEAN';
    case 'date':
      return 'TIMESTAMP';
    case 'unknown':
    case 'string':
    default:
      return 'TEXT';
  }
}

function stringifyValueForError(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function normalizeValueForColumn(
  value: unknown,
  dtype: ColumnDataType,
  options: { strictMode?: boolean; columnName?: string } = {}
): unknown {
  if (isMissingValue(value)) {
    return null;
  }

  let normalized: unknown;

  switch (dtype) {
    case 'integer':
      normalized = coerceInteger(value);
      break;
    case 'float':
      normalized = coerceFloat(value);
      break;
    case 'boolean':
      normalized = coerceBoolean(value);
      break;
    case 'date':
      normalized = coerceDate(value)?.toISOString() ?? null;
      break;
    case 'unknown':
    case 'string':
      return typeof value === 'string' ? sanitizeStringValue(value) : value;
    default:
      normalized = null;
      break;
  }

  if (normalized !== null) {
    return normalized;
  }

  if (options.strictMode) {
    const renderedValue = stringifyValueForError(value);
    const columnContext = options.columnName ? ` for column "${options.columnName}"` : '';
    throw new Error(`Value "${renderedValue}" cannot be coerced to ${dtype}${columnContext}`);
  }

  return null;
}

async function insertRows(
  client: PoolClient,
  tableName: string,
  columns: DatasetProfileColumn[],
  rows: Record<string, unknown>[],
  strictMode: boolean,
  strictColumnNames?: string[]
): Promise<number> {
  if (rows.length === 0) return 0;

  const columnNames = columns.map(c => c.name);

  // Postgres has a parameter limit of ~32k parameters
  // Calculate batch size to stay under this limit
  const maxParams = 30000; // Leave some buffer
  const paramsPerRow = Math.max(columnNames.length, 1);
  const batchSize = Math.max(1, Math.floor(maxParams / paramsPerRow));

  let totalRowsInserted = 0;
  const dtypeByColumnName = new Map(columns.map((column) => [column.name, column.dtype]));
  const strictColumnSet =
    strictMode && strictColumnNames && strictColumnNames.length > 0
      ? new Set(strictColumnNames)
      : undefined;

  // Insert in batches
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const placeholders = batch.map((_, rowIdx) => {
      const valuePlaceholders = columnNames.map((_, colIdx) => `$${rowIdx * columnNames.length + colIdx + 1}`);
      return `(${valuePlaceholders.join(', ')})`;
    });

    const values: unknown[] = [];
    batch.forEach((row, batchRowIdx) => {
      columnNames.forEach((colName) => {
        const dtype = dtypeByColumnName.get(colName) ?? 'string';
        try {
          const strictForColumn = strictMode && (!strictColumnSet || strictColumnSet.has(colName));
          values.push(
            normalizeValueForColumn(row[colName], dtype, {
              strictMode: strictForColumn,
              columnName: colName
            })
          );
        } catch (error) {
          const rowNumber = i + batchRowIdx + 1;
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Row ${rowNumber}: ${message}`);
        }
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
