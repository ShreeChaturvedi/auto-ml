/**
 * Notebook Store — Selectors
 *
 * Pure selector functions derived from NotebookState. Imported by
 * notebookStore.ts and re-exported for consumer use.
 */

import type { Notebook, NotebookCell, CellSummary, CellLock } from '@/types/notebook';
import type { NotebookWSClient } from '@/lib/websocket/notebookClient';

// ============================================================
// Minimal state shape selectors operate on
// ============================================================

export interface NotebookStateSlice {
  currentProjectId: string | null;
  notebooks: Notebook[];
  activeNotebookId: string | null;
  notebook: Notebook | null;
  cells: NotebookCell[];
  cellSummaries: CellSummary[];
  lockedCells: Map<string, CellLock>;
  isLoading: boolean;
  isConnecting: boolean;
  isSaving: boolean;
  isConnected: boolean;
  wsClient: NotebookWSClient | null;
  error: string | null;
}

// ============================================================
// Selectors
// ============================================================

export const selectNotebook = (state: NotebookStateSlice): Notebook | null => state.notebook;
export const selectNotebooks = (state: NotebookStateSlice): Notebook[] => state.notebooks;
export const selectActiveNotebookId = (state: NotebookStateSlice): string | null =>
  state.activeNotebookId;
export const selectCells = (state: NotebookStateSlice): NotebookCell[] => state.cells;
export const selectCodeCells = (state: NotebookStateSlice): NotebookCell[] =>
  state.cells.filter((c) => c.cellType === 'code');
export const selectMarkdownCells = (state: NotebookStateSlice): NotebookCell[] =>
  state.cells.filter((c) => c.cellType === 'markdown');
export const selectIsLoading = (state: NotebookStateSlice): boolean => state.isLoading;
export const selectIsConnected = (state: NotebookStateSlice): boolean => state.isConnected;
export const selectError = (state: NotebookStateSlice): string | null => state.error;
export const selectLockedCells = (state: NotebookStateSlice): Map<string, CellLock> =>
  state.lockedCells;

export const selectHasAiLockedCells = (state: NotebookStateSlice): boolean => {
  for (const lock of state.lockedCells.values()) {
    if (lock.lockedBy === 'ai') return true;
  }
  return false;
};

export const selectCellById =
  (cellId: string) =>
  (state: NotebookStateSlice): NotebookCell | undefined =>
    state.cells.find((c) => c.cellId === cellId);
