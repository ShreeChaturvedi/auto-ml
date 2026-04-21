import type { DatasetProfileColumn } from '../types/dataset.js';

/**
 * Columns whose names match these patterns are treated as identifier-like
 * regardless of cardinality. Case-insensitive word-boundary match.
 */
const IDENTIFIER_NAME_PATTERNS: readonly RegExp[] = [
  /^id$/i,
  /_id$/i,
  /^uuid$/i,
  /_uuid$/i,
  /(^|_)guid($|_)/i,
  /(^|_)email($|_)/i,
  /(^|_)phone($|_)/i,
  /(^|_)ssn($|_)/i,
  /(^|_)pk($|_)/i,
  /(^|_)transaction_id($|_)?/i,
];

/**
 * Heuristic: treat a column as a "likely identifier" if any of:
 *
 *   1. Name matches an ID-like pattern (customer_id, user_id, uuid, …).
 *   2. Cardinality-to-row ratio is too high to be a real categorical feature
 *      for the given dataset size. Specifically: `uniqueCount > max(20,
 *      0.3 * nRows)`. 20 is a safety floor so small datasets (e.g. 50 rows
 *      with 20 unique categories) are not over-eagerly flagged.
 *   3. dtype is string AND uniqueCount == nRows (every row is distinct) —
 *      classic fully-unique primary key.
 *
 * Both the feature-columns validator (configure_experiment) and the training
 * prompt annotator use this helper so the LLM and the code agree on what to
 * exclude.
 */
export function isLikelyIdentifierColumn(
  column: DatasetProfileColumn,
  nRows: number,
): boolean {
  if (!column.name) return false;

  if (IDENTIFIER_NAME_PATTERNS.some((pattern) => pattern.test(column.name))) {
    return true;
  }

  const unique = column.uniqueCount;
  if (typeof unique === 'number' && nRows > 0) {
    // Every row distinct — primary-key-like.
    if (unique === nRows && (column.dtype === 'string' || column.dtype === 'integer')) {
      return true;
    }
    // Cardinality too high to be a useful categorical.
    const cardinalityThreshold = Math.max(20, Math.floor(0.3 * nRows));
    if (unique > cardinalityThreshold) {
      return true;
    }
  }

  return false;
}

/**
 * Return the subset of `candidateColumns` that pass `isLikelyIdentifierColumn`.
 * Caller decides whether to strip them (configure_experiment) or just
 * annotate them for the LLM (training prompt).
 */
export function findLikelyIdentifierColumns(
  candidateColumns: DatasetProfileColumn[],
  nRows: number,
): DatasetProfileColumn[] {
  return candidateColumns.filter((column) => isLikelyIdentifierColumn(column, nRows));
}
