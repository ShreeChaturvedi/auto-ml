/**
 * Notebook Store — Session Slice
 *
 * Manages project context, active notebook selection, WebSocket lifecycle,
 * notebook CRUD (create / rename / delete), and connection state.
 */

import type { Notebook, NotebookPhaseMetadata } from '@/types/notebook';
import type { NotebookWSClient } from '@/lib/websocket/notebookClient';
import * as notebooksApi from '@/lib/api/notebooks';
import { getNotebookWSClient } from '@/lib/websocket/notebookClient';
import { setupWSHandlers } from './wsHandlers';
import type { NotebookSlice, NotebookState } from './types';

// ============================================================
// WS listener cleanup handle (module-scoped)
// ============================================================

let wsListenersCleanup: (() => void) | null = null;

// ============================================================
// Session state helpers
// ============================================================

export interface SessionSlice {
  // State
  currentProjectId: string | null;
  notebooks: Notebook[];
  activeNotebookId: string | null;
  notebook: Notebook | null;
  isLoading: boolean;
  isConnecting: boolean;
  isSaving: boolean;
  isConnected: boolean;
  wsClient: NotebookWSClient | null;
  error: string | null;

  // Actions
  initializeNotebook: (projectId: string, notebookId?: string) => Promise<void>;
  disconnect: () => void;
  loadNotebooks: (projectId?: string) => Promise<void>;
  setActiveNotebook: (notebookId: string) => Promise<void>;
  createNotebook: (name?: string, metadata?: NotebookPhaseMetadata) => Promise<Notebook | null>;
  renameNotebook: (notebookId: string, name: string) => Promise<Notebook | null>;
  deleteNotebook: (notebookId: string) => Promise<boolean>;
  updateNotebookMetadata: (notebookId: string, metadata: NotebookPhaseMetadata) => Promise<Notebook | null>;
  setError: (error: string | null) => void;
  reset: () => void;
}

// ============================================================
// Slice creator
// ============================================================

export const createSessionSlice: NotebookSlice<SessionSlice> = (set, get) => ({
  // --- state ---
  currentProjectId: null,
  notebooks: [],
  activeNotebookId: null,
  notebook: null,
  isLoading: false,
  isConnecting: false,
  isSaving: false,
  isConnected: false,
  wsClient: null,
  error: null,

  // --- actions ---

  initializeNotebook: async (projectId: string, notebookId?: string) => {
    // Guard: skip if notebookId was explicitly passed but is nullish (disconnect cleanup race)
    if (notebookId !== undefined && !notebookId) return;

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
      // If a specific notebook is requested and it differs from active, switch to it
      if (notebookId && existingNotebook.notebookId !== notebookId) {
        await get().setActiveNotebook(notebookId);
      }
      return;
    }

    set({ isLoading: true, isConnecting: true, error: null, currentProjectId: projectId });

    try {
      const notebooks = await notebooksApi.listNotebooks(projectId);
      const preferredNotebookId =
        notebookId
        ?? (currentProjectId === projectId ? activeNotebookId : null);
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
      wsListenersCleanup = setupWSHandlers(wsClient, get, set);

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
    wsClient?.disconnect();

    set({
      currentProjectId: null,
      notebooks: [],
      activeNotebookId: null,
      notebook: null,
      cells: [],
      cellSummaries: [],
      lockedCells: new Map(),
      isConnected: false,
      isConnecting: false,
      wsClient: null
    });
  },

  loadNotebooks: async (projectId?: string) => {
    const resolvedProjectId = projectId ?? get().currentProjectId;
    if (!resolvedProjectId) return;

    try {
      const notebooks = await notebooksApi.listNotebooks(resolvedProjectId);
      set((state: NotebookState) => {
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
    const {
      notebooks,
      notebook: currentNotebook,
      wsClient,
      currentProjectId
    } = get();

    if (currentNotebook?.notebookId === notebookId) {
      return;
    }

    let targetNotebook = notebooks.find((entry) => entry.notebookId === notebookId);
    if (!targetNotebook && currentProjectId) {
      await get().loadNotebooks(currentProjectId);
      targetNotebook = get().notebooks.find((entry) => entry.notebookId === notebookId);
    }

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

  createNotebook: async (name?: string, metadata?: NotebookPhaseMetadata) => {
    const projectId = get().currentProjectId;
    if (!projectId) return null;

    set({ isSaving: true, error: null });

    try {
      const notebook = await notebooksApi.createNotebook(projectId, { name, metadata });

      set((state: NotebookState) => ({
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

      set((state: NotebookState) => {
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

      set((state: NotebookState) => ({
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

  updateNotebookMetadata: async (notebookId: string, metadata: NotebookPhaseMetadata) => {
    try {
      const currentNotebook = get().notebooks.find((entry) => entry.notebookId === notebookId)
        ?? (get().notebook?.notebookId === notebookId ? get().notebook : null);
      const nextMetadata = {
        ...((currentNotebook?.metadata as NotebookPhaseMetadata | undefined) ?? {}),
        ...metadata
      };
      const notebook = await notebooksApi.updateNotebook(notebookId, { metadata: nextMetadata });

      set((state: NotebookState) => {
        const notebooks = state.notebooks.map((entry) =>
          entry.notebookId === notebookId ? notebook : entry
        );
        const activeNotebook = state.notebook?.notebookId === notebookId
          ? notebook
          : state.notebook;
        return { notebooks, notebook: activeNotebook };
      });

      return notebook;
    } catch (error) {
      console.error('[notebookStore] Failed to update notebook metadata:', error);
      return null;
    }
  },

  setError: (error: string | null) => {
    set({ error });
  },

  reset: () => {
    const { wsClient, notebook } = get();

    if (wsClient && notebook) {
      wsClient.unsubscribe(notebook.notebookId);
    }

    set({
      currentProjectId: null,
      notebooks: [],
      activeNotebookId: null,
      notebook: null,
      cells: [],
      cellSummaries: [],
      lockedCells: new Map(),
      isLoading: false,
      isConnecting: false,
      isSaving: false,
      isConnected: false,
      wsClient: null,
      error: null
    });
  }
});
