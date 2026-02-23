/**
 * Notebook Store
 *
 * Zustand store for managing notebook state with WebSocket real-time sync.
 * Handles cell CRUD operations, execution, and AI-initiated changes.
 */

import { create } from 'zustand';
import type {
  Notebook,
  NotebookCell,
  CellSummary,
  CellLock,
  LockOwner,
  CreateCellRequest,
  UpdateCellRequest,
  WSServerMessage
} from '@/types/notebook';
import * as notebooksApi from '@/lib/api/notebooks';
import { getNotebookWSClient, type NotebookWSClient } from '@/lib/websocket/notebookClient';

// ============================================================
// Types
// ============================================================

interface NotebookState {
  // Core state
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
// Initial State
// ============================================================

const initialState = {
  notebook: null,
  cells: [],
  cellSummaries: [],
  lockedCells: new Map<string, CellLock>(),
  isLoading: false,
  isConnecting: false,
  isSaving: false,
  isConnected: false,
  wsClient: null,
  error: null
};

// ============================================================
// Store
// ============================================================

export const useNotebookStore = create<NotebookState>((set, get) => ({
  ...initialState,

  // ============================================================
  // Initialization
  // ============================================================

  initializeNotebook: async (projectId: string) => {
    const { wsClient: existingClient, notebook: existingNotebook } = get();

    // If already connected to this notebook, skip
    if (existingNotebook?.projectId === projectId && existingClient?.isConnected) {
      return;
    }

    set({ isLoading: true, isConnecting: true, error: null });

    try {
      // Get or create notebook for project
      const notebook = await notebooksApi.getNotebook(projectId);
      set({ notebook });

      // Set up WebSocket connection
      const wsClient = getNotebookWSClient();
      set({ wsClient });

      // Set up WebSocket event handlers
      wsClient.on<WSServerMessage>('cell:created', (msg) => {
        if (msg.type === 'cell:created') {
          get().updateCellLocally(msg.cell);
        }
      });

      wsClient.on<WSServerMessage>('cell:updated', (msg) => {
        if (msg.type === 'cell:updated') {
          get().updateCellLocally(msg.cell);
        }
      });

      wsClient.on<WSServerMessage>('cell:deleted', (msg) => {
        if (msg.type === 'cell:deleted') {
          get().removeCellLocally(msg.cellId);
        }
      });

      wsClient.on<WSServerMessage>('cell:locked', (msg) => {
        if (msg.type === 'cell:locked') {
          get().setCellLock(msg.cellId, msg.lockedBy as LockOwner);
        }
      });

      wsClient.on<WSServerMessage>('cell:unlocked', (msg) => {
        if (msg.type === 'cell:unlocked') {
          get().clearCellLock(msg.cellId);
        }
      });

      wsClient.on<WSServerMessage>('cell:executing', (msg) => {
        if (msg.type === 'cell:executing') {
          // Update cell status to running
          set((state) => ({
            cells: state.cells.map((cell) =>
              cell.cellId === msg.cellId
                ? { ...cell, executionStatus: 'running' as const }
                : cell
            )
          }));
        }
      });

      wsClient.on<WSServerMessage>('cell:executed', (msg) => {
        if (msg.type === 'cell:executed') {
          get().updateCellLocally(msg.cell);
        }
      });

      wsClient.on<WSServerMessage>('error', (msg) => {
        if (msg.type === 'error') {
          set({ error: msg.message });
        }
      });

      wsClient.on('connected', () => {
        set({ isConnected: true, isConnecting: false });
        // Subscribe to notebook
        wsClient.subscribe(notebook.notebookId);
      });

      wsClient.on('disconnected', () => {
        set({ isConnected: false });
      });

      // Connect WebSocket
      await wsClient.connect();

      // Load cells
      await get().loadCells();

      set({ isLoading: false });
    } catch (error) {
      console.error('[notebookStore] Failed to initialize:', error);
      set({
        isLoading: false,
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Failed to initialize notebook'
      });
    }
  },

  disconnect: () => {
    const { wsClient, notebook } = get();

    if (wsClient && notebook) {
      wsClient.unsubscribe(notebook.notebookId);
    }

    // Don't disconnect the shared WebSocket client, just unsubscribe
    set({
      notebook: null,
      cells: [],
      cellSummaries: [],
      lockedCells: new Map(),
      isConnected: false,
      isConnecting: false
    });
  },

  // ============================================================
  // Cell CRUD
  // ============================================================

  loadCells: async () => {
    const { notebook } = get();
    if (!notebook) return;

    try {
      // First load summaries
      const summaries = await notebooksApi.listCells(notebook.notebookId);
      set({ cellSummaries: summaries });

      // Then load full cells
      const cells = await Promise.all(
        summaries.map((summary) => notebooksApi.getCell(summary.cellId))
      );

      set({ cells: cells.sort((a, b) => a.position - b.position) });
    } catch (error) {
      console.error('[notebookStore] Failed to load cells:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to load cells' });
    }
  },

  loadCell: async (cellId: string) => {
    try {
      const cell = await notebooksApi.getCell(cellId);
      get().updateCellLocally(cell);
      return cell;
    } catch (error) {
      console.error('[notebookStore] Failed to load cell:', error);
      return null;
    }
  },

  createCell: async (request: CreateCellRequest) => {
    const { notebook } = get();
    if (!notebook) return null;

    set({ isSaving: true });

    try {
      const cell = await notebooksApi.createCell(notebook.notebookId, request);

      // If position was specified, reload all cells to get correct positions
      // (backend shifts other cells' positions which WebSocket doesn't broadcast)
      if (request.position !== undefined) {
        await get().loadCells();
      }

      set({ isSaving: false });
      return cell;
    } catch (error) {
      console.error('[notebookStore] Failed to create cell:', error);
      set({
        isSaving: false,
        error: error instanceof Error ? error.message : 'Failed to create cell'
      });
      return null;
    }
  },

  updateCell: async (cellId: string, request: UpdateCellRequest) => {
    set({ isSaving: true });

    try {
      const cell = await notebooksApi.updateCell(cellId, request);
      // The WebSocket will handle updating the local state
      set({ isSaving: false });
      return cell;
    } catch (error) {
      console.error('[notebookStore] Failed to update cell:', error);
      set({
        isSaving: false,
        error: error instanceof Error ? error.message : 'Failed to update cell'
      });
      return null;
    }
  },

  deleteCell: async (cellId: string) => {
    set({ isSaving: true });

    try {
      await notebooksApi.deleteCell(cellId);
      // The WebSocket will handle updating the local state
      set({ isSaving: false });
      return true;
    } catch (error) {
      console.error('[notebookStore] Failed to delete cell:', error);
      set({
        isSaving: false,
        error: error instanceof Error ? error.message : 'Failed to delete cell'
      });
      return false;
    }
  },

  reorderCells: async (cellIds: string[]) => {
    const { notebook } = get();
    if (!notebook) return false;

    set({ isSaving: true });

    try {
      await notebooksApi.reorderCells(notebook.notebookId, { cellIds });

      // Update local positions
      set((state) => ({
        cells: state.cells.map((cell) => {
          const newPosition = cellIds.indexOf(cell.cellId);
          if (newPosition === -1) return cell;
          return { ...cell, position: newPosition };
        }).sort((a, b) => a.position - b.position),
        isSaving: false
      }));

      return true;
    } catch (error) {
      console.error('[notebookStore] Failed to reorder cells:', error);
      set({
        isSaving: false,
        error: error instanceof Error ? error.message : 'Failed to reorder cells'
      });
      return false;
    }
  },

  // ============================================================
  // Execution
  // ============================================================

  runCell: async (cellId: string, projectId: string) => {
    // Update local status to running
    set((state) => ({
      cells: state.cells.map((cell) =>
        cell.cellId === cellId
          ? { ...cell, executionStatus: 'running' as const }
          : cell
      )
    }));

    try {
      // The WebSocket will broadcast the result
      await notebooksApi.runCell(cellId, projectId);
    } catch (error) {
      console.error('[notebookStore] Failed to run cell:', error);

      // Update local status to error
      set((state) => ({
        cells: state.cells.map((cell) =>
          cell.cellId === cellId
            ? {
                ...cell,
                executionStatus: 'error' as const,
                output: [{
                  type: 'error' as const,
                  content: error instanceof Error ? error.message : 'Execution failed'
                }]
              }
            : cell
        ),
        error: error instanceof Error ? error.message : 'Failed to run cell'
      }));
    }
  },

  // ============================================================
  // Locking
  // ============================================================

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

  // ============================================================
  // Local State Updates
  // ============================================================

  updateCellLocally: (cell: NotebookCell) => {
    set((state) => {
      const existingIndex = state.cells.findIndex((c) => c.cellId === cell.cellId);

      if (existingIndex >= 0) {
        // Update existing cell
        const newCells = [...state.cells];
        newCells[existingIndex] = cell;
        return { cells: newCells.sort((a, b) => a.position - b.position) };
      } else {
        // Add new cell - need to shift positions of cells at or after this position
        // This handles the case where backend inserts at a specific position and shifts others,
        // but only broadcasts the new cell (not the shifted ones)
        const newPosition = cell.position;
        const adjustedCells = state.cells.map((existingCell) => {
          if (existingCell.position >= newPosition) {
            // Shift this cell's position by 1 to make room for the new cell
            return { ...existingCell, position: existingCell.position + 1 };
          }
          return existingCell;
        });

        return {
          cells: [...adjustedCells, cell].sort((a, b) => a.position - b.position)
        };
      }
    });
  },

  removeCellLocally: (cellId: string) => {
    set((state) => {
      const cellToRemove = state.cells.find((c) => c.cellId === cellId);
      if (!cellToRemove) {
        return {
          cells: state.cells,
          cellSummaries: state.cellSummaries.filter((s) => s.cellId !== cellId)
        };
      }

      const removedPosition = cellToRemove.position;

      // Remove the cell and adjust positions of cells that were after it
      const remainingCells = state.cells
        .filter((c) => c.cellId !== cellId)
        .map((c) => {
          if (c.position > removedPosition) {
            return { ...c, position: c.position - 1 };
          }
          return c;
        });

      return {
        cells: remainingCells,
        cellSummaries: state.cellSummaries.filter((s) => s.cellId !== cellId)
      };
    });

    // Also remove any lock
    get().clearCellLock(cellId);
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
  },

  setError: (error: string | null) => {
    set({ error });
  },

  // ============================================================
  // Reset
  // ============================================================

  reset: () => {
    const { wsClient, notebook } = get();

    if (wsClient && notebook) {
      wsClient.unsubscribe(notebook.notebookId);
    }

    set(initialState);
  }
}));

// ============================================================
// Selectors
// ============================================================

export const selectNotebook = (state: NotebookState) => state.notebook;
export const selectCells = (state: NotebookState) => state.cells;
export const selectCodeCells = (state: NotebookState) =>
  state.cells.filter((c) => c.cellType === 'code');
export const selectMarkdownCells = (state: NotebookState) =>
  state.cells.filter((c) => c.cellType === 'markdown');
export const selectIsLoading = (state: NotebookState) => state.isLoading;
export const selectIsConnected = (state: NotebookState) => state.isConnected;
export const selectError = (state: NotebookState) => state.error;
export const selectLockedCells = (state: NotebookState) => state.lockedCells;

// Check if any cells are locked by AI
export const selectHasAiLockedCells = (state: NotebookState) => {
  for (const lock of state.lockedCells.values()) {
    if (lock.lockedBy === 'ai') return true;
  }
  return false;
};

// Get cell by ID
export const selectCellById = (cellId: string) => (state: NotebookState) =>
  state.cells.find((c) => c.cellId === cellId);
