/**
 * WorkbookRegistryStore — in-memory Zustand store for sidebar workbook rendering.
 *
 * Phase panels sync their workbook lists here on mount and whenever workbooks change.
 * The sidebar subscribes via Zustand selectors for automatic re-renders.
 * No persistence — purely a reactive bridge between phase panels and the sidebar.
 */

import { create } from 'zustand';
import type { WorkbookEntry } from '@/types/workbook';

type WorkbookPhase = 'preprocessing' | 'feature-engineering' | 'training';

/** Phase-aware delete handler: returns new active workbook ID on success, undefined if rejected. */
export type WorkbookDeleteHandler = (workbookId: string) => string | undefined;

interface WorkbookRegistryState {
  preprocessing: WorkbookEntry[];
  'feature-engineering': WorkbookEntry[];
  training: WorkbookEntry[];
  deleteHandlers: Partial<Record<WorkbookPhase, WorkbookDeleteHandler>>;

  setWorkbooks: (phase: WorkbookPhase, workbooks: WorkbookEntry[]) => void;
  addWorkbook: (phase: WorkbookPhase, workbook: WorkbookEntry) => void;
  removeWorkbook: (phase: WorkbookPhase, workbookId: string) => void;
  updateWorkbook: (phase: WorkbookPhase, workbookId: string, updates: Partial<WorkbookEntry>) => void;
  setDeleteHandler: (phase: WorkbookPhase, handler: WorkbookDeleteHandler | null) => void;
}

export type { WorkbookPhase };

export const useWorkbookRegistryStore = create<WorkbookRegistryState>((set) => ({
  preprocessing: [],
  'feature-engineering': [],
  training: [],
  deleteHandlers: {},

  setWorkbooks: (phase, workbooks) =>
    set((state) => {
      const prev = state[phase];
      if (prev === workbooks) return state;
      // Shallow compare to avoid no-op updates when callers .map() identical data
      if (
        prev.length === workbooks.length &&
        prev.every((w, i) => w.id === workbooks[i].id && w.name === workbooks[i].name && w.notebookId === workbooks[i].notebookId)
      ) {
        return state;
      }
      return { [phase]: workbooks };
    }),

  addWorkbook: (phase, workbook) =>
    set((state) => ({
      [phase]: [...state[phase], workbook]
    })),

  removeWorkbook: (phase, workbookId) =>
    set((state) => {
      const prev = state[phase];
      const next = prev.filter((w) => w.id !== workbookId);
      if (next.length === prev.length) return state;
      return { [phase]: next };
    }),

  updateWorkbook: (phase, workbookId, updates) =>
    set((state) => {
      const prev = state[phase];
      let changed = false;
      const next = prev.map((w) => {
        if (w.id !== workbookId) return w;
        const merged = { ...w, ...updates };
        if (w.name === merged.name && w.notebookId === merged.notebookId) return w;
        changed = true;
        return merged;
      });
      if (!changed) return state;
      return { [phase]: next };
    }),

  setDeleteHandler: (phase, handler) =>
    set((state) => {
      if (handler === null) {
        const next = { ...state.deleteHandlers };
        delete next[phase];
        return { deleteHandlers: next };
      }
      return { deleteHandlers: { ...state.deleteHandlers, [phase]: handler } };
    })
}));
