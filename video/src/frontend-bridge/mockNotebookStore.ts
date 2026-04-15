/**
 * Frame-deterministic replacement for `frontend/src/stores/notebookStore.ts`.
 *
 * Auth forms and the HomePage don't touch the notebook store today — this
 * shim only has to satisfy `import { useNotebookStore } from '@/stores/notebookStore'`
 * calls from deeper real components. Keeps the API minimal; Beats 3+ will
 * extend as notebook scenes are built.
 */

import { create } from "zustand";

interface NotebookStoreStub {
  currentProjectId: string | null;
  notebooks: unknown[];
  activeNotebookId: string | null;
  notebook: unknown | null;
  cells: unknown[];
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
  setError: (error: string | null) => void;
}

export const useNotebookStore = create<NotebookStoreStub>((set) => ({
  currentProjectId: null,
  notebooks: [],
  activeNotebookId: null,
  notebook: null,
  cells: [],
  isLoading: false,
  isConnected: false,
  error: null,
  setError: (error) => set({ error }),
}));
