/**
 * Shared row-sampling utilities for EDA services.
 *
 * Deterministic evenly-spaced sampling avoids random selection
 * while keeping the output representative of the full dataset.
 */

import type { QueryRow } from '../../types/query.js';

/**
 * Return an evenly-spaced subsample of `rows`, capped at `maxRows`.
 *
 * If the source is already at or below the cap the original array is
 * returned unchanged (no copy).  Otherwise every `step`-th row is
 * picked so the sample spans the entire dataset uniformly.
 */
export function sampleRowsEvenly(rows: QueryRow[], maxRows: number): QueryRow[] {
  if (rows.length <= maxRows) return rows;

  const step = Math.max(1, Math.floor(rows.length / maxRows));
  const result: QueryRow[] = [];
  for (let i = 0; i < rows.length && result.length < maxRows; i += step) {
    result.push(rows[i]);
  }
  return result;
}
