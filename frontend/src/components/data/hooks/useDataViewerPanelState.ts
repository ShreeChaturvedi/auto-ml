import { useCallback, useEffect, useRef, useState } from 'react';
import type { TransitionEvent } from 'react';

import type { QueryMode } from '@/types/file';

interface UseDataViewerPanelStateOptions {
  setQueryMode: (mode: QueryMode) => void;
}

export function useDataViewerPanelState({
  setQueryMode,
}: UseDataViewerPanelStateOptions) {
  const [queryPanelCollapsed, setQueryPanelCollapsed] = useState(false);
  const [queryPanelIsExpanding, setQueryPanelIsExpanding] = useState(false);
  const [queryPanelIsTransitioning, setQueryPanelIsTransitioning] = useState(false);
  const [controlsPortalTarget, setControlsPortalTarget] = useState<HTMLElement | null>(null);
  const suggestedSqlTokenRef = useRef(0);
  const [suggestedSql, setSuggestedSql] = useState<{ sql: string; token: number } | null>(null);

  const handleQueryPanelCollapsedChange = useCallback(
    (nextCollapsed: boolean) => {
      if (queryPanelIsTransitioning || nextCollapsed === queryPanelCollapsed) {
        return;
      }

      setQueryPanelIsTransitioning(true);
      setQueryPanelIsExpanding(!nextCollapsed);
      setQueryPanelCollapsed(nextCollapsed);
    },
    [queryPanelCollapsed, queryPanelIsTransitioning],
  );

  const handleSuggestSql = useCallback(
    (sql: string) => {
      setQueryMode('sql');
      setSuggestedSql({ sql, token: ++suggestedSqlTokenRef.current });
      if (queryPanelCollapsed) {
        handleQueryPanelCollapsedChange(false);
      }
    },
    [handleQueryPanelCollapsedChange, queryPanelCollapsed, setQueryMode],
  );

  const handleQueryPanelTransitionEnd = useCallback(
    (event: TransitionEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget || event.propertyName !== 'width') {
        return;
      }

      setQueryPanelIsExpanding(false);
      setQueryPanelIsTransitioning(false);
    },
    [],
  );

  useEffect(() => {
    if (!queryPanelIsTransitioning) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setQueryPanelIsTransitioning(false);
      setQueryPanelIsExpanding(false);
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [queryPanelIsTransitioning]);

  return {
    controlsPortalTarget,
    handleQueryPanelCollapsedChange,
    handleQueryPanelTransitionEnd,
    handleSuggestSql,
    queryPanelCollapsed,
    queryPanelIsExpanding,
    queryPanelIsTransitioning,
    setControlsPortalTarget,
    suggestedSql,
  };
}
