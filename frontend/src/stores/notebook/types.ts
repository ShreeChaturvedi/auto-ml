/**
 * Notebook Store — Shared Types
 *
 * Defines the full NotebookState interface used by all slices and the
 * composed store. Each slice's StateCreator is typed against this so
 * that set/get expose the entire store.
 */

import type { StateCreator } from 'zustand';
import type {
  Notebook,
  NotebookCell,
  CellSummary,
  CellLock,
  LockOwner,
  CreateCellRequest,
  UpdateCellRequest
} from '@/types/notebook';
import type { NotebookWSClient } from '@/lib/websocket/notebookClient';

// ============================================================
// Full store state
// ============================================================

export interface NotebookState {
  // Core state
  currentProjectId: string | null;
  notebooks: Notebook[];
  activeNotebookId: string | null;
  notebook: Notebook | null;
  cells: NotebookCell[];
  cellSummaries: CellSummary[];
  lockedCells: Map<string, CellLock>;

  // Loading states
  isLoading: boolean;
  isConnecting: boolean;
  isSaving: boolean;

  // WebSocket state
  isConnected: boolean;
  wsClient: NotebookWSClient | null;

  // Error state
  error: string | null;

  // Actions - Initialization
  initializeNotebook: (projectId: string) => Promise<void>;
  disconnect: () => void;

  // Actions - Notebook management
  loadNotebooks: (projectId?: string) => Promise<void>;
  setActiveNotebook: (notebookId: string) => Promise<void>;
  createNotebook: (name?: string) => Promise<Notebook | null>;
  renameNotebook: (notebookId: string, name: string) => Promise<Notebook | null>;
  deleteNotebook: (notebookId: string) => Promise<boolean>;

  // Actions - Cell CRUD
  loadCells: () => Promise<void>;
  loadCell: (cellId: string) => Promise<NotebookCell | null>;
  createCell: (request: CreateCellRequest) => Promise<NotebookCell | null>;
  updateCell: (cellId: string, request: UpdateCellRequest) => Promise<NotebookCell | null>;
  deleteCell: (cellId: string) => Promise<boolean>;
  reorderCells: (cellIds: string[]) => Promise<boolean>;

  // Actions - Execution
  runCell: (cellId: string, projectId: string) => Promise<void>;

  // Actions - Locking
  getCellLock: (cellId: string) => Promise<CellLock | null>;
  isCellLocked: (cellId: string) => boolean;
  getCellLockOwner: (cellId: string) => LockOwner | null;

  // Actions - Local state updates
  updateCellLocally: (cell: NotebookCell) => void;
  removeCellLocally: (cellId: string) => void;
  setCellLock: (cellId: string, lockedBy: LockOwner) => void;
  clearCellLock: (cellId: string) => void;
  setError: (error: string | null) => void;

  // Actions - Reset
  reset: () => void;
}

// ============================================================
// Slice creator helper type
// ============================================================

/**
 * A Zustand StateCreator where each slice can read/write the full
 * NotebookState via `set` and `get`. The slice only needs to return
 * its own portion of the state + actions.
 */
export type NotebookSlice<T> = StateCreator<NotebookState, [], [], T>;
