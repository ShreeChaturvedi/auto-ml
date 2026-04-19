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
/** Phase-aware add handler: creates a new workbook via the phase hook's persistence path (localStorage + React state). Returns the new workbook ID. */
export type WorkbookAddHandler = () => string | undefined;
/** Phase-aware rename handler: renames a workbook via the phase hook's persistence path. */
export type WorkbookRenameHandler = (workbookId: string, name: string) => void;

interface WorkbookRegistryState {
  preprocessing: WorkbookEntry[];
  'feature-engineering': WorkbookEntry[];
  training: WorkbookEntry[];
  activeWorkbookIds: Partial<Record<WorkbookPhase, string>>;
  deleteHandlers: Partial<Record<WorkbookPhase, WorkbookDeleteHandler>>;
  addHandlers: Partial<Record<WorkbookPhase, WorkbookAddHandler>>;
  renameHandlers: Partial<Record<WorkbookPhase, WorkbookRenameHandler>>;

  setWorkbooks: (phase: WorkbookPhase, workbooks: WorkbookEntry[]) => void;
  setActiveWorkbookId: (phase: WorkbookPhase, workbookId: string | null) => void;
  addWorkbook: (phase: WorkbookPhase, workbook: WorkbookEntry) => void;
  removeWorkbook: (phase: WorkbookPhase, workbookId: string) => void;
  updateWorkbook: (phase: WorkbookPhase, workbookId: string, updates: Partial<WorkbookEntry>) => void;
  setDeleteHandler: (phase: WorkbookPhase, handler: WorkbookDeleteHandler | null) => void;
  setAddHandler: (phase: WorkbookPhase, handler: WorkbookAddHandler | null) => void;
  setRenameHandler: (phase: WorkbookPhase, handler: WorkbookRenameHandler | null) => void;
}

export type { WorkbookPhase };

export const useWorkbookRegistryStore = create<WorkbookRegistryState>((set) => ({
  preprocessing: [],
  'feature-engineering': [],
  training: [],
  activeWorkbookIds: {},
  deleteHandlers: {},
  addHandlers: {},
  renameHandlers: {},

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

  setActiveWorkbookId: (phase, workbookId) =>
    set((state) => {
      const previousId = state.activeWorkbookIds[phase];
      if (previousId === workbookId || (!workbookId && previousId == null)) {
        return state;
      }
      const nextActiveWorkbookIds = { ...state.activeWorkbookIds };
      if (workbookId) {
        nextActiveWorkbookIds[phase] = workbookId;
      } else {
        delete nextActiveWorkbookIds[phase];
      }
      return { activeWorkbookIds: nextActiveWorkbookIds };
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
    }),

  setAddHandler: (phase, handler) =>
    set((state) => {
      if (handler === null) {
        const next = { ...state.addHandlers };
        delete next[phase];
        return { addHandlers: next };
      }
      return { addHandlers: { ...state.addHandlers, [phase]: handler } };
    }),

  setRenameHandler: (phase, handler) =>
    set((state) => {
      if (handler === null) {
        const next = { ...state.renameHandlers };
        delete next[phase];
        return { renameHandlers: next };
      }
      return { renameHandlers: { ...state.renameHandlers, [phase]: handler } };
    })
}));
