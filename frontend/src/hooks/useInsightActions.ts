/**
 * useInsightActions — hook for dispatching insight action side-effects.
 *
 * Handles four actions: filter, query, preprocess, and notebook.
 *  - filter:     generates SQL and executes it as a new query artifact
 *  - query:      populates the SQL editor with a diagnostic query (no execution)
 *  - preprocess: navigates to preprocessing with insight search params
 *  - notebook:   navigates to notebook phase with pending insight context for LLM code generation
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { InsightAction } from '@/components/data/eda/edaInsights';
import { useInsightNavigationStore } from '@/stores/insightNavigationStore';
import type { InsightCodegenContext } from '@/lib/api/insightCodegen';

interface UseInsightActionsParams {
  projectId?: string;
  tableName?: string;
  /** Execute SQL and create an artifact (used for filter action). */
  onExecuteQuery?: (sql: string, mode: 'sql') => void;
  /** Populate the SQL editor with a suggested query (used for query action). */
  onSuggestSql?: (sql: string) => void;
  /** Dataset schema for notebook code generation context. */
  datasetSchema?: Array<{ column: string; dtype: string }>;
}

/* ------------------------------------------------------------------ */
/*  SQL generators                                                     */
/* ------------------------------------------------------------------ */

/** Quote a SQL identifier (table or column) to handle special characters. */
function quoteId(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function generateFilterSql(
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

function generateQuerySql(
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

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useInsightActions({
  projectId,
  tableName,
  onExecuteQuery,
  onSuggestSql,
  datasetSchema,
}: UseInsightActionsParams) {
  const navigate = useNavigate();
  const setPendingInsightContext = useInsightNavigationStore(
    (state) => state.setPendingInsightContext,
  );

  const handleInsightAction = useCallback(
    (action: InsightAction) => {
      if (!tableName) {
        toast.error('No table available for this action');
        return;
      }

      switch (action.type) {
        case 'filter': {
          const sql = generateFilterSql(tableName, action);
          if (!sql) {
            toast.error('Cannot generate filter query for this insight');
            return;
          }
          onExecuteQuery?.(sql, 'sql');
          break;
        }

        case 'query': {
          const sql = generateQuerySql(tableName, action);
          if (!sql) {
            toast.error('Cannot generate diagnostic query for this insight');
            return;
          }
          onSuggestSql?.(sql);
          break;
        }

        case 'preprocess': {
          if (!projectId) {
            toast.error('No project context for preprocessing');
            return;
          }
          const params = new URLSearchParams({
            insightColumn: action.columns[0] ?? '',
            insightIssue: action.issueType,
          });
          navigate(`/project/${projectId}/preprocessing?${params.toString()}`);
          break;
        }

        case 'notebook': {
          if (!projectId) {
            toast.error('No project context for notebook generation');
            return;
          }
          const insightContext: InsightCodegenContext = {
            columns: action.columns,
            issueType: action.issueType,
            severity: 'medium',
            text: `Investigate ${action.issueType} issue in column(s): ${action.columns.join(', ')}`,
            datasetSchema: datasetSchema ?? [],
            tableName,
          };
          setPendingInsightContext(insightContext);
          navigate(`/project/${projectId}/notebook`);
          break;
        }
      }
    },
    [projectId, tableName, onExecuteQuery, onSuggestSql, navigate, datasetSchema, setPendingInsightContext],
  );

  return { handleInsightAction };
}
