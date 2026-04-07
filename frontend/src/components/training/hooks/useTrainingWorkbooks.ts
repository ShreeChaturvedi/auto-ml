/**
 * useTrainingWorkbooks — manages workbook lifecycle for the Training phase.
 *
 * Provides workbook CRUD, localStorage persistence, and registry store sync.
 * Training previously had a flat storageKey="training-messages" — this hook
 * migrates that to per-workbook keys on first load.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkbookRegistryStore } from '@/stores/workbookRegistryStore';
import { nextWorkbookName, createWorkbookId } from '@/components/preprocessing/preprocessingTabUtils';
import { deleteNotebook } from '@/lib/api/notebooks';
import type { WorkbookEntry } from '@/types/workbook';

const DEFAULT_WORKBOOK_ID = 'training-wb-1';

function buildStateKey(projectId: string): string {
  return `training-workbooks-v1-${projectId}`;
}

function buildMessageKey(workbookId: string, projectId: string): string {
  return `training-messages-v1-${workbookId}-${projectId}`;
}

interface StoredState {
  activeWorkbookId: string;
  workbooks: WorkbookEntry[];
}

function parseStoredState(raw: string | null): StoredState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredState;
    if (!parsed.activeWorkbookId || !Array.isArray(parsed.workbooks) || parsed.workbooks.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export interface UseTrainingWorkbooksResult {
  workbooks: WorkbookEntry[];
  activeWorkbookId: string;
  activeWorkbook: WorkbookEntry | undefined;
  ready: boolean;
  /** Bumped on reset to force AgenticShell remount. */
  chatSessionVersion: number;
  buildStorageKey: (workbookId: string) => string;
  handleSwitch: (workbookId: string) => void;
  handleNew: () => void;
  handleDelete: () => void;
  handleRename: (name: string) => void;
  handleReplay: () => void;
  handleReset: () => void;
  setWorkbookNotebookId: (workbookId: string, notebookId: string | null) => void;
  renameDialogOpen: boolean;
  setRenameDialogOpen: (open: boolean) => void;
  renameDialogValue: string;
  setRenameDialogValue: (value: string) => void;
  openRenameDialog: () => void;
}

