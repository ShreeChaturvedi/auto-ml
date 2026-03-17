/**
 * EDA Summary Service
 *
 * Generates comprehensive exploratory data analysis summaries including:
 * - Numeric column statistics (with skewness, quartiles, outlier detection)
 * - Categorical column analysis (value distributions, cardinality)
 * - Data quality metrics (missing values, uniqueness)
 * - Visualizations (histograms, scatter plots, correlations)
 */

import type { EdaScope, EdaSummary, HistogramSummary, QueryRow } from '../../types/query.js';

import { computeCategoricalSummaries, computeDataQuality } from './categoricalAnalysis.js';
import { detectColumnTypes } from './columnDetection.js';
import { buildMissingMatrix } from './missingMatrix.js';
import { computeNumericSummaries } from './numericAnalysis.js';
import { buildCorrelations, buildHistogram, buildScatter, buildScatterPairs } from './visualizations.js';

export interface BuildEdaSummaryOptions {
  source?: 'dataset-profile' | 'query-result';
  totalRows?: number;
}

/**
 * Build comprehensive EDA summary from query results
 */
export function buildEdaSummary(rows: QueryRow[], options?: BuildEdaSummaryOptions): EdaSummary | undefined {
  if (rows.length === 0) {
    return undefined;
  }

  // Compute column set as union of keys from first N rows to handle sparse rows
  const SPARSE_ROW_SAMPLE_SIZE = 100;
  const sampleSize = Math.min(rows.length, SPARSE_ROW_SAMPLE_SIZE);
  const columnSet = new Set<string>();
  for (let i = 0; i < sampleSize; i++) {
    for (const key of Object.keys(rows[i])) {
      columnSet.add(key);
    }
  }
  const columns = Array.from(columnSet);
  if (columns.length === 0) return undefined;

  const columnTypes = detectColumnTypes(rows, columns);

  const numericCols = columns.filter(col => columnTypes[col] === 'numeric');
  const categoricalCols = columns.filter(col => columnTypes[col] === 'categorical');

  const numericSummaries = computeNumericSummaries(rows, numericCols);
  const categoricalSummaries = computeCategoricalSummaries(rows, categoricalCols);
  const dataQuality = computeDataQuality(rows, columns, columnTypes);

  // Generate visualizations
  const histograms = numericCols.slice(0, 20).map(col => buildHistogram(rows, col)).filter((h): h is HistogramSummary => h !== undefined);
  const histogram = histograms[0]; // backward compat

  const scatter = numericCols.length >= 2
    ? buildScatter(rows, numericCols[0], numericCols[1])
    : undefined;

  const correlations = numericCols.length >= 2
    ? buildCorrelations(rows, numericCols)
    : undefined;

  const scatterPairs = numericCols.length >= 2 && correlations
    ? buildScatterPairs(rows, numericCols, correlations, 15)
    : undefined;

  const missingMatrix = buildMissingMatrix(rows, columns);

  const scope: EdaScope | undefined = options?.source
    ? {
        source: options.source,
        rowsAnalyzed: rows.length,
        totalRows: options.totalRows ?? rows.length
      }
    : undefined;

  return {
    numericColumns: numericSummaries,
    categoricalColumns: categoricalSummaries,
    dataQuality,
    histogram,
    histograms: histograms.length > 0 ? histograms : undefined,
    scatter,
    correlations,
    scatterPairs,
    missingMatrix,
    scope
  };
}

// Re-export all public functions from submodules
export { detectColumnTypes } from './columnDetection.js';
export type { ColumnType } from './columnDetection.js';
export { computeNumericSummaries, percentile } from './numericAnalysis.js';
export { computeCategoricalSummaries, computeDataQuality } from './categoricalAnalysis.js';
export { buildHistogram, buildScatter, buildCorrelations, buildScatterPairs } from './visualizations.js';
export { computeRegressionLine, pearsonCorrelation } from './statistics.js';
export { buildMissingMatrix } from './missingMatrix.js';
export { sampleRowsEvenly } from './sampling.js';
