/**
 * Feature preview orchestrator.
 *
 * Delegates per-method computation to strategy handlers in ./preview/.
 * This file owns the public entry point and context assembly.
 */

import type { PreviewContext, FeatureLike, FeaturePreviewResult, Row } from './preview/types';
import { previewStrategyMap } from './preview/index';
import { buildSummary, getUniqueValues } from './preview/helpers';

// Re-export public types so existing consumers continue to work
export type { FeaturePreviewResult } from './preview/types';

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
