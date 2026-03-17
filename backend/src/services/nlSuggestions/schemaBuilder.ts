import { createHash } from 'node:crypto';

import type { DatasetProfile } from '../../types/dataset.js';
import { fallbackTableName, normalizeTableName } from '../nlToSql/tableResolution.js';

import type { SchemaColumnSummary, SchemaTableSummary } from './types.js';

const MAX_TABLES_IN_PROMPT = 24;
const MAX_COLUMNS_PER_TABLE = 18;

function normalizeColumnType(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed || 'unknown';
}

export function buildSchemaSummary(datasets: DatasetProfile[], projectId: string): SchemaTableSummary[] {
  return datasets
    .filter((dataset) => dataset.projectId === projectId)
    .map((dataset) => {
      const metadata = dataset.metadata && typeof dataset.metadata === 'object'
        ? dataset.metadata as Record<string, unknown>
        : {};
      const metadataTableName = typeof metadata.tableName === 'string' ? metadata.tableName : '';

      return {
        tableName: normalizeTableName(metadataTableName) || fallbackTableName(dataset.filename, dataset.datasetId),
        sourceFilename: dataset.filename,
        rowCount: dataset.nRows,
        columns: dataset.columns
          .slice(0, MAX_COLUMNS_PER_TABLE)
          .map((column) => ({
            name: column.name,
            dtype: normalizeColumnType(column.dtype)
          }))
      } satisfies SchemaTableSummary;
    })
    .slice(0, MAX_TABLES_IN_PROMPT);
}

export function buildSchemaFingerprint(tables: SchemaTableSummary[]): string {
  const payload = tables
    .map((table) => ({
      tableName: table.tableName,
      rowCount: table.rowCount,
      columns: table.columns.map((column) => `${column.name}:${column.dtype}`)
    }))
    .sort((left, right) => left.tableName.localeCompare(right.tableName));

  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

export function isNumericLikeColumn(column: SchemaColumnSummary): boolean {
  const dtype = column.dtype.toLowerCase();
  const name = column.name.toLowerCase();
  return /(int|float|double|decimal|numeric|real|number)/.test(dtype)
    || /(amount|revenue|score|count|total|value|price|points|rate|percent|pct|n_correct|n_possible|response|eoc)/.test(name);
}

export function isTimeLikeColumn(column: SchemaColumnSummary): boolean {
  const dtype = column.dtype.toLowerCase();
  const name = column.name.toLowerCase();
  return /(date|time|timestamp)/.test(dtype)
    || /(date|time|timestamp|created_at|updated_at|day|week|month|year)/.test(name);
}

export function findColumn(table: SchemaTableSummary, matcher: (column: SchemaColumnSummary) => boolean): SchemaColumnSummary | null {
  return table.columns.find(matcher) ?? null;
}

export function findDimensionColumn(table: SchemaTableSummary): SchemaColumnSummary | null {
  return table.columns.find((column) => {
    const name = column.name.toLowerCase();
    if (isNumericLikeColumn(column) || isTimeLikeColumn(column)) {
      return false;
    }
    return /(category|type|status|segment|group|class|institution|book|release|chapter|page|region|country|state)/.test(name);
  }) ?? table.columns.find((column) => {
    const name = column.name.toLowerCase();
    return !isNumericLikeColumn(column) && !isTimeLikeColumn(column) && !/^(id|.*_id)$/.test(name);
  }) ?? null;
}
