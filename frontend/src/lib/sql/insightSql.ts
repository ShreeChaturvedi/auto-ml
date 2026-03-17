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

export function generateFilterSql(
  tableName: string,
  action: InsightAction,
): string | null {
  const col = action.columns[0];
  if (!col) return null;

  switch (action.issueType) {
    case 'missing':
      return `SELECT * FROM ${quoteId(tableName)} WHERE ${quoteId(col)} IS NULL`;

    case 'outlier': {
      const q1 = action.context?.q1 as number | undefined;
      const q3 = action.context?.q3 as number | undefined;
      const iqr = action.context?.iqr as number | undefined;
      if (q1 == null || q3 == null || iqr == null) return null;
      const lo = q1 - 1.5 * iqr;
      const hi = q3 + 1.5 * iqr;
      return `SELECT * FROM ${quoteId(tableName)} WHERE ${quoteId(col)} < ${lo} OR ${quoteId(col)} > ${hi}`;
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
      const q1 = action.context?.q1 as number | undefined;
      const q3 = action.context?.q3 as number | undefined;
      const iqr = action.context?.iqr as number | undefined;
      if (q1 == null || q3 == null || iqr == null) return null;
      const lo = q1 - 1.5 * iqr;
      const hi = q3 + 1.5 * iqr;
      return [
        `SELECT ${qCol}`,
        `FROM ${tbl}`,
        `WHERE ${qCol} < ${lo} OR ${qCol} > ${hi}`,
        `ORDER BY ${qCol}`,
      ].join('\n');
    }

    case 'correlation': {
      const colB = action.columns[1];
      if (!colB) return null;
      return [
        `SELECT ${qCol}, ${quoteId(colB)}`,
        `FROM ${tbl}`,
        `ORDER BY ${qCol}`,
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
