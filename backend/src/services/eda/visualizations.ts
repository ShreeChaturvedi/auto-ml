/**
 * Visualization generation: histograms, scatter plots, correlations
 */

import type {
  CorrelationSummary,
  HistogramSummary,
  QueryRow,
  ScatterSummary
} from '../../types/query.js';

const MAX_SCATTER_POINTS = 200;
const HISTOGRAM_BUCKETS = 15;

/**
 * Build histogram for a numeric column
 */
export function buildHistogram(rows: QueryRow[], column: string): HistogramSummary | undefined {
  const values = rows
    .map(row => row[column])
    .map(v => typeof v === 'number' ? v : Number(v))
    .filter(v => Number.isFinite(v));

  if (values.length === 0) return undefined;

  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }

  // Handle edge case where all values are the same
  if (min === max) {
    return {
      column,
      buckets: [{
        start: min,
        end: max,
        count: values.length
      }]
    };
  }

  const bucketSize = (max - min) / HISTOGRAM_BUCKETS;

  const buckets = Array.from({ length: HISTOGRAM_BUCKETS }).map((_, index) => ({
    start: min + index * bucketSize,
    end: min + (index + 1) * bucketSize,
    count: 0
  }));

  for (const value of values) {
    const index = Math.min(
      HISTOGRAM_BUCKETS - 1,
      Math.floor((value - min) / bucketSize)
    );
    buckets[index].count += 1;
  }

  return { column, buckets };
}

/**
 * Build scatter plot data for two numeric columns
 */
export function buildScatter(rows: QueryRow[], xColumn: string, yColumn: string): ScatterSummary | undefined {
  const points = rows
    .map(row => ({
      x: typeof row[xColumn] === 'number' ? row[xColumn] : Number(row[xColumn]),
      y: typeof row[yColumn] === 'number' ? row[yColumn] : Number(row[yColumn])
    }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    .slice(0, MAX_SCATTER_POINTS);

  if (points.length === 0) return undefined;

  return { xColumn, yColumn, points };
}

/**
 * Build correlation matrix for numeric columns
 */
export function buildCorrelations(rows: QueryRow[], columns: string[]): CorrelationSummary[] | undefined {
  if (columns.length < 2) return undefined;

  const correlations: CorrelationSummary[] = [];

  for (let i = 0; i < columns.length; i++) {
    for (let j = i + 1; j < columns.length; j++) {
      const coefficient = pearsonCorrelation(rows, columns[i], columns[j]);
      if (Number.isFinite(coefficient)) {
        correlations.push({
          columnA: columns[i],
          columnB: columns[j],
          coefficient
        });
      }
    }
  }

  // Sort by absolute correlation strength
  correlations.sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));

  return correlations.length > 0 ? correlations : undefined;
}

/**
 * Calculate Pearson correlation coefficient between two columns
 */
function pearsonCorrelation(rows: QueryRow[], columnA: string, columnB: string): number {
  const pairs = rows
    .map(row => ({
      a: typeof row[columnA] === 'number' ? row[columnA] : Number(row[columnA]),
      b: typeof row[columnB] === 'number' ? row[columnB] : Number(row[columnB])
    }))
    .filter(pair => Number.isFinite(pair.a) && Number.isFinite(pair.b));

  if (pairs.length < 3) return Number.NaN;

  const n = pairs.length;
  const meanA = pairs.reduce((acc, { a }) => acc + a, 0) / n;
  const meanB = pairs.reduce((acc, { b }) => acc + b, 0) / n;

  let numerator = 0;
  let denomA = 0;
  let denomB = 0;

  for (const { a, b } of pairs) {
    const diffA = a - meanA;
    const diffB = b - meanB;
    numerator += diffA * diffB;
    denomA += diffA ** 2;
    denomB += diffB ** 2;
  }

  const denominator = Math.sqrt(denomA * denomB);
  if (denominator === 0) return Number.NaN;

  return numerator / denominator;
}
