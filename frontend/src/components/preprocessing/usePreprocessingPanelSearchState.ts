import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getWorkbookParam } from '@/lib/workbookParam';

function buildInsightPrompt(column: string, issueType: string): string {
  switch (issueType) {
    case 'missing':
      return `The column "${column}" has a significant number of missing values. Please analyze the missing data pattern and suggest the best imputation strategy or whether the column should be dropped.`;
    case 'constant':
      return `The column "${column}" is constant (all values are the same) and provides no predictive signal. Please drop this column from the dataset.`;
    case 'imbalance':
      return `The column "${column}" has significant class imbalance. Please analyze the distribution and suggest resampling or balancing strategies.`;
    default:
      return `Please address the "${issueType}" issue detected in the column "${column}".`;
  }
}

export function usePreprocessingPanelSearchState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTabId = useRef(getWorkbookParam(searchParams)).current;
  const initialNotebookId = useRef(searchParams.get('notebook') ?? undefined).current;
  const [insightInitialPrompt] = useState<string | null>(() => {
    const column = searchParams.get('insightColumn');
    const issueType = searchParams.get('insightIssue');
    if (!column || !issueType) {
      return null;
    }
    return buildInsightPrompt(column, issueType);
  });

  useEffect(() => {
    if (!insightInitialPrompt) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.delete('insightColumn');
    next.delete('insightIssue');
    setSearchParams(next, { replace: true });
  }, [insightInitialPrompt, searchParams, setSearchParams]);

  const syncWorkbookParam = useCallback((workbookId: string, replace = true) => {
    if (getWorkbookParam(searchParams) === workbookId) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.set('workbook', workbookId);
    next.delete('tab');
    setSearchParams(next, { replace });
  }, [searchParams, setSearchParams]);

  return {
    searchParams,
    initialTabId,
    initialNotebookId,
    insightInitialPrompt,
    syncWorkbookParam
  };
}
