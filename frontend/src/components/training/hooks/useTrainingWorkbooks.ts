/**
 * useTrainingWorkbooks — manages workbook lifecycle for the Training phase.
 *
 * Provides workbook CRUD, localStorage persistence, and registry store sync.
 * Training previously had a flat storageKey="training-messages" — this hook
 * migrates that to per-workbook keys on first load.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { archivePhaseNotebook } from '@/lib/notebook/archivePhaseNotebook';
import { interruptWorkflowRun } from '@/lib/api/llm';
import { nextWorkbookName, createWorkbookId } from '@/components/preprocessing/preprocessingTabUtils';
import { useWorkbookRegistryStore } from '@/stores/workbookRegistryStore';
import { buildWorkflowSessionKey, useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import type { WorkbookEntry } from '@/types/workbook';

import {
  DEFAULT_TRAINING_WORKBOOK_ID,
  buildTrainingWorkbookMessageKey,
  buildTrainingWorkbooksStateKey,
  readStoredTrainingWorkbooksState
} from '../trainingWorkbookPersistence';

interface UseTrainingWorkbooksOptions {
  requestedWorkbookId?: string;
  syncWorkbookParam?: (workbookId: string, replace?: boolean) => void;
}

export interface UseTrainingWorkbooksResult {
  workbooks: WorkbookEntry[];
  activeWorkbookId: string;
  activeWorkbook: WorkbookEntry | undefined;
  ready: boolean;
  /** Bumped on reset so the active chat session rehydrates cleanly. */
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

