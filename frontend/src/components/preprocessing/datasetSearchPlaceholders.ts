import type { AvailableTable } from '@/types/preprocessing';

const FALLBACK_SEARCH_PLACEHOLDERS = [
  'customer_churn.csv',
  'dataset_abc123',
  'transactions_2025'
];

const MAX_PLACEHOLDERS = 12;

/**
 * Build animated search placeholder candidates from real dataset values
 * in the current project (filename, id, and table name).
 */
export function buildDatasetSearchPlaceholders(tables: AvailableTable[]): string[] {
  const uniqueValues = new Set<string>();
  const placeholders: string[] = [];

  const addValue = (value: string | undefined) => {
    const normalized = value?.trim();
    if (!normalized) return;

    const dedupeKey = normalized.toLowerCase();
    if (uniqueValues.has(dedupeKey)) return;

    uniqueValues.add(dedupeKey);
    placeholders.push(normalized);
  };

  for (const table of tables) {
    addValue(table.filename);
    addValue(table.datasetId);
    addValue(table.name);

    if (placeholders.length >= MAX_PLACEHOLDERS) {
      return placeholders.slice(0, MAX_PLACEHOLDERS);
    }
  }

  if (placeholders.length > 0) {
    return placeholders.slice(0, MAX_PLACEHOLDERS);
  }

  return FALLBACK_SEARCH_PLACEHOLDERS;
}
