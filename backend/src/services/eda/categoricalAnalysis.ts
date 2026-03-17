/**
 * Categorical column summary generation
 */

import type { CategoricalSummary, DataQualitySummary, QueryRow } from '../../types/query.js';

import type { ColumnType } from './columnDetection.js';

const MAX_TOP_VALUES = 10;

/**
 * Compute categorical column summaries
 */
export function computeCategoricalSummaries(rows: QueryRow[], columns: string[]): CategoricalSummary[] {
  return columns.map(column => {
    const valueCounts = new Map<string, number>();
    let missingCount = 0;

    for (const row of rows) {
      const value = row[column];
      if (value === null || value === undefined || value === '') {
        missingCount++;
        continue;
      }
      const strValue = String(value);
      valueCounts.set(strValue, (valueCounts.get(strValue) ?? 0) + 1);
    }

    // Sort by count descending
    const sortedEntries = Array.from(valueCounts.entries())
      .sort((a, b) => b[1] - a[1]);

    const totalNonMissing = rows.length - missingCount;
    const topValues = sortedEntries.slice(0, MAX_TOP_VALUES).map(([value, count]) => ({
      value,
      count,
      percentage: totalNonMissing > 0 ? (count / totalNonMissing) * 100 : 0
    }));

    const mode = sortedEntries.length > 0 ? sortedEntries[0][0] : null;

    return {
      column,
      uniqueCount: valueCounts.size,
      topValues,
      missingCount,
      mode
    };
  });
}

/**
 * Compute data quality metrics for all columns
 */
export function computeDataQuality(
  rows: QueryRow[],
  columns: string[],
  columnTypes: Record<string, ColumnType>
): DataQualitySummary[] {
  return columns.map(column => {
    const uniqueValues = new Set<unknown>();
    let missingCount = 0;

    for (const row of rows) {
      const value = row[column];
      if (value === null || value === undefined || value === '') {
        missingCount++;
      } else {
        uniqueValues.add(value);
      }
    }

    const totalCount = rows.length;
    return {
      column,
      dataType: columnTypes[column],
      totalCount,
      missingCount,
      missingPercentage: totalCount > 0 ? (missingCount / totalCount) * 100 : 0,
      uniqueCount: uniqueValues.size,
      uniquePercentage: totalCount > 0 ? (uniqueValues.size / totalCount) * 100 : 0
    };
  });
}
