/**
 * Column type detection using heuristics
 */

import type { QueryRow } from '../../types/query.js';

export type ColumnType = 'numeric' | 'categorical' | 'datetime' | 'boolean' | 'mixed';

/**
 * Detect column data types using heuristics
 */
export function detectColumnTypes(
  rows: QueryRow[],
  columns: string[]
): Record<string, ColumnType> {
  const types: Record<string, ColumnType> = {};

  for (const column of columns) {
    const values = rows.map(row => row[column]).filter(v => v !== null && v !== undefined && v !== '');

    if (values.length === 0) {
      types[column] = 'categorical';
      continue;
    }

    // Check for boolean
    const booleanValues = new Set(['true', 'false', '0', '1', 'yes', 'no']);
    const allBoolean = values.every(v => {
      const str = String(v).toLowerCase();
      return booleanValues.has(str) || typeof v === 'boolean';
    });
    if (allBoolean && values.length > 0) {
      types[column] = 'boolean';
      continue;
    }

    // Check for numeric
    const numericCount = values.filter(v => {
      if (typeof v === 'number') return true;
      if (typeof v === 'string') {
        const parsed = Number(v);
        return !Number.isNaN(parsed) && v.trim() !== '';
      }
      return false;
    }).length;

    const numericRatio = numericCount / values.length;

    if (numericRatio >= 0.9) {
      types[column] = 'numeric';
      continue;
    }

    // Check for datetime patterns
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}/, // ISO date
      /^\d{2}\/\d{2}\/\d{4}/, // US date
      /^\d{4}\/\d{2}\/\d{2}/, // Alternative ISO
    ];

    const dateCount = values.filter(v => {
      const str = String(v);
      return datePatterns.some(pattern => pattern.test(str)) || !Number.isNaN(Date.parse(str));
    }).length;

    if (dateCount / values.length >= 0.8) {
      types[column] = 'datetime';
      continue;
    }

    // Default to categorical
    types[column] = 'categorical';
  }

  return types;
}
