/**
 * Visualization generation: histograms, scatter plots, correlations
 */

import type {
  CorrelationSummary,
  HistogramSummary,
  QueryRow,
  RegressionLine,
  ScatterPairData,
  ScatterSummary
} from '../../types/query.js';

/** Coerce an unknown value to a number */
function toNum(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}

const MAX_SCATTER_POINTS = 200;
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

const MAX_SCATTER_PAIR_POINTS = 300;

/**
 * Compute OLS regression line for a set of points
 */
export function computeRegressionLine(points: Array<{ x: number; y: number }>): RegressionLine | undefined {
  if (points.length < 2) return undefined;

  const n = points.length;
  const meanX = points.reduce((acc, p) => acc + p.x, 0) / n;
  const meanY = points.reduce((acc, p) => acc + p.y, 0) / n;

  let ssXX = 0;
  let ssXY = 0;
  let ssTot = 0;

  for (const p of points) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    ssXX += dx * dx;
    ssXY += dx * dy;
    ssTot += dy * dy;
  }

  // Guard: all x values identical
  if (ssXX === 0) return undefined;

  const slope = ssXY / ssXX;
  const intercept = meanY - slope * meanX;

  // Guard: all y values identical (SS_tot = 0)
  if (ssTot === 0) {
    return { slope, intercept, r2: 1 };
  }

  // R² = 1 - SS_res / SS_tot
  let ssRes = 0;
  for (const p of points) {
    const predicted = slope * p.x + intercept;
    ssRes += (p.y - predicted) ** 2;
  }

  const r2 = 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
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

/**
 * Calculate Pearson correlation coefficient between two columns
 */
function pearsonCorrelation(rows: QueryRow[], columnA: string, columnB: string): number {
  const pairs = rows
    .map(row => ({
      a: toNum(row[columnA]),
      b: toNum(row[columnB])
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
