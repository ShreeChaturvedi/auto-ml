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

function generateFilterSql(
  tableName: string,
  action: InsightAction,
): string | null {
  const col = action.columns[0];
  if (!col) return null;

  switch (action.issueType) {
    case 'missing':
      return `SELECT * FROM ${tableName} WHERE "${col}" IS NULL`;

    case 'outlier': {
      const q1 = action.context?.q1 as number | undefined;
      const q3 = action.context?.q3 as number | undefined;
      const iqr = action.context?.iqr as number | undefined;
      if (q1 == null || q3 == null || iqr == null) return null;
      const lo = q1 - 1.5 * iqr;
      const hi = q3 + 1.5 * iqr;
      return `SELECT * FROM ${tableName} WHERE "${col}" < ${lo} OR "${col}" > ${hi}`;
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

  switch (action.issueType) {
    case 'missing':
      return [
        `SELECT COUNT(*) AS total,`,
        `       COUNT(*) FILTER (WHERE "${col}" IS NULL) AS null_count,`,
        `       ROUND(100.0 * COUNT(*) FILTER (WHERE "${col}" IS NULL) / COUNT(*), 2) AS null_pct`,
        `FROM ${tableName}`,
      ].join('\n');

    case 'outlier': {
      const q1 = action.context?.q1 as number | undefined;
      const q3 = action.context?.q3 as number | undefined;
      const iqr = action.context?.iqr as number | undefined;
      if (q1 == null || q3 == null || iqr == null) return null;
      const lo = q1 - 1.5 * iqr;
      const hi = q3 + 1.5 * iqr;
      return [
        `SELECT "${col}"`,
        `FROM ${tableName}`,
        `WHERE "${col}" < ${lo} OR "${col}" > ${hi}`,
        `ORDER BY "${col}"`,
      ].join('\n');
    }

    case 'correlation': {
      const colA = action.columns[0];
      const colB = action.columns[1];
      if (!colA || !colB) return null;
      return [
        `SELECT "${colA}", "${colB}"`,
        `FROM ${tableName}`,
        `ORDER BY "${colA}"`,
      ].join('\n');
    }

    case 'cardinality':
      return [
        `SELECT "${col}", COUNT(*) AS cnt`,
        `FROM ${tableName}`,
        `GROUP BY 1`,
        `ORDER BY cnt DESC`,
        `LIMIT 50`,
      ].join('\n');

    case 'imbalance':
      return [
        `SELECT "${col}", COUNT(*) AS cnt`,
        `FROM ${tableName}`,
        `GROUP BY 1`,
        `ORDER BY cnt DESC`,
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
      console.log('[insight-action]', action.type, action.columns, action.issueType, {
        projectId,
        tableName,
      });

      if (!tableName) {
        toast.error('No table available for this action');
        return;
      }

      switch (action.type) {
        /* ---- filter: execute SQL and create artifact ---- */
        case 'filter': {
          const sql = generateFilterSql(tableName, action);
          if (!sql) {
            toast.error('Cannot generate filter query for this insight');
            return;
          }
          if (onExecuteQuery) {
            onExecuteQuery(sql, 'sql');
          }
          break;
        }

        /* ---- query: populate SQL editor (no execution) ---- */
        case 'query': {
          const sql = generateQuerySql(tableName, action);
          if (!sql) {
            toast.error('Cannot generate diagnostic query for this insight');
            return;
          }
          if (onSuggestSql) {
            onSuggestSql(sql);
          }
          break;
        }

        /* ---- preprocess: navigate to preprocessing phase ---- */
        case 'preprocess': {
          if (!projectId) {
            toast.error('No project context for preprocessing');
            return;
          }
          const col = action.columns[0] ?? '';
          const params = new URLSearchParams({
            insightColumn: col,
            insightIssue: action.issueType,
          });
          navigate(`/project/${projectId}/preprocessing?${params.toString()}`);
          break;
        }

        /* ---- notebook: generate suggested cell via LLM ---- */
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
