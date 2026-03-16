/**
 * useInsightActions — hook for dispatching insight action side-effects.
 * Skeleton: actual implementations added in Tasks 4 (filter/query/preprocess) and 6 (notebook).
 */

import { useCallback } from 'react';
import type { InsightAction } from '@/components/data/eda/edaInsights';

interface UseInsightActionsParams {
  projectId?: string;
  tableName?: string;
}

export function useInsightActions({ projectId, tableName }: UseInsightActionsParams) {
  const handleInsightAction = useCallback(
    (action: InsightAction) => {
      console.log('[insight-action]', action.type, action.columns, action.issueType, {
        projectId,
        tableName,
      });
      // Implementations added in Tasks 4 (filter/query/preprocess) and 6 (notebook)
    },
    [projectId, tableName],
  );

  return { handleInsightAction };
}
