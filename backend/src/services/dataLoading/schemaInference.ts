/**
 * Schema Inference - Type detection and CREATE TABLE SQL generation
 */

import type { ColumnDataType, DatasetProfileColumn } from '../../types/dataset.js';

export function generateCreateTableSql(tableName: string, columns: DatasetProfileColumn[]): string {
  const columnDefs = columns.map((col) => {
    const pgType = inferPostgresType(col.dtype);
    return `"${col.name}" ${pgType}`;
  });

  return `CREATE TABLE "${tableName}" (${columnDefs.join(', ')})`;
}

export function inferPostgresType(dtype: ColumnDataType): string {
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
