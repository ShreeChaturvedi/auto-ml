/**
 * Pure statistical helpers with no feature-specific dependencies.
 * Used by lib/features/preview.ts and any other modules needing
 * numeric summaries or frequency tables.
 */

export interface NumericStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  q1: number;
  q3: number;
  stdDev: number;
  maxAbs: number;
  values: number[];
}

export interface FrequencyEntry {
  count: number;
  total: number;
}

/** Linear-interpolation percentile on a pre-sorted array. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/** Compute common numeric statistics for a column's values. */
export function buildNumericStats(
  rows: Array<Record<string, unknown>>,
  column: string,
  coerce: (v: unknown) => number | null
): NumericStats | null {
  const values = rows
    .map((row) => coerce(row[column]))
    .filter((v): v is number => v !== null);
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  const median = percentile(sorted, 0.5);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const maxAbs = Math.max(Math.abs(min), Math.abs(max));
  const variance =
    sorted.length > 1
      ? sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (sorted.length - 1)
      : 0;
  const stdDev = Math.sqrt(variance);

  return { min, max, mean, median, q1, q3, stdDev, maxAbs, values };
}

/** Build a value → { count, total } frequency table for a column. */
export function buildFrequencies(
  rows: Array<Record<string, unknown>>,
  column: string
): Map<string, FrequencyEntry> {
  const counts = new Map<string, FrequencyEntry>();
  const values = rows.map((row) => String(row[column] ?? ''));
  const total = values.length;
  for (const value of values) {
    const entry = counts.get(value) ?? { count: 0, total };
    entry.count += 1;
    counts.set(value, entry);
  }
  return counts;
}
