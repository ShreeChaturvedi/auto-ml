import type { FeatureMethod } from '@/types/feature';

type FeatureLike = {
  method: FeatureMethod;
  sourceColumn: string;
  secondaryColumn?: string;
  featureName: string;
  params?: Record<string, unknown>;
};

export interface FeaturePreviewResult {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  summary?: Record<string, { min: number; max: number; mean: number }>;
  note?: string;
}

export function buildFeaturePreview(
  feature: FeatureLike,
  rows: Array<Record<string, unknown>>,
  limit = 8
): FeaturePreviewResult | null {
  if (rows.length === 0) return null;

  const sample = rows.slice(0, limit);
  const params = feature.params ?? {};
  const outputColumns: string[] = [];
  const outputRows: Array<Record<string, unknown>> = [];
  const summaryValues: Record<string, number[]> = {};
  let note: string | undefined;

  const sourceColumn = feature.sourceColumn;
  const secondaryColumn = feature.secondaryColumn ?? (params.secondaryColumn as string | undefined);

  const getSource = (row: Record<string, unknown>) => row[sourceColumn];
  const getSecondary = (row: Record<string, unknown>) => (secondaryColumn ? row[secondaryColumn] : undefined);

  const addOutputValue = (row: Record<string, unknown>, column: string, value: unknown) => {
    row[column] = value;
    if (typeof value === 'number' && Number.isFinite(value)) {
      summaryValues[column] = summaryValues[column] ?? [];
      summaryValues[column].push(value);
    }
  };

  const categories = getUniqueValues(sample, sourceColumn);
  const categoryMap = new Map(categories.map((value, idx) => [value, idx]));

  switch (feature.method) {
    case 'log_transform':
    case 'log1p_transform':
    case 'sqrt_transform':
    case 'square_transform':
    case 'reciprocal_transform':
    case 'standardize':
    case 'min_max_scale':
    case 'robust_scale':
    case 'max_abs_scale':
    case 'bucketize':
    case 'quantile_bin':
    case 'label_encode':
    case 'frequency_encode':
    case 'target_encode':
    case 'text_length':
    case 'word_count':
    case 'contains_pattern':
    case 'missing_indicator':
    case 'extract_year':
    case 'extract_month':
    case 'extract_day':
    case 'extract_weekday':
    case 'extract_hour':
    case 'time_since':
    case 'ratio':
    case 'difference':
    case 'product': {
      outputColumns.push(feature.featureName);
      const numericStats = buildNumericStats(sample, sourceColumn);
      const quantiles = numericStats ? buildQuantiles(numericStats.values) : null;
      const frequencies = buildFrequencies(sample, sourceColumn);
      const targetColumn = params.targetColumn as string | undefined;
      const targetStats = targetColumn ? buildTargetStats(sample, sourceColumn, targetColumn) : null;

      for (const row of sample) {
        const outputRow: Record<string, unknown> = {
          [sourceColumn]: getSource(row)
        };

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
              value = ((numericVal - numericStats.min) / (numericStats.max - numericStats.min)) * (max - min) + min;
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
            value = categoryMap.has(String(sourceVal)) ? categoryMap.get(String(sourceVal)) : null;
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
            value = typeof sourceVal === 'string' ? sourceVal.trim().split(/\s+/).filter(Boolean).length : 0;
            break;
          case 'contains_pattern': {
            const pattern = String(params.pattern ?? '');
            if (!pattern) {
              note = 'Add a pattern to preview matches.';
              break;
            }
            const caseSensitive = params.case_sensitive === true;
            if (typeof sourceVal === 'string') {
              value = caseSensitive
                ? sourceVal.includes(pattern)
                : sourceVal.toLowerCase().includes(pattern.toLowerCase());
            } else {
              value = false;
            }
            value = value ? 1 : 0;
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
                unit === 'hours' ? 1000 * 60 * 60 :
                  unit === 'weeks' ? 1000 * 60 * 60 * 24 * 7 :
                    unit === 'months' ? 1000 * 60 * 60 * 24 * 30 :
                      1000 * 60 * 60 * 24;
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
      break;
    }
    case 'cyclical_encode': {
      const periodKey = String(params.period ?? 'month');
      const periodMap: Record<string, number> = {
        hour: 24,
        weekday: 7,
        month: 12,
        day_of_year: 365
      };
      const attrMap: Record<string, (d: Date) => number> = {
        hour: (d) => d.getHours(),
        weekday: (d) => d.getDay(),
        month: (d) => d.getMonth() + 1,
        day_of_year: (d) => {
          const start = new Date(d.getFullYear(), 0, 0);
          const diff = d.getTime() - start.getTime();
          return Math.floor(diff / (1000 * 60 * 60 * 24));
        }
      };
      const period = periodMap[periodKey] ?? 12;
      const sinCol = `${feature.featureName}_sin`;
      const cosCol = `${feature.featureName}_cos`;
      outputColumns.push(sinCol, cosCol);

      for (const row of sample) {
        const date = coerceDate(getSource(row));
        const outputRow: Record<string, unknown> = {
          [sourceColumn]: getSource(row)
        };
        if (date) {
          const base = attrMap[periodKey] ? attrMap[periodKey](date) : date.getMonth() + 1;
          addOutputValue(outputRow, sinCol, Math.sin((2 * Math.PI * base) / period));
          addOutputValue(outputRow, cosCol, Math.cos((2 * Math.PI * base) / period));
        }
        outputRows.push(outputRow);
      }
      break;
    }
    case 'polynomial': {
      const degree = Math.max(2, Number(params.degree ?? 2));
      for (let power = 2; power <= degree; power += 1) {
        outputColumns.push(`${feature.featureName}_pow${power}`);
      }
      for (const row of sample) {
        const outputRow: Record<string, unknown> = {
          [sourceColumn]: getSource(row)
        };
        const numericVal = coerceNumber(getSource(row));
        outputColumns.forEach((col, idx) => {
          const power = idx + 2;
          addOutputValue(outputRow, col, numericVal !== null ? numericVal ** power : null);
        });
        outputRows.push(outputRow);
      }
      break;
    }
    case 'one_hot_encode': {
      const maxCategories = 6;
      const limited = categories.slice(0, maxCategories);
      if (categories.length > maxCategories) {
        note = `Preview shows top ${maxCategories} categories only.`;
      }
      const columnsList = limited.map((value) => `${feature.featureName}_${value}`);
      outputColumns.push(...columnsList);

      for (const row of sample) {
        const outputRow: Record<string, unknown> = {
          [sourceColumn]: getSource(row)
        };
        const value = String(getSource(row));
        columnsList.forEach((col, idx) => {
          addOutputValue(outputRow, col, value === String(limited[idx]) ? 1 : 0);
        });
        outputRows.push(outputRow);
      }
      break;
    }
    case 'binary_encode': {
      const categoriesList = categories.slice(0, 32);
      const maxValue = Math.max(categoriesList.length - 1, 1);
      const bits = Math.max(1, Math.ceil(Math.log2(maxValue + 1)));
      for (let i = 0; i < bits; i += 1) {
        outputColumns.push(`${feature.featureName}_bin${i}`);
      }

      for (const row of sample) {
        const outputRow: Record<string, unknown> = {
          [sourceColumn]: getSource(row)
        };
        const value = categoryMap.get(String(getSource(row))) ?? 0;
        for (let i = 0; i < bits; i += 1) {
          addOutputValue(outputRow, `${feature.featureName}_bin${i}`, (value >> i) & 1);
        }
        outputRows.push(outputRow);
      }
      break;
    }
    case 'box_cox':
    case 'yeo_johnson': {
      note = 'Preview requires Python runtime to estimate the transform.';
      outputColumns.push(feature.featureName);
      for (const row of sample) {
        outputRows.push({ [sourceColumn]: getSource(row), [feature.featureName]: null });
      }
      break;
    }
    default: {
      return null;
    }
  }

  const summary = buildSummary(summaryValues);

  return {
    columns: [sourceColumn, ...outputColumns],
    rows: outputRows,
    summary,
    note
  };
}

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
      mean: Number(mean.toFixed(4))
    };
  });
  return Object.keys(summary).length > 0 ? summary : undefined;
}

function buildNumericStats(rows: Array<Record<string, unknown>>, column: string) {
  const values = rows.map((row) => coerceNumber(row[column])).filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const median = percentile(sorted, 0.5);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const maxAbs = Math.max(Math.abs(min), Math.abs(max));
  const variance =
    sorted.length > 1
      ? sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (sorted.length - 1)
      : 0;
  const stdDev = Math.sqrt(variance);

  return { min, max, mean, median, q1, q3, stdDev, maxAbs, values };
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

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function buildFrequencies(rows: Array<Record<string, unknown>>, column: string) {
  const counts = new Map<string, { count: number; total: number }>();
  const values = rows.map((row) => String(row[column] ?? ''));
  const total = values.length;
  for (const value of values) {
    const entry = counts.get(value) ?? { count: 0, total };
    entry.count += 1;
    counts.set(value, entry);
  }
  return counts;
}

function buildTargetStats(
  rows: Array<Record<string, unknown>>,
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

function getUniqueValues(rows: Array<Record<string, unknown>>, column: string): string[] {
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
