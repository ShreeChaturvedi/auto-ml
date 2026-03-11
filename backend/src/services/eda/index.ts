/**
 * EDA Summary Service
 *
 * Generates comprehensive exploratory data analysis summaries including:
 * - Numeric column statistics (with skewness, quartiles, outlier detection)
 * - Categorical column analysis (value distributions, cardinality)
 * - Data quality metrics (missing values, uniqueness)
 * - Visualizations (histograms, scatter plots, correlations)
 */

import type { EdaSummary, QueryRow } from '../../types/query.js';

import { computeCategoricalSummaries, computeDataQuality } from './categoricalAnalysis.js';
import { detectColumnTypes } from './columnDetection.js';
import { computeNumericSummaries } from './numericAnalysis.js';
import { buildCorrelations, buildHistogram, buildScatter } from './visualizations.js';

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

// Re-export all public functions from submodules
export { detectColumnTypes } from './columnDetection.js';
export type { ColumnType } from './columnDetection.js';
export { computeNumericSummaries, percentile } from './numericAnalysis.js';
export { computeCategoricalSummaries, computeDataQuality } from './categoricalAnalysis.js';
export { buildHistogram, buildScatter, buildCorrelations } from './visualizations.js';
