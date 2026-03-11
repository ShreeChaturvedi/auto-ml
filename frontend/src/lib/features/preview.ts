import type { FeatureMethod } from '@/types/feature';
import { buildNumericStats, buildFrequencies, percentile } from '@/lib/stats';

type Row = Record<string, unknown>;

type FeatureLike = {
  method: FeatureMethod;
  sourceColumn: string;
  secondaryColumn?: string;
  featureName: string;
  params?: Record<string, unknown>;
};

export interface FeaturePreviewResult {
  columns: string[];
  rows: Array<Row>;
  summary?: Record<string, { min: number; max: number; mean: number }>;
  note?: string;
}

/** Shared context passed to every strategy handler. */
type PreviewContext = {
  feature: FeatureLike;
  sample: Row[];
  params: Record<string, unknown>;
  sourceColumn: string;
  secondaryColumn: string | undefined;
  summaryValues: Record<string, number[]>;
  addOutputValue: (row: Row, column: string, value: unknown) => void;
  getSource: (row: Row) => unknown;
  getSecondary: (row: Row) => unknown;
  categories: string[];
  categoryMap: Map<string, number>;
};

/** Every strategy returns column names, output rows, and an optional note. */
type PreviewFn = (ctx: PreviewContext) => {
  columns: string[];
  rows: Row[];
  note?: string;
} | null;

// ---------------------------------------------------------------------------
// Strategy map: outer dispatch
// ---------------------------------------------------------------------------

const previewStrategyMap = new Map<FeatureMethod, PreviewFn>();

/**
 * All methods that produce a single output column are routed here.
 * Per-row value computation is handled by the inner switch.
 */