export function useTrainingWorkbooks(
  projectId: string | undefined,
  options: UseTrainingWorkbooksOptions = {}
): UseTrainingWorkbooksResult {
  const { requestedWorkbookId, syncWorkbookParam } = options;
  const initialStateRef = useRef(
    readStoredTrainingWorkbooksState(projectId, requestedWorkbookId)
  );
  const [workbooks, setWorkbooks] = useState<WorkbookEntry[]>(
    () => initialStateRef.current?.workbooks ?? []
  );
  const [activeWorkbookId, setActiveWorkbookId] = useState(
    () => initialStateRef.current?.activeWorkbookId ?? DEFAULT_TRAINING_WORKBOOK_ID
  );
  const [ready, setReady] = useState(() => Boolean(initialStateRef.current));
  const hydratedRef = useRef<string | null>(projectId ?? null);
  const skipPersistRef = useRef(false);
  const [chatSessionVersion, setChatSessionVersion] = useState(0);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameDialogValue, setRenameDialogValue] = useState('');

  const syncRequestedWorkbookParam = useCallback((workbookId: string, replace = true) => {
    syncWorkbookParam?.(workbookId, replace);
  }, [syncWorkbookParam]);

  const interruptWorkbookWorkflow = useCallback(async (
    workbookId: string,
    reason: string
  ) => {
    if (!projectId) return;
    const storageKey = buildTrainingWorkbookMessageKey(workbookId, projectId);
    const sessionKey = buildWorkflowSessionKey(projectId, storageKey);
    const session = useWorkflowSessionStore.getState().getSession(sessionKey);
    if (!session?.runId || !session.state) {
      useWorkflowSessionStore.getState().clearSession(sessionKey);
      return;
    }

    if (session.state.status !== 'running' && session.state.status !== 'paused') {
      useWorkflowSessionStore.getState().clearSession(sessionKey);
      return;
    }

    try {
      await interruptWorkflowRun(session.runId, reason);
    } catch (error) {
      console.warn('[useTrainingWorkbooks] Failed to interrupt workbook workflow', {
        workbookId,
        runId: session.runId,
        error
      });
    } finally {
      useWorkflowSessionStore.getState().clearSession(sessionKey);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId || hydratedRef.current === projectId) return;
    hydratedRef.current = projectId;
    initialStateRef.current = null;
    skipPersistRef.current = true;
    setReady(false);

    const state = readStoredTrainingWorkbooksState(projectId, requestedWorkbookId);
    const entries: WorkbookEntry[] = (state?.workbooks ?? []).map((workbook) => ({
      id: workbook.id,
      name: workbook.name,
      notebookId: workbook.notebookId
    }));

    setWorkbooks(entries);
    setActiveWorkbookId(state?.activeWorkbookId ?? DEFAULT_TRAINING_WORKBOOK_ID);
    setReady(true);
  }, [projectId, requestedWorkbookId]);

  useEffect(() => {
    if (!ready || !projectId || workbooks.length === 0) return;
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }

    localStorage.setItem(
      buildTrainingWorkbooksStateKey(projectId),
      JSON.stringify({
        activeWorkbookId,
        workbooks: workbooks.map((workbook) => ({
          id: workbook.id,
          name: workbook.name,
          notebookId: workbook.notebookId
        }))
      })
    );
  }, [activeWorkbookId, projectId, ready, workbooks]);

  useEffect(() => {
    if (!ready) return;
    useWorkbookRegistryStore.getState().setWorkbooks('training', workbooks);
  }, [ready, workbooks]);

  useEffect(() => {
    if (!ready) return;
    useWorkbookRegistryStore.getState().setActiveWorkbookId('training', activeWorkbookId);
  }, [activeWorkbookId, ready]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (requestedWorkbookId && requestedWorkbookId !== activeWorkbookId) {
      const requestedWorkbook = workbooks.find((workbook) => workbook.id === requestedWorkbookId);
      if (requestedWorkbook) {
        setActiveWorkbookId(requestedWorkbook.id);
        return;
      }
    }

    if (activeWorkbookId) {
      syncRequestedWorkbookParam(activeWorkbookId, true);
    }
  }, [activeWorkbookId, ready, requestedWorkbookId, syncRequestedWorkbookParam, workbooks]);

  const handleSwitch = useCallback((workbookId: string) => {
    setActiveWorkbookId(workbookId);
    syncRequestedWorkbookParam(workbookId, false);
  }, [syncRequestedWorkbookParam]);

  const handleNew = useCallback(() => {
    const newWorkbook: WorkbookEntry = {
      id: createWorkbookId(),
      name: nextWorkbookName(workbooks),
      notebookId: null
    };
    setWorkbooks((prev) => [...prev, newWorkbook]);
    setActiveWorkbookId(newWorkbook.id);
    syncRequestedWorkbookParam(newWorkbook.id, false);
    toast.success(`${newWorkbook.name} created`);
  }, [syncRequestedWorkbookParam, workbooks]);

  const handleDelete = useCallback(() => {
    if (workbooks.length <= 1) {
      toast.error('Cannot delete the last workbook');
      return;
    }
    const current = workbooks.find((workbook) => workbook.id === activeWorkbookId);
    if (!current) return;
    const idx = workbooks.indexOf(current);
    const fallback = workbooks[idx - 1] ?? workbooks[idx + 1];
    if (!fallback) return;

    void (async () => {
      if (projectId) {
        await interruptWorkbookWorkflow(current.id, 'Training workbook deleted by user.');
        localStorage.removeItem(buildTrainingWorkbookMessageKey(current.id, projectId));
        if (current.notebookId) {
          await archivePhaseNotebook({
            projectId,
            notebookId: current.notebookId,
            phase: 'training',
            tabId: current.id,
            tabName: current.name
          }).catch((error) => {
            console.warn('[useTrainingWorkbooks] Failed to delete bound notebook', {
              notebookId: current.notebookId,
              error
            });
          });
        }
      }
      setWorkbooks((prev) => prev.filter((workbook) => workbook.id !== current.id));
      setActiveWorkbookId(fallback.id);
      syncRequestedWorkbookParam(fallback.id, true);
      toast.success(`${current.name} deleted`);
    })();
  }, [activeWorkbookId, interruptWorkbookWorkflow, projectId, syncRequestedWorkbookParam, workbooks]);

  const setWorkbookNotebookId = useCallback(
    (workbookId: string, notebookId: string | null) => {
      setWorkbooks((prev) => {
        const target = prev.find((workbook) => workbook.id === workbookId);
        if (!target || target.notebookId === notebookId) {
          return prev;
        }
        return prev.map((workbook) =>
          workbook.id === workbookId ? { ...workbook, notebookId } : workbook
        );
      });
    },
    []
  );

  const activeWorkbook = useMemo(
    () => workbooks.find((workbook) => workbook.id === activeWorkbookId) ?? workbooks[0],
    [activeWorkbookId, workbooks]
  );

  const buildStorageKey = useCallback(
    (workbookId: string) => projectId
      ? buildTrainingWorkbookMessageKey(workbookId, projectId)
      : `training-messages-v1-${workbookId}`,
    [projectId]
  );

  const openRenameDialog = useCallback(() => {
    const current = workbooks.find((workbook) => workbook.id === activeWorkbookId);
    if (!current) return;
    setRenameDialogValue(current.name);
    setRenameDialogOpen(true);
  }, [activeWorkbookId, workbooks]);

  const handleRename = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setWorkbooks((prev) => prev.map((workbook) =>
      workbook.id === activeWorkbookId ? { ...workbook, name: trimmed } : workbook
    ));
    setRenameDialogOpen(false);
  }, [activeWorkbookId]);

  const handleReplay = useCallback(() => {
    if (!projectId) return;
    const baseKey = buildTrainingWorkbookMessageKey(activeWorkbookId, projectId);
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
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        if ((messages[index] as Record<string, unknown>).type === 'user') {
          lastUserIdx = index;
          break;
        }
      }
      if (lastUserIdx >= 0) {
        const truncated = messages.slice(0, lastUserIdx + 1);
        if (!Array.isArray(parsed) && parsed?.version === 2) {
          localStorage.setItem(usedKey, JSON.stringify({ ...parsed, messages: truncated }));
        } else {
          localStorage.setItem(usedKey, JSON.stringify(truncated));
        }
      }
    } catch {
      // ignore parse errors
    }
    setChatSessionVersion((value) => value + 1);
  }, [activeWorkbookId, projectId]);

  const handleReset = useCallback(() => {
    if (!projectId) return;
    void (async () => {
      let resetWarning: string | null = null;
      await interruptWorkbookWorkflow(activeWorkbookId, 'Training workbook reset by user.');

      const storageKey = buildTrainingWorkbookMessageKey(activeWorkbookId, projectId);
      localStorage.removeItem(storageKey);
      localStorage.removeItem(`${storageKey}-${projectId}`);

      const current = workbooks.find((workbook) => workbook.id === activeWorkbookId);
      if (current?.notebookId) {
        await archivePhaseNotebook({
          projectId,
          notebookId: current.notebookId,
          phase: 'training',
          tabId: current.id,
          tabName: current.name
        }).catch((error) => {
          resetWarning = error instanceof Error ? error.message : 'Failed to rotate the workbook notebook.';
        });
        setWorkbooks((prev) =>
          prev.map((workbook) =>
            workbook.id === activeWorkbookId ? { ...workbook, notebookId: null } : workbook
          )
        );
      }

      setChatSessionVersion((value) => value + 1);
      toast.success(
        `${current?.name ?? 'Workbook'} reset`,
        resetWarning ? { description: resetWarning } : undefined
      );
    })();
  }, [activeWorkbookId, interruptWorkbookWorkflow, projectId, workbooks]);

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
