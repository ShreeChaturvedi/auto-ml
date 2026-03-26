/**
 * Data Insertion - Batch row insertion and value coercion for Postgres
 */

import type { PoolClient } from 'pg';

import { appLogger } from '../../logging/logger.js';
import type { ColumnDataType, DatasetProfileColumn } from '../../types/dataset.js';
import {
  coerceBoolean,
  coerceDate,
  coerceFloat,
  coerceInteger,
  isMissingValue
} from '../valueCoercion.js';

import { sanitizeStringValue } from './sanitization.js';

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

export async function insertRows(
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
      appLogger.info(`[datasetLoader] Inserted ${totalRowsInserted} rows in ${Math.ceil(rows.length / batchSize)} batches`);
    }
  }

  return totalRowsInserted;
}