function singleOutputHandler(ctx: PreviewContext): ReturnType<PreviewFn> {
  const {
    feature,
    sample,
    params,
    sourceColumn,
    addOutputValue,
    getSource,
    getSecondary,
  } = ctx;

  const numericStats = buildNumericStats(sample, sourceColumn, coerceNumber);
  const quantiles = numericStats ? buildQuantiles(numericStats.values) : null;
  const frequencies = buildFrequencies(sample, sourceColumn);
  const targetColumn = params.targetColumn as string | undefined;
  const targetStats = targetColumn
    ? buildTargetStats(sample, sourceColumn, targetColumn)
    : null;

  const outputColumns = [feature.featureName];
  const outputRows: Row[] = [];
  let note: string | undefined;

  for (const row of sample) {
    const outputRow: Row = { [sourceColumn]: getSource(row) };

    const sourceVal = getSource(row);
    const secondaryVal = getSecondary(row);
    const numericVal = coerceNumber(sourceVal);
    const secondaryNum = coerceNumber(secondaryVal);
    let value: unknown = null;

    switch (feature.method) {
      case 'log_transform': {
        const offset = Number(params.offset ?? 1);
        value = numericVal !== null ? Math.log(numericVal + offset) : null;
        break;
      }
      case 'log1p_transform':
        value = numericVal !== null ? Math.log1p(numericVal) : null;
        break;
      case 'sqrt_transform':
        value = numericVal !== null && numericVal >= 0 ? Math.sqrt(numericVal) : null;
        break;
      case 'square_transform':
        value = numericVal !== null ? numericVal ** 2 : null;
        break;
      case 'reciprocal_transform':
        value = numericVal !== null && numericVal !== 0 ? 1 / numericVal : null;
        break;
      case 'standardize':
        if (numericStats && numericVal !== null && numericStats.stdDev > 0) {
          value = (numericVal - numericStats.mean) / numericStats.stdDev;
        }
        break;
      case 'min_max_scale': {
        if (numericStats && numericVal !== null && numericStats.max !== numericStats.min) {
          const min = Number(params.min ?? 0);
          const max = Number(params.max ?? 1);
          value =
            ((numericVal - numericStats.min) / (numericStats.max - numericStats.min)) *
              (max - min) +
            min;
        }
        break;
      }
      case 'robust_scale': {
        if (numericStats && numericVal !== null && numericStats.q3 !== numericStats.q1) {
          value = (numericVal - numericStats.median) / (numericStats.q3 - numericStats.q1);
        }
        break;
      }
      case 'max_abs_scale':
        if (numericStats && numericVal !== null && numericStats.maxAbs > 0) {
          value = numericVal / numericStats.maxAbs;
        }
        break;
      case 'bucketize': {
        if (numericStats && numericVal !== null) {
          const bins = Math.max(2, Number(params.bins ?? 5));
          const edges = buildBins(numericStats.min, numericStats.max, bins);
          value = findBin(numericVal, edges);
        }
        break;
      }
      case 'quantile_bin': {
        if (numericVal !== null && quantiles) {
          value = findBin(numericVal, quantiles);
        }
        break;
      }
      case 'label_encode':
        value = ctx.categoryMap.has(String(sourceVal))
          ? ctx.categoryMap.get(String(sourceVal))
          : null;
        break;
      case 'frequency_encode': {
        const normalize = params.normalize !== false;
        const entry = frequencies.get(String(sourceVal));
        value = entry ? (normalize ? entry.count / entry.total : entry.count) : null;
        break;
      }
      case 'target_encode': {
        if (!targetColumn) {
          note = 'Target encoding requires a target column.';
          break;
        }
        if (targetStats) {
          value = targetStats.get(String(sourceVal)) ?? null;
        }
        break;
      }
      case 'text_length':
        value = typeof sourceVal === 'string' ? sourceVal.length : 0;
        break;
      case 'word_count':
        value =
          typeof sourceVal === 'string'
            ? sourceVal.trim().split(/\s+/).filter(Boolean).length
            : 0;
        break;
      case 'contains_pattern': {
        const pattern = String(params.pattern ?? '');
        if (!pattern) {
          note = 'Add a pattern to preview matches.';
          break;
        }
        const caseSensitive = params.case_sensitive === true;
        let matched: boolean;
        if (typeof sourceVal === 'string') {
          matched = caseSensitive
            ? sourceVal.includes(pattern)
            : sourceVal.toLowerCase().includes(pattern.toLowerCase());
        } else {
          matched = false;
        }
        value = matched ? 1 : 0;
        break;
      }
      case 'missing_indicator':
        value = isMissing(sourceVal) ? 1 : 0;
        break;
      case 'extract_year':
      case 'extract_month':
      case 'extract_day':
      case 'extract_weekday':
      case 'extract_hour':
      case 'time_since': {
        const date = coerceDate(sourceVal);
        if (!date) break;
        if (feature.method === 'extract_year') value = date.getFullYear();
        if (feature.method === 'extract_month') value = date.getMonth() + 1;
        if (feature.method === 'extract_day') value = date.getDate();
        if (feature.method === 'extract_weekday') value = date.getDay();
        if (feature.method === 'extract_hour') value = date.getHours();
        if (feature.method === 'time_since') {
          const unit = String(params.unit ?? 'days');
          const diffMs = Date.now() - date.getTime();
          const divisor =
            unit === 'hours'
              ? 1000 * 60 * 60
              : unit === 'weeks'
                ? 1000 * 60 * 60 * 24 * 7
                : unit === 'months'
                  ? 1000 * 60 * 60 * 24 * 30
                  : 1000 * 60 * 60 * 24;
          value = diffMs / divisor;
        }
        break;
      }
      case 'ratio':
        if (numericVal !== null && secondaryNum !== null && secondaryNum !== 0) {
          value = numericVal / secondaryNum;
        }
        break;
      case 'difference':
        if (numericVal !== null && secondaryNum !== null) {
          value = numericVal - secondaryNum;
        }
        break;
      case 'product':
        if (numericVal !== null && secondaryNum !== null) {
          value = numericVal * secondaryNum;
        }
        break;
      default:
        break;
    }

    addOutputValue(outputRow, feature.featureName, value);
    outputRows.push(outputRow);
  }

  return { columns: outputColumns, rows: outputRows, note };
}

// Register the 27 single-output methods
const SINGLE_OUTPUT_METHODS: FeatureMethod[] = [
  'log_transform',
  'log1p_transform',
  'sqrt_transform',
  'square_transform',
  'reciprocal_transform',
  'standardize',
  'min_max_scale',
  'robust_scale',
  'max_abs_scale',
  'bucketize',
  'quantile_bin',
  'label_encode',
  'frequency_encode',
  'target_encode',
  'text_length',
  'word_count',
  'contains_pattern',
  'missing_indicator',
  'extract_year',
  'extract_month',
  'extract_day',
  'extract_weekday',
  'extract_hour',
  'time_since',
  'ratio',
  'difference',
  'product',
];

