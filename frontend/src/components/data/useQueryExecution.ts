/**
 * useQueryExecution - Hook managing query mode state, text buffers, and execution
 */

import { useState, useCallback } from 'react';
import type { QueryMode } from '@/types/file';

const DEFAULT_SQL = `-- Enter your SQL query
-- Use the table name from your uploaded dataset
-- Wrap names with spaces in double quotes (example: "First Name")
-- Press Ctrl+Space for autocomplete suggestions

SELECT * FROM your_table LIMIT 100`;

const DEFAULT_ENGLISH = '';

interface UseQueryExecutionOptions {
  onExecute: (query: string, mode: QueryMode) => void;
  externalMode?: QueryMode;
  onModeChange?: (mode: QueryMode) => void;
}

export function useQueryExecution({
  onExecute,
  externalMode,
  onModeChange
}: UseQueryExecutionOptions) {
  // Use external mode if provided, otherwise use internal state
  const [internalMode, setInternalMode] = useState<QueryMode>('sql');
  const mode = externalMode ?? internalMode;

  // Separate state for each mode to preserve inputs when switching
  const [sqlQuery, setSqlQuery] = useState<string>(DEFAULT_SQL);
  const [englishQuery, setEnglishQuery] = useState<string>(DEFAULT_ENGLISH);

  const handleModeChange = useCallback(
    (nextMode: QueryMode) => {
      if (externalMode !== undefined) {
        onModeChange?.(nextMode);
        return;
      }
      setInternalMode(nextMode);
      onModeChange?.(nextMode);
    },
    [externalMode, onModeChange]
  );

  // Get current query based on mode
  const currentQuery = mode === 'sql' ? sqlQuery : englishQuery;

  // Handle query text change
  const handleQueryChange = useCallback((value: string) => {
    if (mode === 'sql') {
      setSqlQuery(value);
    } else {
      setEnglishQuery(value);
    }
  }, [mode]);

  // Handle query execution
  const handleExecute = useCallback(() => {
    if (currentQuery.trim()) {
      onExecute(currentQuery, mode);
    }
  }, [currentQuery, mode, onExecute]);

  return {
    mode,
    sqlQuery,
    setSqlQuery,
    englishQuery,
    currentQuery,
    handleModeChange,
    handleQueryChange,
    handleExecute
  };
}
