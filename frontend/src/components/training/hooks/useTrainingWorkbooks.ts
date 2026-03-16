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
  buildStorageKey: (workbookId: string) => string;
  handleSwitch: (workbookId: string) => void;
  handleNew: () => void;
  handleDelete: () => void;
}

export function useTrainingWorkbooks(projectId: string | undefined): UseTrainingWorkbooksResult {
  const [workbooks, setWorkbooks] = useState<WorkbookEntry[]>([]);
  const [activeWorkbookId, setActiveWorkbookId] = useState(DEFAULT_WORKBOOK_ID);
  const [ready, setReady] = useState(false);
  const hydratedRef = useRef<string | null>(null);
  const skipPersistRef = useRef(false);

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
    return () => {
      useWorkbookRegistryStore.getState().setWorkbooks('training', []);
    };
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
    }
    setWorkbooks((prev) => prev.filter((wb) => wb.id !== current.id));
    setActiveWorkbookId(fallback.id);
  }, [activeWorkbookId, projectId, workbooks]);

  const activeWorkbook = useMemo(
    () => workbooks.find((wb) => wb.id === activeWorkbookId) ?? workbooks[0],
    [activeWorkbookId, workbooks]
  );

  const buildStorageKey = useCallback(
    (workbookId: string) => projectId ? buildMessageKey(workbookId, projectId) : `training-messages-v1-${workbookId}`,
    [projectId]
  );

  return {
    workbooks,
    activeWorkbookId,
    activeWorkbook,
    ready,
    buildStorageKey,
    handleSwitch,
    handleNew,
    handleDelete
  };
}