for (const method of SINGLE_OUTPUT_METHODS) {
  previewStrategyMap.set(method, singleOutputHandler);
}

previewStrategyMap.set('cyclical_encode', (ctx) => {
  const { feature, sample, params, sourceColumn, addOutputValue, getSource } = ctx;
  const periodKey = String(params.period ?? 'month');
  const periodMap: Record<string, number> = {
    hour: 24,
    weekday: 7,
    month: 12,
    day_of_year: 365,
  };
  const attrMap: Record<string, (d: Date) => number> = {
    hour: (d) => d.getHours(),
    weekday: (d) => d.getDay(),
    month: (d) => d.getMonth() + 1,
    day_of_year: (d) => {
      const start = new Date(d.getFullYear(), 0, 0);
      const diff = d.getTime() - start.getTime();
      return Math.floor(diff / (1000 * 60 * 60 * 24));
    },
  };
  const period = periodMap[periodKey] ?? 12;
  const sinCol = `${feature.featureName}_sin`;
  const cosCol = `${feature.featureName}_cos`;
  const outputRows: Row[] = [];

  for (const row of sample) {
    const date = coerceDate(getSource(row));
    const outputRow: Row = { [sourceColumn]: getSource(row) };
    if (date) {
      const base = attrMap[periodKey] ? attrMap[periodKey](date) : date.getMonth() + 1;
      addOutputValue(outputRow, sinCol, Math.sin((2 * Math.PI * base) / period));
      addOutputValue(outputRow, cosCol, Math.cos((2 * Math.PI * base) / period));
    }
    outputRows.push(outputRow);
  }

  return { columns: [sinCol, cosCol], rows: outputRows };
});

previewStrategyMap.set('polynomial', (ctx) => {
  const { feature, sample, sourceColumn, addOutputValue, getSource } = ctx;
  const degree = Math.max(2, Number(ctx.params.degree ?? 2));
  const outputColumns: string[] = [];
  for (let power = 2; power <= degree; power += 1) {
    outputColumns.push(`${feature.featureName}_pow${power}`);
  }
  const outputRows: Row[] = [];

  for (const row of sample) {
    const outputRow: Row = { [sourceColumn]: getSource(row) };
    const numericVal = coerceNumber(getSource(row));
    outputColumns.forEach((col, idx) => {
      const power = idx + 2;
      addOutputValue(outputRow, col, numericVal !== null ? numericVal ** power : null);
    });
    outputRows.push(outputRow);
  }

  return { columns: outputColumns, rows: outputRows };
});

previewStrategyMap.set('one_hot_encode', (ctx) => {
  const { feature, sample, sourceColumn, addOutputValue, getSource, categories } = ctx;
  const maxCategories = 6;
  const limited = categories.slice(0, maxCategories);
  const note =
    categories.length > maxCategories
      ? `Preview shows top ${maxCategories} categories only.`
      : undefined;
  const columnsList = limited.map((value) => `${feature.featureName}_${value}`);
  const outputRows: Row[] = [];

  for (const row of sample) {
    const outputRow: Row = { [sourceColumn]: getSource(row) };
    const value = String(getSource(row));
    columnsList.forEach((col, idx) => {
      addOutputValue(outputRow, col, value === String(limited[idx]) ? 1 : 0);
    });
    outputRows.push(outputRow);
  }

  return { columns: columnsList, rows: outputRows, note };
});

previewStrategyMap.set('binary_encode', (ctx) => {
  const { feature, sample, sourceColumn, addOutputValue, getSource, categories, categoryMap } =
    ctx;
  const categoriesList = categories.slice(0, 32);
  const maxValue = Math.max(categoriesList.length - 1, 1);
  const bits = Math.max(1, Math.ceil(Math.log2(maxValue + 1)));
  const outputColumns: string[] = [];
  for (let i = 0; i < bits; i += 1) {
    outputColumns.push(`${feature.featureName}_bin${i}`);
  }
  const outputRows: Row[] = [];

  for (const row of sample) {
    const outputRow: Row = { [sourceColumn]: getSource(row) };
    const value = categoryMap.get(String(getSource(row))) ?? 0;
    for (let i = 0; i < bits; i += 1) {
      addOutputValue(outputRow, `${feature.featureName}_bin${i}`, (value >> i) & 1);
    }
    outputRows.push(outputRow);
  }

  return { columns: outputColumns, rows: outputRows };
});

