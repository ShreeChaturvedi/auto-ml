/**
 * Notebook Store — Lock Slice
 *
 * Manages ephemeral cell-lock UI state: querying, setting, and clearing
 * locks on individual notebook cells.
 */

import type { CellLock, LockOwner } from '@/types/notebook';
import * as notebooksApi from '@/lib/api/notebooks';
import type { NotebookSlice } from './types';

// ============================================================
// Lock slice interface
// ============================================================

export interface LockSlice {
  // State
  lockedCells: Map<string, CellLock>;

  // Actions
  getCellLock: (cellId: string) => Promise<CellLock | null>;
  isCellLocked: (cellId: string) => boolean;
  getCellLockOwner: (cellId: string) => LockOwner | null;
  setCellLock: (cellId: string, lockedBy: LockOwner) => void;
  clearCellLock: (cellId: string) => void;
}

// ============================================================
// Slice creator
// ============================================================

export const createLockSlice: NotebookSlice<LockSlice> = (set, get) => ({
  // --- state ---
  lockedCells: new Map<string, CellLock>(),

  // --- actions ---

  getCellLock: async (cellId: string) => {
    try {
      const result = await notebooksApi.getCellLock(cellId);
      if (result.locked && result.by) {
        const lock: CellLock = {
          cellId,
          lockedBy: result.by as LockOwner,
          lockedAt: new Date()
        };
        get().setCellLock(cellId, result.by as LockOwner);
        return lock;
      }
      return null;
    } catch (error) {
      console.error('[notebookStore] Failed to get cell lock:', error);
      return null;
    }
  },

  isCellLocked: (cellId: string) => {
    return get().lockedCells.has(cellId);
  },

  getCellLockOwner: (cellId: string) => {
    const lock = get().lockedCells.get(cellId);
    return lock?.lockedBy ?? null;
  },

  setCellLock: (cellId: string, lockedBy: LockOwner) => {
    set((state) => {
      const newLockedCells = new Map(state.lockedCells);
      newLockedCells.set(cellId, {
        cellId,
        lockedBy,
        lockedAt: new Date()
      });
      return { lockedCells: newLockedCells };
    });
  },

  clearCellLock: (cellId: string) => {
    set((state) => {
      const newLockedCells = new Map(state.lockedCells);
      newLockedCells.delete(cellId);
      return { lockedCells: newLockedCells };
    });
  }
});
