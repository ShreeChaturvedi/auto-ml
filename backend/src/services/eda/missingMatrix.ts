/**
 * Missing value matrix generation
 *
 * Produces a binary matrix (1=present, 0=missing) for visualization
 * of missing value patterns across columns.
 */

import type { QueryRow } from '../../types/query.js';

export interface MissingMatrixResult {
  columns: string[];
  matrix: number[][];
}

/**
 * Build a missing value matrix from query rows.
 *
 * Uses evenly-spaced sampling to keep the matrix manageable for visualization.
 * Returns undefined if no column has any missing values.
 *
 * @param rows - The data rows to analyze
 * @param columns - Column names to include
 * @param sampleSize - Maximum number of rows to sample (default 100)
 */
export function buildMissingMatrix(
  rows: QueryRow[],
  columns: string[],
  sampleSize = 100
): MissingMatrixResult | undefined {
  if (rows.length === 0 || columns.length === 0) return undefined;

  // Evenly-spaced sampling
  const step = Math.max(1, Math.floor(rows.length / sampleSize));
  const sampledRows: QueryRow[] = [];
  for (let i = 0; i < rows.length; i += step) {
    sampledRows.push(rows[i]);
  }

  // Build binary matrix: 1=present, 0=missing
  const matrix: number[][] = [];
  let hasMissing = false;

  for (const row of sampledRows) {
    const rowValues: number[] = [];
    for (const col of columns) {
      const value = row[col];
      const isMissing =
        value === null ||
        value === undefined ||
        value === '';

      if (isMissing) hasMissing = true;
      rowValues.push(isMissing ? 0 : 1);
    }
    matrix.push(rowValues);
  }

  // Only return if at least 1 column has missing values
  if (!hasMissing) return undefined;

  return { columns, matrix };
}