const runtimeOnlyHandler: PreviewFn = (ctx) => {
  const { feature, sample, sourceColumn, getSource } = ctx;
  const outputRows = sample.map((row) => ({
    [sourceColumn]: getSource(row),
    [feature.featureName]: null,
  }));
  return {
    columns: [feature.featureName],
    rows: outputRows,
    note: 'Preview requires Python runtime to estimate the transform.',
  };
};

previewStrategyMap.set('box_cox', runtimeOnlyHandler);
previewStrategyMap.set('yeo_johnson', runtimeOnlyHandler);

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function buildFeaturePreview(
  feature: FeatureLike,
  rows: Array<Row>,
  limit = 8
): FeaturePreviewResult | null {
  if (rows.length === 0) return null;

  const sample = rows.slice(0, limit);
  const params = feature.params ?? {};
  const sourceColumn = feature.sourceColumn;
  const secondaryColumn =
    feature.secondaryColumn ?? (params.secondaryColumn as string | undefined);

  const summaryValues: Record<string, number[]> = {};

  const addOutputValue = (row: Row, column: string, value: unknown) => {
    row[column] = value;
    if (typeof value === 'number' && Number.isFinite(value)) {
      summaryValues[column] = summaryValues[column] ?? [];
      summaryValues[column].push(value);
    }
  };

  const getSource = (row: Row) => row[sourceColumn];
  const getSecondary = (row: Row) => (secondaryColumn ? row[secondaryColumn] : undefined);

  const categories = getUniqueValues(sample, sourceColumn);
  const categoryMap = new Map(categories.map((value, idx) => [value, idx]));

  const handler = previewStrategyMap.get(feature.method);
  if (!handler) return null;

  const ctx: PreviewContext = {
    feature,
    sample,
    params,
    sourceColumn,
    secondaryColumn,
    summaryValues,
    addOutputValue,
    getSource,
    getSecondary,
    categories,
    categoryMap,
  };

  const result = handler(ctx);
  if (!result) return null;

  const summary = buildSummary(summaryValues);

  return {
    columns: [sourceColumn, ...result.columns],
    rows: result.rows,
    summary,
    note: result.note,
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function buildSummary(values: Record<string, number[]>) {
  const summary: Record<string, { min: number; max: number; mean: number }> = {};
  Object.entries(values).forEach(([key, nums]) => {
    if (nums.length === 0) return;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const mean = nums.reduce((sum, value) => sum + value, 0) / nums.length;
    summary[key] = {
      min: Number(min.toFixed(4)),
      max: Number(max.toFixed(4)),
      mean: Number(mean.toFixed(4)),
    };
  });
  return Object.keys(summary).length > 0 ? summary : undefined;
}

function buildQuantiles(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const buckets = 4;
  const edges: number[] = [];
  for (let i = 1; i < buckets; i += 1) {
    edges.push(percentile(sorted, i / buckets));
  }
  edges.push(sorted[sorted.length - 1]);
  return edges;
}

function buildBins(min: number, max: number, bins: number): number[] {
  const edges: number[] = [];
  const step = (max - min) / bins;
  for (let i = 1; i <= bins; i += 1) {
    edges.push(min + step * i);
  }
  return edges;
}

function findBin(value: number, edges: number[]): number {
  for (let i = 0; i < edges.length; i += 1) {
    if (value <= edges[i]) return i;
  }
  return edges.length - 1;
}

function buildTargetStats(
  rows: Row[],
  sourceColumn: string,
  targetColumn: string
): Map<string, number> | null {
  const sums = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const key = String(row[sourceColumn] ?? '');
    const target = coerceNumber(row[targetColumn]);
    if (target === null) continue;
    const entry = sums.get(key) ?? { sum: 0, count: 0 };
    entry.sum += target;
    entry.count += 1;
    sums.set(key, entry);
  }
  if (sums.size === 0) return null;
  const stats = new Map<string, number>();
  sums.forEach((entry, key) => {
    stats.set(key, entry.sum / entry.count);
  });
  return stats;
}

function getUniqueValues(rows: Row[], column: string): string[] {
  const values = new Set<string>();
  for (const row of rows) {
    values.add(String(row[column] ?? ''));
  }
  return Array.from(values);
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function coerceDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) {
      return new Date(timestamp);
    }
  }
  return null;
}

function isMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}
