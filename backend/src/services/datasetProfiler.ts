import type { DatasetFileType, DatasetProfileColumn } from '../types/dataset.js';

import { parseDatasetRows } from './datasetLoader.js';

interface ProfileOptions {
  sampleSize?: number;
  maxRows?: number;
}

const DEFAULT_OPTIONS: Required<ProfileOptions> = {
  sampleSize: 20,
  maxRows: 5000
};

export interface DatasetProfilingResult {
  nRows: number;
  columns: DatasetProfileColumn[];
  sample: Record<string, unknown>[];
}

export function profileDataset(buffer: Buffer, fileType: DatasetFileType, options: ProfileOptions = {}): DatasetProfilingResult {
  const rows = parseDatasetRows(buffer, fileType);
  return profileDatasetRows(rows, options);
}

export function profileDatasetRows(
  rows: Record<string, unknown>[],
  options: ProfileOptions = {}
): DatasetProfilingResult {
  const effectiveOptions = { ...DEFAULT_OPTIONS, ...options };
  const rowsForProfile = rows.slice(0, effectiveOptions.maxRows);
  const columns = buildColumns(rowsForProfile);
  const sample = rowsForProfile.slice(0, effectiveOptions.sampleSize);

  return {
    nRows: rows.length,
    columns,
    sample
  };
}

function buildColumns(rows: Record<string, unknown>[]): DatasetProfileColumn[] {
  const columns = new Map<string, { values: unknown[]; nullCount: number }>();

  for (const row of rows) {
    Object.keys(row).forEach((key) => {
      if (!columns.has(key)) {
        columns.set(key, { values: [], nullCount: 0 });
      }
      const entry = columns.get(key)!;
      const value = row[key];
      if (value === null || value === undefined || value === '') {
        entry.nullCount += 1;
      } else {
        entry.values.push(value);
      }
    });

    // Track missing columns as null
    columns.forEach((entry, key) => {
      if (!(key in row)) {
        entry.nullCount += 1;
      }
    });
  }

  return Array.from(columns.entries()).map(([name, data]) => {
    const sampleCount = data.values.length;
    const { dtype, numericValues, dateValues } = inferColumnType(data.values);
    const uniqueStats = buildUniqueStats(data.values);
    const numericStats =
      dtype === 'number' ? buildNumericStats(numericValues) : undefined;
    const dateStats =
      dtype === 'date' ? buildDateStats(dateValues) : undefined;

    return {
      name,
      dtype,
      nullCount: data.nullCount,
      sampleCount,
      uniqueCount: uniqueStats.uniqueCount,
      topValues: uniqueStats.topValues,
      ...(numericStats ?? {}),
      ...(dateStats ?? {})
    };
  });
}

function inferColumnType(values: unknown[]): {
  dtype: string;
  numericValues: number[];
  dateValues: Date[];
} {
  if (values.length === 0) {
    return { dtype: 'unknown', numericValues: [], dateValues: [] };
  }

  const numericValues: number[] = [];
  const booleanValues: boolean[] = [];
  const dateValues: Date[] = [];

  for (const value of values) {
    const numeric = coerceNumber(value);
    if (numeric !== null) {
      numericValues.push(numeric);
      continue;
    }

    const booleanValue = coerceBoolean(value);
    if (booleanValue !== null) {
      booleanValues.push(booleanValue);
      continue;
    }

    const dateValue = coerceDate(value);
    if (dateValue) {
      dateValues.push(dateValue);
    }
  }

  const total = values.length || 1;
  const numericRatio = numericValues.length / total;
  const booleanRatio = booleanValues.length / total;
  const dateRatio = dateValues.length / total;

  if (numericRatio >= 0.9) {
    return { dtype: 'number', numericValues, dateValues: [] };
  }
  if (booleanRatio >= 0.9) {
    return { dtype: 'boolean', numericValues: [], dateValues: [] };
  }
  if (dateRatio >= 0.9) {
    return { dtype: 'date', numericValues: [], dateValues };
  }

  return { dtype: 'string', numericValues: [], dateValues: [] };
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  return null;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function coerceDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || /^\d+(\.\d+)?$/.test(trimmed)) {
      return null;
    }
    const timestamp = Date.parse(trimmed);
    if (!Number.isNaN(timestamp)) {
      return new Date(timestamp);
    }
  }
  return null;
}

function buildUniqueStats(values: unknown[]): {
  uniqueCount: number;
  topValues: Array<{ value: string; count: number; percentage: number }>;
} {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = stringifyValue(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const total = values.length || 1;
  const topValues = entries.slice(0, 5).map(([value, count]) => ({
    value,
    count,
    percentage: Number(((count / total) * 100).toFixed(2))
  }));

  return { uniqueCount: counts.size, topValues };
}

function buildNumericStats(values: number[]): {
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  skewness: number;
  q1: number;
  q3: number;
} | undefined {
  if (values.length === 0) return undefined;

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const min = sorted[0];
  const max = sorted[n - 1];
  const mean = sorted.reduce((sum, value) => sum + value, 0) / n;
  const median = percentile(sorted, 0.5);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const variance =
    n > 1
      ? sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)
      : 0;
  const stdDev = Math.sqrt(variance);
  const skewness =
    stdDev > 0
      ? sorted.reduce((sum, value) => sum + (value - mean) ** 3, 0) / n / (stdDev ** 3)
      : 0;

  return {
    min,
    max,
    mean: Number(mean.toFixed(4)),
    median: Number(median.toFixed(4)),
    stdDev: Number(stdDev.toFixed(4)),
    skewness: Number(skewness.toFixed(4)),
    q1: Number(q1.toFixed(4)),
    q3: Number(q3.toFixed(4))
  };
}

function buildDateStats(values: Date[]): { minDate: string; maxDate: string } | undefined {
  if (values.length === 0) return undefined;
  const timestamps = values.map((value) => value.getTime()).sort((a, b) => a - b);
  const minDate = new Date(timestamps[0]).toISOString();
  const maxDate = new Date(timestamps[timestamps.length - 1]).toISOString();
  return { minDate, maxDate };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
