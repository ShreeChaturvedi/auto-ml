/**
 * edaDataUtils — data transformation utilities for EDA chart components.
 * These are NOT formatters — they transform raw row data for visualization.
 */

import type { HistogramData } from '@/types/file';

export function computeScatterFromRows(
  rows: Record<string, unknown>[],
  xCol: string,
  yCol: string,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (const row of rows) {
    const xVal = Number(row[xCol]);
    const yVal = Number(row[yCol]);
    if (Number.isFinite(xVal) && Number.isFinite(yVal)) {
      points.push({ x: xVal, y: yVal });
    }
  }
  return points;
}

/**
 * Deterministic subsampling using even step size.
 * If rows.length <= maxRows, returns the original array.
 * Otherwise takes every `step`-th row, capped at maxRows.
 */
export function subsampleRows(
  rows: Record<string, unknown>[],
  maxRows: number,
): Record<string, unknown>[] {
  if (rows.length <= maxRows) return rows;
  const step = Math.floor(rows.length / maxRows);
  const result: Record<string, unknown>[] = [];
  for (let i = 0; i < rows.length && result.length < maxRows; i += step) {
    result.push(rows[i]);
  }
  return result;
}

/**
 * Compute a Gaussian KDE (kernel density estimate) from histogram buckets.
 * Uses the provided bandwidth for kernel smoothing.
 */
export function computeKDE(
  buckets: HistogramData['buckets'],
  bandwidth: number,
): { x: number[]; y: number[] } {
  const midpoints = buckets.map((b) => (b.start + b.end) / 2);
  const counts = buckets.map((b) => b.count);
  const totalCount = counts.reduce((s, c) => s + c, 0);

  if (totalCount === 0 || bandwidth <= 0) {
    return { x: [], y: [] };
  }

  const xMin = buckets[0].start;
  const xMax = buckets[buckets.length - 1].end;
  const nPoints = 100;
  const step = (xMax - xMin) / (nPoints - 1);

  const xRange: number[] = [];
  for (let i = 0; i < nPoints; i++) {
    xRange.push(xMin + i * step);
  }

  const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

  const yRange = xRange.map((x) => {
    let density = 0;
    for (let j = 0; j < midpoints.length; j++) {
      const u = (x - midpoints[j]) / bandwidth;
      density += counts[j] * INV_SQRT_2PI * Math.exp(-0.5 * u * u);
    }
    return density / (totalCount * bandwidth);
  });

  return { x: xRange, y: yRange };
}
