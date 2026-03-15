/**
 * Pure statistical computation functions for EDA analysis.
 */
import type { QueryRow, RegressionLine } from '../../types/query.js';

/** Coerce an unknown value to a number */
function toNum(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}

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
 * Calculate Pearson correlation coefficient between two columns
 */
export function pearsonCorrelation(rows: QueryRow[], columnA: string, columnB: string): number {
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
