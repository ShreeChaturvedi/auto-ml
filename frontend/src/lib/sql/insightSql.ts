/**
 * insightSql — SQL generators for insight actions.
 *
 * Extracted from useInsightActions to keep SQL generation pure and testable.
 */

import type { InsightAction } from '@/components/data/eda/edaInsights';

/** Quote a SQL identifier (table or column) to handle special characters. */
export function quoteId(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Safely extract IQR bounds from action context. Returns null if values are non-finite. */
function extractIqrBounds(action: InsightAction): { lo: number; hi: number } | null {
  const q1 = action.context?.q1 as number | undefined;
  const q3 = action.context?.q3 as number | undefined;
  const iqr = action.context?.iqr as number | undefined;
  if (q1 == null || q3 == null || iqr == null) return null;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return { lo, hi };
}

export function generateFilterSql(
  tableName: string,
  action: InsightAction,
): string | null {
  const col = action.columns[0];
  if (!col) return null;

  switch (action.issueType) {
    case 'missing':
      return `SELECT * FROM ${quoteId(tableName)} WHERE ${quoteId(col)} IS NULL LIMIT 10000`;

    case 'outlier': {
      const bounds = extractIqrBounds(action);
      if (!bounds) return null;
      return `SELECT * FROM ${quoteId(tableName)} WHERE ${quoteId(col)} < ${bounds.lo} OR ${quoteId(col)} > ${bounds.hi} LIMIT 10000`;
    }

    default:
      return null;
  }
}

export function generateQuerySql(
  tableName: string,
  action: InsightAction,
): string | null {
  const col = action.columns[0];
  if (!col) return null;
  const tbl = quoteId(tableName);
  const qCol = quoteId(col);

  switch (action.issueType) {
    case 'missing':
      return [
        `SELECT COUNT(*) AS total,`,
        `       COUNT(*) FILTER (WHERE ${qCol} IS NULL) AS null_count,`,
        `       ROUND(100.0 * COUNT(*) FILTER (WHERE ${qCol} IS NULL) / COUNT(*), 2) AS null_pct`,
        `FROM ${tbl}`,
      ].join('\n');

    case 'outlier': {
      const bounds = extractIqrBounds(action);
      if (!bounds) return null;
      return [
        `SELECT ${qCol}`,
        `FROM ${tbl}`,
        `WHERE ${qCol} < ${bounds.lo} OR ${qCol} > ${bounds.hi}`,
        `ORDER BY ${qCol}`,
        `LIMIT 1000`,
      ].join('\n');
    }

    case 'correlation': {
      const colB = action.columns[1];
      if (!colB) return null;
      return [
        `SELECT ${qCol}, ${quoteId(colB)}`,
        `FROM ${tbl}`,
        `ORDER BY ${qCol}`,
        `LIMIT 1000`,
      ].join('\n');
    }

    case 'cardinality':
    case 'imbalance':
      return [
        `SELECT ${qCol}, COUNT(*) AS cnt`,
        `FROM ${tbl}`,
        `GROUP BY 1`,
        `ORDER BY cnt DESC`,
        ...(action.issueType === 'cardinality' ? ['LIMIT 50'] : []),
      ].join('\n');

    default:
      return null;
  }
}
