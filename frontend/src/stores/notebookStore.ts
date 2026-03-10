/**
 * Notebook Store
 *
 * Zustand store for managing notebook state with WebSocket real-time sync.
 * Handles notebook switching and cell CRUD operations.
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
// Initial State
// ============================================================

const initialState = {
  currentProjectId: null,
  notebooks: [],
  activeNotebookId: null,
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

let wsListenersCleanup: (() => void) | null = null;

// ============================================================
// Store
// ============================================================

export const useNotebookStore = create<NotebookState>((set, get) => ({
  ...initialState,

  // ============================================================
  // Initialization
  // ============================================================

  initializeNotebook: async (projectId: string) => {
    const {
      wsClient: existingClient,
      notebook: existingNotebook,
      currentProjectId,
      activeNotebookId
    } = get();

    if (
      currentProjectId === projectId
      && existingNotebook
      && existingClient?.isConnected
    ) {
      return;
    }

    set({ isLoading: true, isConnecting: true, error: null, currentProjectId: projectId });

    try {
      const notebooks = await notebooksApi.listNotebooks(projectId);
      const preferredNotebookId =
        currentProjectId === projectId
          ? activeNotebookId
          : null;
      const resolvedNotebookId =
        preferredNotebookId && notebooks.some((entry) => entry.notebookId === preferredNotebookId)
          ? preferredNotebookId
          : notebooks[0]?.notebookId ?? null;
      const resolvedNotebook =
        notebooks.find((entry) => entry.notebookId === resolvedNotebookId) ?? null;

      if (
        existingClient?.isConnected
        && existingNotebook?.notebookId
        && existingNotebook.notebookId !== resolvedNotebookId
      ) {
        existingClient.unsubscribe(existingNotebook.notebookId);
      }

      const wsClient = existingClient ?? getNotebookWSClient();

      set({
        wsClient,
        notebooks,
        activeNotebookId: resolvedNotebookId,
        notebook: resolvedNotebook,
        cells: [],
        cellSummaries: [],
        lockedCells: new Map(),
        error: null
      });

      wsListenersCleanup?.();

      // Set up WebSocket event handlers
      const unsubscribeCellCreated = wsClient.on<WSServerMessage>('cell:created', (msg) => {
        if (msg.type === 'cell:created' && msg.cell.notebookId === get().activeNotebookId) {
          get().updateCellLocally(msg.cell);
        }
      });

      const unsubscribeCellUpdated = wsClient.on<WSServerMessage>('cell:updated', (msg) => {
        if (msg.type === 'cell:updated' && msg.cell.notebookId === get().activeNotebookId) {
          get().updateCellLocally(msg.cell);
        }
      });

      const unsubscribeCellDeleted = wsClient.on<WSServerMessage>('cell:deleted', (msg) => {
        if (msg.type === 'cell:deleted') {
          get().removeCellLocally(msg.cellId);
        }
      });

      const unsubscribeCellLocked = wsClient.on<WSServerMessage>('cell:locked', (msg) => {
        if (msg.type === 'cell:locked') {
          get().setCellLock(msg.cellId, msg.lockedBy as LockOwner);
        }
      });

      const unsubscribeCellUnlocked = wsClient.on<WSServerMessage>('cell:unlocked', (msg) => {
        if (msg.type === 'cell:unlocked') {
          get().clearCellLock(msg.cellId);
        }
      });

      const unsubscribeCellExecuting = wsClient.on<WSServerMessage>('cell:executing', (msg) => {
        if (msg.type === 'cell:executing') {
          set((state) => ({
            cells: state.cells.map((cell) =>
              cell.cellId === msg.cellId
                ? { ...cell, executionStatus: 'running' as const, output: [], outputRefs: [] }
                : cell
            )
          }));
        }
      });

      const unsubscribeCellExecuted = wsClient.on<WSServerMessage>('cell:executed', (msg) => {
        if (msg.type === 'cell:executed' && msg.cell.notebookId === get().activeNotebookId) {
          get().updateCellLocally(msg.cell);
        }
      });

      const unsubscribeCellOutput = wsClient.on<WSServerMessage>('cell:output', (msg) => {
        if (msg.type === 'cell:output') {
          const state = get();
          // Only update if this cell belongs to the active notebook's cell list
          if (state.activeNotebookId && state.cells.some((c) => c.cellId === msg.cellId)) {
            set((prev) => ({
              cells: prev.cells.map((cell) =>
                cell.cellId === msg.cellId
                  ? { ...cell, output: [...cell.output, msg.output] }
                  : cell
              )
            }));
          }
        }
      });

      const unsubscribeError = wsClient.on<WSServerMessage>('error', (msg) => {
        if (msg.type === 'error') {
          set({ error: msg.message });
        }
      });

      const unsubscribeConnected = wsClient.on('connected', () => {
        set({ isConnected: true, isConnecting: false });
      });

      const unsubscribeDisconnected = wsClient.on('disconnected', () => {
        set({ isConnected: false });
      });

      wsListenersCleanup = () => {
        unsubscribeCellCreated();
        unsubscribeCellUpdated();
        unsubscribeCellDeleted();
        unsubscribeCellLocked();
        unsubscribeCellUnlocked();
        unsubscribeCellExecuting();
        unsubscribeCellExecuted();
        unsubscribeCellOutput();
        unsubscribeError();
        unsubscribeConnected();
        unsubscribeDisconnected();
      };

      await wsClient.connect();
      if (resolvedNotebookId) {
        wsClient.subscribe(resolvedNotebookId);
        await get().loadCells();
      }

      set({
        isLoading: false,
        isConnecting: false,
        isConnected: wsClient.isConnected
      });
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

    wsListenersCleanup?.();
    wsListenersCleanup = null;

    set({
      currentProjectId: null,
      notebooks: [],
      activeNotebookId: null,
      notebook: null,
      cells: [],
      cellSummaries: [],
      lockedCells: new Map(),
      isConnected: false,
      isConnecting: false
    });
  },

  // ============================================================
  // Notebook Management
  // ============================================================

  loadNotebooks: async (projectId?: string) => {
    const resolvedProjectId = projectId ?? get().currentProjectId;
    if (!resolvedProjectId) return;

    try {
      const notebooks = await notebooksApi.listNotebooks(resolvedProjectId);
      set((state) => {
        const nextActiveNotebookId =
          state.activeNotebookId && notebooks.some((entry) => entry.notebookId === state.activeNotebookId)
            ? state.activeNotebookId
            : notebooks[0]?.notebookId ?? null;

        const nextNotebook =
          notebooks.find((entry) => entry.notebookId === nextActiveNotebookId) ?? null;

        return {
          notebooks,
          activeNotebookId: nextActiveNotebookId,
          notebook: nextNotebook
        };
      });
    } catch (error) {
      console.error('[notebookStore] Failed to load notebooks:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to load notebooks' });
    }
  },

  setActiveNotebook: async (notebookId: string) => {
    const { notebooks, notebook: currentNotebook, wsClient } = get();

    if (currentNotebook?.notebookId === notebookId) {
      return;
    }

    const targetNotebook = notebooks.find((entry) => entry.notebookId === notebookId);
    if (!targetNotebook) {
      set({ error: 'Notebook not found' });
      return;
    }

    if (wsClient && currentNotebook) {
      wsClient.unsubscribe(currentNotebook.notebookId);
    }

    set({
      activeNotebookId: notebookId,
      notebook: targetNotebook,
      cells: [],
      cellSummaries: [],
      lockedCells: new Map(),
      isLoading: true,
      error: null
    });

    if (wsClient) {
      wsClient.subscribe(notebookId);
    }

    await get().loadCells();
    set({ isLoading: false });
  },

  createNotebook: async (name?: string) => {
    const projectId = get().currentProjectId;
    if (!projectId) return null;

    set({ isSaving: true, error: null });

    try {
      const notebook = await notebooksApi.createNotebook(projectId, { name });

      set((state) => ({
        notebooks: [...state.notebooks, notebook],
        isSaving: false
      }));

      await get().setActiveNotebook(notebook.notebookId);
      return notebook;
    } catch (error) {
      console.error('[notebookStore] Failed to create notebook:', error);
      set({
        isSaving: false,
        error: error instanceof Error ? error.message : 'Failed to create notebook'
      });
      return null;
    }
  },

  renameNotebook: async (notebookId: string, name: string) => {
    set({ isSaving: true, error: null });

    try {
      const notebook = await notebooksApi.updateNotebook(notebookId, { name });

      set((state) => {
        const notebooks = state.notebooks.map((entry) =>
          entry.notebookId === notebookId ? notebook : entry
        );

        const activeNotebook = state.notebook?.notebookId === notebookId
          ? notebook
          : state.notebook;

        return {
          notebooks,
          notebook: activeNotebook,
          isSaving: false
        };
      });

      return notebook;
    } catch (error) {
      console.error('[notebookStore] Failed to rename notebook:', error);
      set({
        isSaving: false,
        error: error instanceof Error ? error.message : 'Failed to rename notebook'
      });
      return null;
    }
  },

  deleteNotebook: async (notebookId: string) => {
    const projectId = get().currentProjectId;
    if (!projectId) return false;

    set({ isSaving: true, error: null });

    try {
      const result = await notebooksApi.deleteNotebook(projectId, notebookId);

      set((state) => ({
        notebooks: state.notebooks.filter((entry) => entry.notebookId !== notebookId),
        isSaving: false
      }));

      if (get().activeNotebookId === notebookId) {
        await get().setActiveNotebook(result.fallbackNotebookId);
      }

      return true;
    } catch (error) {
      console.error('[notebookStore] Failed to delete notebook:', error);
      set({
        isSaving: false,
        error: error instanceof Error ? error.message : 'Failed to delete notebook'
      });
      return false;
    }
  },

  // ============================================================
  // Cell CRUD
  // ============================================================

  loadCells: async () => {
    const { activeNotebookId } = get();
    if (!activeNotebookId) return;

    try {
      const summaries = await notebooksApi.listCells(activeNotebookId);
      set({ cellSummaries: summaries });

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
    set((state) => ({
      cells: state.cells.map((cell) =>
        cell.cellId === cellId
          ? { ...cell, executionStatus: 'running' as const, executionDurationMs: null }
          : cell
      )
    }));

    try {
      const result = await notebooksApi.runCell(cellId, projectId);

      const executionOrder = result.executionOrder ?? undefined;

      // Keep local state accurate (include executionOrder so [n] shows immediately).
      set((state) => ({
        cells: state.cells.map((cell) =>
          cell.cellId === cellId
            ? {
                ...cell,
                executionStatus: result.status === 'success' ? 'success' : 'error',
                executionDurationMs: result.executionMs,
                executionOrder: executionOrder ?? cell.executionOrder ?? undefined,
                isDirty: false,
                output: result.outputs
              }
            : cell
        )
      }));

      // Refresh authoritative server cell state (persisted outputs, refs).
      await get().loadCell(cellId);
      // Ensure executionOrder is set (run response is source of truth; loadCell may not have it).
      if (executionOrder != null) {
        set((state) => ({
          cells: state.cells.map((cell) =>
            cell.cellId === cellId ? { ...cell, executionOrder } : cell
          )
        }));
      }
    } catch (error) {
      console.error('[notebookStore] Failed to run cell:', error);

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
        const existing = state.cells[existingIndex];
        // Preserve executionOrder if incoming cell lacks it but we have it (e.g. from run response).
        const merged =
          cell.executionOrder != null
            ? cell
            : existing.executionOrder != null
              ? { ...cell, executionOrder: existing.executionOrder }
              : cell;
        const newCells = [...state.cells];
        newCells[existingIndex] = merged;
        return { cells: newCells.sort((a, b) => a.position - b.position) };
      }

      const newPosition = cell.position;
      const adjustedCells = state.cells.map((existingCell) => {
        if (existingCell.position >= newPosition) {
          return { ...existingCell, position: existingCell.position + 1 };
        }
        return existingCell;
      });

      return {
        cells: [...adjustedCells, cell].sort((a, b) => a.position - b.position)
      };
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
export const selectNotebooks = (state: NotebookState) => state.notebooks;
export const selectActiveNotebookId = (state: NotebookState) => state.activeNotebookId;
export const selectCells = (state: NotebookState) => state.cells;
export const selectCodeCells = (state: NotebookState) =>
  state.cells.filter((c) => c.cellType === 'code');
export const selectMarkdownCells = (state: NotebookState) =>
  state.cells.filter((c) => c.cellType === 'markdown');
export const selectIsLoading = (state: NotebookState) => state.isLoading;
export const selectIsConnected = (state: NotebookState) => state.isConnected;
export const selectError = (state: NotebookState) => state.error;
export const selectLockedCells = (state: NotebookState) => state.lockedCells;

export const selectHasAiLockedCells = (state: NotebookState) => {
  for (const lock of state.lockedCells.values()) {
    if (lock.lockedBy === 'ai') return true;
  }
  return false;
};

export const selectCellById = (cellId: string) => (state: NotebookState) =>
  state.cells.find((c) => c.cellId === cellId);
