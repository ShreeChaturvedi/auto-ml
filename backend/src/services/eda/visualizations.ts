/**
 * Visualization generation: histograms, scatter plots, correlations
 */

import type {
  CorrelationSummary,
  HistogramSummary,
  QueryRow,
  ScatterPairData,
  ScatterSummary
} from '../../types/query.js';

import { computeRegressionLine, pearsonCorrelation } from './statistics.js';

/** Coerce an unknown value to a number */
function toNum(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}

/** Max points for legacy single scatter (eda.scatter) */
const MAX_SCATTER_POINTS = 200;
/** Max points per pair in scatterPairs */
const MAX_SCATTER_PAIR_POINTS = 300;
const HISTOGRAM_BUCKETS = 15;

/**
 * Build histogram for a numeric column
 */
export function buildHistogram(rows: QueryRow[], column: string): HistogramSummary | undefined {
  const values = rows
    .map(row => row[column])
    .map(v => toNum(v))
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
      x: toNum(row[xColumn]),
      y: toNum(row[yColumn])
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
 * Build scatter plot data for the top correlated column pairs with regression lines
 */
export function buildScatterPairs(
  rows: QueryRow[],
  numericCols: string[],
  correlations: CorrelationSummary[],
  maxPairs = 15
): ScatterPairData[] | undefined {
  if (!correlations || correlations.length === 0) return undefined;

  // Sort by |coefficient| descending and take top maxPairs
  const topPairs = [...correlations]
    .sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient))
    .slice(0, maxPairs);

  // Collect unique columns needed
  const neededCols = new Set<string>();
  for (const pair of topPairs) {
    neededCols.add(pair.columnA);
    neededCols.add(pair.columnB);
  }

  // Single pass: extract all column values
  const colValues = new Map<string, number[]>();
  for (const col of neededCols) colValues.set(col, []);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (const col of neededCols) {
      const v = toNum(row[col]);
      colValues.get(col)!.push(Number.isFinite(v) ? v : NaN);
    }
  }

  // Assemble pairs from pre-extracted columns
  const results: ScatterPairData[] = [];

  for (const pair of topPairs) {
    const xVals = colValues.get(pair.columnA)!;
    const yVals = colValues.get(pair.columnB)!;
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < xVals.length && points.length < MAX_SCATTER_PAIR_POINTS; i++) {
      if (Number.isFinite(xVals[i]) && Number.isFinite(yVals[i])) {
        points.push({ x: xVals[i], y: yVals[i] });
      }
    }

    if (points.length === 0) continue;

    const regressionLine = computeRegressionLine(points);
    results.push({ xColumn: pair.columnA, yColumn: pair.columnB, points, regressionLine });
  }

  return results.length > 0 ? results : undefined;
}
