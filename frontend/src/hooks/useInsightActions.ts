/**
 * useInsightActions — hook for dispatching insight action side-effects.
 *
 * Handles four actions: filter, query, preprocess, and notebook.
 *  - filter:     generates SQL and executes it as a new query artifact
 *  - query:      populates the SQL editor with a diagnostic query (no execution)
 *  - preprocess: navigates to preprocessing with insight search params
 *  - notebook:   creates a standalone notebook seeded with the insight context,
 *                navigates to the data viewer, and opens it as a notebook tab
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { InsightAction } from '@/components/data/eda/edaInsights';
import { useInsightNavigationStore } from '@/stores/insightNavigationStore';
import { useDataStore } from '@/stores/dataStore';
import type { InsightCodegenContext } from '@/lib/api/insightCodegen';
import { createNotebook as createNotebookApi } from '@/lib/api/notebooks';
import { generateFilterSql, generateQuerySql } from '@/lib/sql/insightSql';

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
    async (action: InsightAction) => {
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
            severity: action.severity ?? 'medium',
            text: `Investigate ${action.issueType} issue in column(s): ${action.columns.join(', ')}`,
            datasetSchema: datasetSchema ?? [],
            tableName,
          };

          // Seed the context before the notebook mounts so NotebookEditor
          // picks it up on first render.
          setPendingInsightContext(insightContext);

          try {
            const label = `EDA: ${action.columns.join(', ')} (${action.issueType})`;
            const notebook = await createNotebookApi(projectId, {
              name: label.slice(0, 120),
              kind: 'standalone',
            });

            // Navigate to the data viewer and open the new notebook as a tab.
            navigate(`/project/${projectId}/data-viewer`);
            useDataStore.getState().openNotebookTab(notebook.notebookId);
          } catch (err) {
            console.error('[useInsightActions] Failed to create standalone notebook:', err);
            toast.error('Failed to open insight in notebook');
            useInsightNavigationStore.getState().clearPendingContext();
          }
          break;
        }
      }
    },
    [projectId, tableName, onExecuteQuery, onSuggestSql, navigate, datasetSchema, setPendingInsightContext],
  );

  return { handleInsightAction };
}
