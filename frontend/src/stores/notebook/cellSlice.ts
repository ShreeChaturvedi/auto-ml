/**
 * Notebook Store — Cell Slice
 *
 * Manages cell CRUD operations, reordering, execution, and local state
 * updates for notebook cells.
 */

import type {
  NotebookCell,
  CellSummary,
  CreateCellRequest,
  UpdateCellRequest
} from '@/types/notebook';
import * as notebooksApi from '@/lib/api/notebooks';
import type { NotebookSlice, NotebookState } from './types';

// ============================================================
// Cell slice interface
// ============================================================

export interface CellSlice {
  // State
  cells: NotebookCell[];
  cellSummaries: CellSummary[];

  // Actions - CRUD
  loadCells: () => Promise<void>;
  loadCell: (cellId: string) => Promise<NotebookCell | null>;
  createCell: (request: CreateCellRequest) => Promise<NotebookCell | null>;
  updateCell: (cellId: string, request: UpdateCellRequest) => Promise<NotebookCell | null>;
  deleteCell: (cellId: string) => Promise<boolean>;
  reorderCells: (cellIds: string[]) => Promise<boolean>;

  // Actions - Execution
  runCell: (cellId: string, projectId: string) => Promise<void>;

  // Actions - Local state
  updateCellLocally: (cell: NotebookCell) => void;
  removeCellLocally: (cellId: string) => void;
}

// ============================================================
// Slice creator
// ============================================================

export const createCellSlice: NotebookSlice<CellSlice> = (set, get) => ({
  // --- state ---
  cells: [],
  cellSummaries: [],

  // --- actions ---

  loadCells: async () => {
    const { activeNotebookId } = get();
    if (!activeNotebookId) return;

    try {
      const summaries = await notebooksApi.listCells(activeNotebookId);

      // Abort if the active notebook changed while the API call was in-flight
      if (get().activeNotebookId !== activeNotebookId) return;

      set({ cellSummaries: summaries });

      const cells = await Promise.all(
        summaries.map((summary) => notebooksApi.getCell(summary.cellId))
      );

      // Abort if the active notebook changed while fetching individual cells
      if (get().activeNotebookId !== activeNotebookId) return;

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

      set((state: NotebookState) => ({
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

  runCell: async (cellId: string, projectId: string) => {
    set((state: NotebookState) => ({
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
      set((state: NotebookState) => ({
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
        set((state: NotebookState) => ({
          cells: state.cells.map((cell) =>
            cell.cellId === cellId ? { ...cell, executionOrder } : cell
          )
        }));
      }
    } catch (error) {
      console.error('[notebookStore] Failed to run cell:', error);

      set((state: NotebookState) => ({
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

  updateCellLocally: (cell: NotebookCell) => {
    set((state: NotebookState) => {
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
    set((state: NotebookState) => {
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
  }
});
