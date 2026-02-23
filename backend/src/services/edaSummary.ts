/**
 * EDA Summary Service
 * 
 * Generates comprehensive exploratory data analysis summaries including:
 * - Numeric column statistics (with skewness, quartiles, outlier detection)
 * - Categorical column analysis (value distributions, cardinality)
 * - Data quality metrics (missing values, uniqueness)
 * - Visualizations (histograms, scatter plots, correlations)
 */

import type {
  CategoricalSummary,
  CorrelationSummary,
  DataQualitySummary,
  EdaSummary,
  HistogramSummary,
  NumericSummary,
  QueryRow,
  ScatterSummary
} from '../types/query.js';

const MAX_SCATTER_POINTS = 200;
const HISTOGRAM_BUCKETS = 15;
const MAX_TOP_VALUES = 10;

/**
 * Build comprehensive EDA summary from query results
 */
export function buildEdaSummary(rows: QueryRow[]): EdaSummary | undefined {
  if (rows.length === 0) {
    return undefined;
  }

  const columns = Object.keys(rows[0]);
  const columnTypes = detectColumnTypes(rows, columns);
  
  const numericCols = columns.filter(col => columnTypes[col] === 'numeric');
  const categoricalCols = columns.filter(col => columnTypes[col] === 'categorical');

  const numericSummaries = computeNumericSummaries(rows, numericCols);
  const categoricalSummaries = computeCategoricalSummaries(rows, categoricalCols);
  const dataQuality = computeDataQuality(rows, columns, columnTypes);

  // Generate visualizations
  const histogram = numericCols.length > 0 
    ? buildHistogram(rows, numericCols[0]) 
    : undefined;
  
  const scatter = numericCols.length >= 2
    ? buildScatter(rows, numericCols[0], numericCols[1])
    : undefined;
  
  const correlations = numericCols.length >= 2
    ? buildCorrelations(rows, numericCols)
    : undefined;

  return {
    numericColumns: numericSummaries,
    categoricalColumns: categoricalSummaries,
    dataQuality,
    histogram,
    scatter,
    correlations
  };
}

/**
 * Detect column data types using heuristics
 */
function detectColumnTypes(
  rows: QueryRow[], 
  columns: string[]
): Record<string, 'numeric' | 'categorical' | 'datetime' | 'boolean' | 'mixed'> {
  const types: Record<string, 'numeric' | 'categorical' | 'datetime' | 'boolean' | 'mixed'> = {};
  
  for (const column of columns) {
    const values = rows.map(row => row[column]).filter(v => v !== null && v !== undefined && v !== '');
    
    if (values.length === 0) {
      types[column] = 'categorical';
      continue;
    }

    // Check for boolean
    const booleanValues = new Set(['true', 'false', '0', '1', 'yes', 'no']);
    const allBoolean = values.every(v => {
      const str = String(v).toLowerCase();
      return booleanValues.has(str) || typeof v === 'boolean';
    });
    if (allBoolean && values.length > 0) {
      types[column] = 'boolean';
      continue;
    }

    // Check for numeric
    const numericCount = values.filter(v => {
      if (typeof v === 'number') return true;
      if (typeof v === 'string') {
        const parsed = Number(v);
        return !Number.isNaN(parsed) && v.trim() !== '';
      }
      return false;
    }).length;

    const numericRatio = numericCount / values.length;
    
    if (numericRatio >= 0.9) {
      types[column] = 'numeric';
      continue;
    }

    // Check for datetime patterns
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}/, // ISO date
      /^\d{2}\/\d{2}\/\d{4}/, // US date
      /^\d{4}\/\d{2}\/\d{2}/, // Alternative ISO
    ];
    
    const dateCount = values.filter(v => {
      const str = String(v);
      return datePatterns.some(pattern => pattern.test(str)) || !Number.isNaN(Date.parse(str));
    }).length;

    if (dateCount / values.length >= 0.8) {
      types[column] = 'datetime';
      continue;
    }

    // Default to categorical
    types[column] = 'categorical';
  }

  return types;
}

/**
 * Compute comprehensive numeric column statistics
 */
function computeNumericSummaries(rows: QueryRow[], columns: string[]): NumericSummary[] {
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
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  
  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;
  
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] * (1 - fraction) + sortedValues[upper] * fraction;
}

/**
 * Compute categorical column summaries
 */
function computeCategoricalSummaries(rows: QueryRow[], columns: string[]): CategoricalSummary[] {
  return columns.map(column => {
    const valueCounts = new Map<string, number>();
    let missingCount = 0;

    for (const row of rows) {
      const value = row[column];
      if (value === null || value === undefined || value === '') {
        missingCount++;
        continue;
      }
      const strValue = String(value);
      valueCounts.set(strValue, (valueCounts.get(strValue) ?? 0) + 1);
    }

    // Sort by count descending
    const sortedEntries = Array.from(valueCounts.entries())
      .sort((a, b) => b[1] - a[1]);

    const totalNonMissing = rows.length - missingCount;
    const topValues = sortedEntries.slice(0, MAX_TOP_VALUES).map(([value, count]) => ({
      value,
      count,
      percentage: totalNonMissing > 0 ? (count / totalNonMissing) * 100 : 0
    }));

    const mode = sortedEntries.length > 0 ? sortedEntries[0][0] : null;

    return {
      column,
      uniqueCount: valueCounts.size,
      topValues,
      missingCount,
      mode
    };
  });
}

/**
 * Compute data quality metrics for all columns
 */
function computeDataQuality(
  rows: QueryRow[],
  columns: string[],
  columnTypes: Record<string, 'numeric' | 'categorical' | 'datetime' | 'boolean' | 'mixed'>
): DataQualitySummary[] {
  return columns.map(column => {
    const uniqueValues = new Set<unknown>();
    let missingCount = 0;

    for (const row of rows) {
      const value = row[column];
      if (value === null || value === undefined || value === '') {
        missingCount++;
      } else {
        uniqueValues.add(value);
      }
    }

    const totalCount = rows.length;
    return {
      column,
      dataType: columnTypes[column],
      totalCount,
      missingCount,
      missingPercentage: totalCount > 0 ? (missingCount / totalCount) * 100 : 0,
      uniqueCount: uniqueValues.size,
      uniquePercentage: totalCount > 0 ? (uniqueValues.size / totalCount) * 100 : 0
    };
  });
}

/**
 * Build histogram for a numeric column
 */
function buildHistogram(rows: QueryRow[], column: string): HistogramSummary | undefined {
  const values = rows
    .map(row => row[column])
    .map(v => typeof v === 'number' ? v : Number(v))
    .filter(v => Number.isFinite(v));

  if (values.length === 0) return undefined;

  const min = Math.min(...values);
  const max = Math.max(...values);
  
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
function buildScatter(rows: QueryRow[], xColumn: string, yColumn: string): ScatterSummary | undefined {
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
function buildCorrelations(rows: QueryRow[], columns: string[]): CorrelationSummary[] | undefined {
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
