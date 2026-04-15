import { useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getWorkbookParam } from '@/lib/workbookParam';

export function useTrainingPanelSearchState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialWorkbookId = useRef(getWorkbookParam(searchParams)).current;
  const initialNotebookId = useRef(searchParams.get('notebook') ?? undefined).current;
  const requestedWorkbookId = getWorkbookParam(searchParams);

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
    initialWorkbookId,
    initialNotebookId,
    requestedWorkbookId,
    syncWorkbookParam
  };
}
