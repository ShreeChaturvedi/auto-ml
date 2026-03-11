/**
 * Notebook Store
 *
 * Zustand store for managing notebook state with WebSocket real-time sync.
 * Composed from focused slices: session, cell, and lock.
 *
 * All existing imports of `useNotebookStore` continue to work unchanged.
 */

import { create } from 'zustand';
import type { NotebookState } from './notebook/types';
import { createSessionSlice } from './notebook/sessionSlice';
import { createCellSlice } from './notebook/cellSlice';
import { createLockSlice } from './notebook/lockSlice';

export type { NotebookState } from './notebook/types';

export {
  selectNotebook,
  selectNotebooks,
  selectActiveNotebookId,
  selectCells,
  selectCodeCells,
  selectMarkdownCells,
  selectIsLoading,
  selectIsConnected,
  selectError,
  selectLockedCells,
  selectHasAiLockedCells,
  selectCellById
} from './notebook/selectors';

// ============================================================
// Composed Store
// ============================================================

export const useNotebookStore = create<NotebookState>((...args) => ({
  ...createSessionSlice(...args),
  ...createCellSlice(...args),
  ...createLockSlice(...args)
}));
