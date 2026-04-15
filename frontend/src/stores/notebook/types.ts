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
  UpdateCellRequest,
  NotebookPhaseMetadata
} from '@/types/notebook';
import type { NotebookWSClient } from '@/lib/websocket/notebookClient';
import type { InsightCodegenContext } from '@/lib/api/insightCodegen';

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
  /** Cell currently executing inside `runAllCells`, if any. */
  runAllRunningCellId: string | null;

  // Loading states
  isLoading: boolean;
  isConnecting: boolean;
  isSaving: boolean;

  // WebSocket state
  isConnected: boolean;
  wsClient: NotebookWSClient | null;

  // Error state
  error: string | null;

  // Suggested cell state
  suggestedCellIds: Set<string>;
  streamingCellIds: Set<string>;
  streamErrors: Map<string, string>;
  streamAbortControllers: Map<string, AbortController>;

  // Actions - Initialization
  initializeNotebook: (projectId: string, notebookId?: string) => Promise<void>;
  disconnect: () => void;

  // Actions - Notebook management
  loadNotebooks: (projectId?: string) => Promise<void>;
  setActiveNotebook: (notebookId: string) => Promise<void>;
  createNotebook: (name?: string, metadata?: NotebookPhaseMetadata) => Promise<Notebook | null>;
  renameNotebook: (notebookId: string, name: string) => Promise<Notebook | null>;
  deleteNotebook: (notebookId: string) => Promise<boolean>;
  updateNotebookMetadata: (notebookId: string, metadata: NotebookPhaseMetadata) => Promise<Notebook | null>;

  // Actions - Cell CRUD
  loadCells: () => Promise<void>;
  loadCell: (cellId: string) => Promise<NotebookCell | null>;
  createCell: (request: CreateCellRequest) => Promise<NotebookCell | null>;
  updateCell: (cellId: string, request: UpdateCellRequest) => Promise<NotebookCell | null>;
  deleteCell: (cellId: string) => Promise<boolean>;
  reorderCells: (cellIds: string[]) => Promise<boolean>;

  // Actions - Execution
  runCell: (cellId: string, projectId: string) => Promise<void>;
  runAllCells: (projectId: string, signal: AbortSignal) => Promise<void>;
  stopRunAllCells: (projectId: string) => Promise<void>;

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

  // Actions - Suggested cells
  startSuggestedCellStream: (notebookId: string, context: InsightCodegenContext) => Promise<void>;
  acceptSuggestedCell: (cellId: string) => void;
  rejectSuggestedCell: (cellId: string) => Promise<void>;
  cancelSuggestedCellStream: (cellId: string) => void;

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