export function useTrainingWorkbooks(projectId: string | undefined): UseTrainingWorkbooksResult {
  const [workbooks, setWorkbooks] = useState<WorkbookEntry[]>([]);
  const [activeWorkbookId, setActiveWorkbookId] = useState(DEFAULT_WORKBOOK_ID);
  const [ready, setReady] = useState(false);
  const hydratedRef = useRef<string | null>(null);
  const skipPersistRef = useRef(false);
  const [chatSessionVersion, setChatSessionVersion] = useState(0);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameDialogValue, setRenameDialogValue] = useState('');

  // ---- Hydrate from localStorage (with one-time migration) ----------------

  useEffect(() => {
    if (!projectId || hydratedRef.current === projectId) return;
    hydratedRef.current = projectId;
    skipPersistRef.current = true;
    setReady(false);

    const stateKey = buildStateKey(projectId);
    let state = parseStoredState(localStorage.getItem(stateKey));

    if (!state) {
      // Check for legacy flat training messages and migrate
      const legacyKey = `training-messages-${projectId}`;
      const legacyMessages = localStorage.getItem(legacyKey);

      const defaultWb: WorkbookEntry = { id: DEFAULT_WORKBOOK_ID, name: 'Workbook 1', notebookId: null };
      state = { activeWorkbookId: DEFAULT_WORKBOOK_ID, workbooks: [defaultWb] };

      if (legacyMessages) {
        // Copy legacy messages to new per-workbook key
        localStorage.setItem(buildMessageKey(DEFAULT_WORKBOOK_ID, projectId), legacyMessages);
        localStorage.removeItem(legacyKey);
      }

      localStorage.setItem(stateKey, JSON.stringify(state));
    }

    const entries: WorkbookEntry[] = state.workbooks.map((wb) => ({
      id: wb.id,
      name: wb.name,
      notebookId: wb.notebookId
    }));

    setWorkbooks(entries);
    setActiveWorkbookId(state.activeWorkbookId);
    setReady(true);
  }, [projectId]);

  // ---- Persist to localStorage on change ----------------------------------

  useEffect(() => {
    if (!ready || !projectId || workbooks.length === 0) return;
    if (skipPersistRef.current) { skipPersistRef.current = false; return; }
    localStorage.setItem(
      buildStateKey(projectId),
      JSON.stringify({
        activeWorkbookId,
        workbooks: workbooks.map((wb) => ({
          id: wb.id,
          name: wb.name,
          notebookId: wb.notebookId
        }))
      })
    );
  }, [activeWorkbookId, projectId, ready, workbooks]);

  // ---- Sync to registry store for sidebar ---------------------------------

  useEffect(() => {
    if (!ready) return;
    useWorkbookRegistryStore.getState().setWorkbooks('training', workbooks);
  }, [ready, workbooks]);

  // ---- CRUD ---------------------------------------------------------------

  const handleSwitch = useCallback((workbookId: string) => {
    setActiveWorkbookId(workbookId);
  }, []);

  const handleNew = useCallback(() => {
    const newWb: WorkbookEntry = {
      id: createWorkbookId(),
      name: nextWorkbookName(workbooks),
      notebookId: null
    };
    setWorkbooks((prev) => [...prev, newWb]);
    setActiveWorkbookId(newWb.id);
  }, [workbooks]);

  const handleDelete = useCallback(() => {
    if (workbooks.length <= 1) return;
    const current = workbooks.find((wb) => wb.id === activeWorkbookId);
    if (!current) return;
    const idx = workbooks.indexOf(current);
    const fallback = workbooks[idx - 1] ?? workbooks[idx + 1];
    if (!fallback) return;

    if (projectId) {
      localStorage.removeItem(buildMessageKey(current.id, projectId));
      // Delete the bound training notebook so it can't be orphaned and later
      // adopted by another workbook through the metadata-match path in
      // useTrainingNotebookSync. Fire-and-forget; UI has already moved on.
      if (current.notebookId) {
        void deleteNotebook(projectId, current.notebookId).catch((error) => {
          console.warn('[useTrainingWorkbooks] Failed to delete bound notebook', {
            notebookId: current.notebookId,
            error
          });
        });
      }
    }
    setWorkbooks((prev) => prev.filter((wb) => wb.id !== current.id));
    setActiveWorkbookId(fallback.id);
  }, [activeWorkbookId, projectId, workbooks]);

  // Idempotent: short-circuits when the value is unchanged to prevent the
  // effect-setter-effect render loop that useTrainingNotebookSync would
  // otherwise trigger when it re-derives notebookId every run.
  const setWorkbookNotebookId = useCallback(
    (workbookId: string, notebookId: string | null) => {
      setWorkbooks((prev) => {
        const target = prev.find((wb) => wb.id === workbookId);
        if (!target || target.notebookId === notebookId) {
          return prev;
        }
        return prev.map((wb) =>
          wb.id === workbookId ? { ...wb, notebookId } : wb
        );
      });
    },
    []
  );

  const activeWorkbook = useMemo(
    () => workbooks.find((wb) => wb.id === activeWorkbookId) ?? workbooks[0],
    [activeWorkbookId, workbooks]
  );

  const buildStorageKey = useCallback(
    (workbookId: string) => projectId ? buildMessageKey(workbookId, projectId) : `training-messages-v1-${workbookId}`,
    [projectId]
  );

  // ---- Rename ---------------------------------------------------------------

  const openRenameDialog = useCallback(() => {
    const current = workbooks.find((wb) => wb.id === activeWorkbookId);
    if (!current) return;
    setRenameDialogValue(current.name);
    setRenameDialogOpen(true);
  }, [activeWorkbookId, workbooks]);

  const handleRename = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setWorkbooks((prev) => prev.map((wb) =>
      wb.id === activeWorkbookId ? { ...wb, name: trimmed } : wb
    ));
    setRenameDialogOpen(false);
  }, [activeWorkbookId]);

  // ---- Replay (re-send the last user message) --------------------------------

  const handleReplay = useCallback(() => {
    if (!projectId) return;
    const baseKey = buildMessageKey(activeWorkbookId, projectId);
    // useMessageAccumulator stores at `${storageKey}-${projectId}` where
    // storageKey already contains projectId, so the key has it twice.
    const actualKey = `${baseKey}-${projectId}`;
    const raw = localStorage.getItem(actualKey) ?? localStorage.getItem(baseKey);
    if (!raw) return;
    const usedKey = localStorage.getItem(actualKey) ? actualKey : baseKey;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const messages = Array.isArray(parsed)
        ? parsed
        : (parsed?.version === 2 && Array.isArray(parsed.messages))
          ? (parsed.messages as Array<Record<string, unknown>>)
          : [];
      let lastUserIdx = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if ((messages[i] as Record<string, unknown>).type === 'user') { lastUserIdx = i; break; }
      }
      if (lastUserIdx >= 0) {
        const truncated = messages.slice(0, lastUserIdx + 1);
        // Write back in the same format (V2 if it was V2)
        if (!Array.isArray(parsed) && parsed?.version === 2) {
          localStorage.setItem(usedKey, JSON.stringify({ ...parsed, messages: truncated }));
        } else {
          localStorage.setItem(usedKey, JSON.stringify(truncated));
        }
      }
    } catch { /* ignore parse errors */ }
    setChatSessionVersion((v) => v + 1);
  }, [activeWorkbookId, projectId]);

  // ---- Reset (clear chat + notebook + workflow session for the active workbook) --

  const handleReset = useCallback(() => {
    if (!projectId) return;
    // 1. Clear persisted chat messages. useMessageAccumulator stores under
    //    `${storageKey}-${projectId}` where storageKey is already
    //    `training-messages-v1-${workbookId}-${projectId}`. So the actual
    //    localStorage key has projectId appended twice.
    const storageKey = buildMessageKey(activeWorkbookId, projectId);
    localStorage.removeItem(storageKey);
    localStorage.removeItem(`${storageKey}-${projectId}`);
    // 2. Unbind the notebook so useTrainingNotebookSync creates a fresh one
    //    on the next render (same pattern as FE's handleReset which deletes
    //    the old notebook and creates a new one).
    const current = workbooks.find((wb) => wb.id === activeWorkbookId);
    if (current?.notebookId) {
      void deleteNotebook(projectId, current.notebookId).catch(() => undefined);
      setWorkbooks((prev) =>
        prev.map((wb) =>
          wb.id === activeWorkbookId ? { ...wb, notebookId: null } : wb
        )
      );
    }
    // 3. Bump session version to force AgenticShell remount → picks up
    //    the empty localStorage + fresh notebook binding.
    setChatSessionVersion((v) => v + 1);
  }, [activeWorkbookId, projectId, workbooks]);

  return {
    workbooks,
    activeWorkbookId,
    activeWorkbook,
    ready,
    chatSessionVersion,
    buildStorageKey,
    handleSwitch,
    handleNew,
    handleDelete,
    handleRename,
    handleReplay,
    handleReset,
    setWorkbookNotebookId,
    renameDialogOpen,
    setRenameDialogOpen,
    renameDialogValue,
    setRenameDialogValue,
    openRenameDialog
  };
}
