/**
 * EDA Summary Service — barrel re-export
 *
 * All implementation has moved to ./eda/ submodules.
 * This file preserves the original import path for backwards compatibility.
 */

export {
  buildEdaSummary,
  buildCorrelations,
  buildHistogram,
  buildScatter,
  buildScatterPairs,
  computeRegressionLine,
  computeCategoricalSummaries,
  computeDataQuality,
  computeNumericSummaries,
  detectColumnTypes,
  percentile
} from './eda/index.js';

export type { ColumnType } from './eda/index.js';
