/**
 * useColumnTypeEditor - Hook managing column type update state and handler
 */

import { useState, useCallback } from 'react';
import type { ColumnDataType } from '@/types/file';

interface UseColumnTypeEditorOptions {
  onColumnTypeChange?: (columnName: string, nextType: ColumnDataType) => Promise<void> | void;
}

export function useColumnTypeEditor({ onColumnTypeChange }: UseColumnTypeEditorOptions) {
  const [updatingColumnName, setUpdatingColumnName] = useState<string | null>(null);

  const handleColumnTypeSelect = useCallback(
    async (columnName: string, nextType: ColumnDataType) => {
      if (!onColumnTypeChange) {
        return;
      }
      setUpdatingColumnName(columnName);
      try {
        await onColumnTypeChange(columnName, nextType);
      } finally {
        setUpdatingColumnName((current) => (current === columnName ? null : current));
      }
    },
    [onColumnTypeChange]
  );

  return { updatingColumnName, handleColumnTypeSelect };
}
