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
  const initialTabIdRef = useRef(getWorkbookParam(searchParams));
  const initialNotebookIdRef = useRef(searchParams.get('notebook') ?? undefined);

  const [insightInitialPrompt] = useState<string | null>(() => {
    const column = searchParams.get('insightColumn');
    const issueType = searchParams.get('insightIssue');
    if (!column || !issueType) {
      return null;
    }
    return buildInsightPrompt(column, issueType);
  });
  const hadInsightParams = insightInitialPrompt !== null;

  useEffect(() => {
    if (!hadInsightParams) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.delete('insightColumn');
    next.delete('insightIssue');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once on mount
  }, []);

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
    initialTabId: initialTabIdRef.current,
    initialNotebookId: initialNotebookIdRef.current,
    insightInitialPrompt,
    syncWorkbookParam
  };
}
