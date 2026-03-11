/**
 * Numeric column summary generation
 */

import type { NumericSummary, QueryRow } from '../../types/query.js';

/**
 * Compute comprehensive numeric column statistics
 */
export function computeNumericSummaries(rows: QueryRow[], columns: string[]): NumericSummary[] {
  return columns.map(column => {
    const values = rows
      .map(row => row[column])
      .map(v => typeof v === 'number' ? v : Number(v))
      .filter(v => Number.isFinite(v))
      .sort((a, b) => a - b);

    if (values.length === 0) {
      return {
        column,
        min: 0,
        max: 0,
        mean: 0,
        median: 0,
        stdDev: 0,
        skewness: 0,
        q1: 0,
        q3: 0,
        outlierCount: 0
      };
    }

    const n = values.length;
    const min = values[0];
    const max = values[n - 1];
    const sum = values.reduce((acc, v) => acc + v, 0);
    const mean = sum / n;

    // Median
    const median = n % 2 === 0
      ? (values[n / 2 - 1] + values[n / 2]) / 2
      : values[Math.floor(n / 2)];

    // Quartiles (using linear interpolation)
    const q1 = percentile(values, 25);
    const q3 = percentile(values, 75);

    // Standard deviation (sample)
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / Math.max(1, n - 1);
    const stdDev = Math.sqrt(variance);

    // Skewness (Fisher-Pearson)
    const skewness = stdDev > 0
      ? (values.reduce((acc, v) => acc + ((v - mean) / stdDev) ** 3, 0) / n)
      : 0;

    // Outlier detection using IQR method
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const outlierCount = values.filter(v => v < lowerFence || v > upperFence).length;

    return {
      column,
      min,
      max,
      mean,
      median,
      stdDev,
      skewness,
      q1,
      q3,
      outlierCount
    };
  });
}

/**
 * Calculate percentile value from sorted array
 */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;

  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] * (1 - fraction) + sortedValues[upper] * fraction;
}
