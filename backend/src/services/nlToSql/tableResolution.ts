import type { SchemaTableContext } from './types.js';

export function fallbackTableName(filename: string, datasetId: string): string {
  const baseName = filename.replace(/\.[^/.]+$/, '');
  const safe = baseName
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/_$/, '')
    .replace(/^[^a-zA-Z]/, `table_${datasetId.slice(0, 6)}_`)
    .toLowerCase();

  if (!safe) {
    return `table_${datasetId.slice(0, 8)}`;
  }

  return safe.slice(0, 63);
}

export function normalizeTableName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.replace(/^"(.*)"$/, '$1').replace(/""/g, '"');
}

export function canonicalTableKey(value: string): string {
  return normalizeTableName(value)
    .toLowerCase()
    .replace(/_[a-f0-9]{8}$/i, '');
}

export function isTableNameMatch(candidate: string, requested: string): boolean {
  const candidateNormalized = normalizeTableName(candidate).toLowerCase();
  const requestedNormalized = normalizeTableName(requested).toLowerCase();
  if (!candidateNormalized || !requestedNormalized) {
    return false;
  }

  if (candidateNormalized === requestedNormalized) {
    return true;
  }

  if (canonicalTableKey(candidate) === canonicalTableKey(requested)) {
    return true;
  }

  return candidateNormalized.startsWith(`${requestedNormalized}_`)
    || requestedNormalized.startsWith(`${candidateNormalized}_`);
}

export function resolveDefaultTableName(
  tables: SchemaTableContext[],
  requestedDefault?: string
): string | null {
  const normalizedDefault = normalizeTableName(requestedDefault ?? '');
  if (!normalizedDefault) {
    return null;
  }

  const match = tables.find((table) => isTableNameMatch(table.tableName, normalizedDefault));
  return match?.tableName ?? normalizedDefault;
}
