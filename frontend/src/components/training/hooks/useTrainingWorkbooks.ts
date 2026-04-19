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
import { interruptWorkflowRun, listWorkflowRuns } from '@/lib/api/llm';
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

  const findWorkbookSessionKeys = useCallback((workbookId: string): string[] => {
    if (!projectId) {
      return [];
    }

    const storageKey = buildTrainingWorkbookMessageKey(workbookId, projectId);
    const baseSessionKey = buildWorkflowSessionKey(projectId, storageKey);
    return Object.keys(useWorkflowSessionStore.getState().sessions).filter((sessionKey) =>
      sessionKey === baseSessionKey || sessionKey.startsWith(`${baseSessionKey}:`)
    );
  }, [projectId]);

  const clearWorkbookSessions = useCallback((workbookId: string) => {
    for (const sessionKey of findWorkbookSessionKeys(workbookId)) {
      useWorkflowSessionStore.getState().clearSession(sessionKey);
    }
  }, [findWorkbookSessionKeys]);

  const interruptWorkbookWorkflow = useCallback(async (
    workbookId: string,
    reason: string,
    notebookId?: string | null
  ) => {
    if (!projectId) return;
    const sessionStore = useWorkflowSessionStore.getState();
    const matchingSessionKeys = findWorkbookSessionKeys(workbookId);
    const interruptedRunIds = new Set<string>();

    for (const sessionKey of matchingSessionKeys) {
      const session = sessionStore.getSession(sessionKey);
      if (!session?.runId || !session.state) {
        sessionStore.clearSession(sessionKey);
        continue;
      }

      if (session.state.status !== 'running' && session.state.status !== 'paused') {
        sessionStore.clearSession(sessionKey);
        continue;
      }

      try {
        await interruptWorkflowRun(session.runId, reason);
        interruptedRunIds.add(session.runId);
      } catch (error) {
        console.warn('[useTrainingWorkbooks] Failed to interrupt workbook workflow', {
          workbookId,
          runId: session.runId,
          error
        });
      } finally {
        sessionStore.clearSession(sessionKey);
      }
    }

    if (notebookId) {
      try {
        const { runs } = await listWorkflowRuns(projectId, 'training');
        const activeRuns = runs.filter((run) =>
          (run.status === 'running' || run.status === 'paused')
          && run.activeNotebookId === notebookId
          && !interruptedRunIds.has(run.runId)
        );
        for (const run of activeRuns) {
          try {
            await interruptWorkflowRun(run.runId, reason);
            interruptedRunIds.add(run.runId);
          } catch (error) {
            console.warn('[useTrainingWorkbooks] Failed to interrupt workbook workflow from backend run list', {
              workbookId,
              notebookId,
              runId: run.runId,
              error
            });
          }
        }
      } catch (error) {
        console.warn('[useTrainingWorkbooks] Failed to list active training workflows for workbook cleanup', {
          workbookId,
          notebookId,
          error
        });
      }
    }

    clearWorkbookSessions(workbookId);
  }, [clearWorkbookSessions, findWorkbookSessionKeys, projectId]);

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

  const deleteWorkbookById = useCallback((workbookId: string) => {
    const currentWorkbooks = workbooks;
    if (currentWorkbooks.length <= 1) {
      toast.error('Cannot delete the last workbook');
      return undefined;
    }
    const current = currentWorkbooks.find((workbook) => workbook.id === workbookId);
    if (!current) return undefined;
    const idx = currentWorkbooks.indexOf(current);
    const fallback = current.id === activeWorkbookId
      ? (currentWorkbooks[idx - 1] ?? currentWorkbooks[idx + 1])
      : (currentWorkbooks.find((workbook) => workbook.id === activeWorkbookId) ?? currentWorkbooks[idx - 1] ?? currentWorkbooks[idx + 1]);
    if (!fallback) return undefined;

    void (async () => {
      if (projectId) {
        await interruptWorkbookWorkflow(current.id, 'Training workbook deleted by user.', current.notebookId);
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
      if (current.id === activeWorkbookId) {
        setActiveWorkbookId(fallback.id);
        syncRequestedWorkbookParam(fallback.id, true);
      }
      toast.success(`${current.name} deleted`);
    })();

    return fallback.id;
  }, [activeWorkbookId, interruptWorkbookWorkflow, projectId, syncRequestedWorkbookParam, workbooks]);

  const handleDelete = useCallback(() => {
    deleteWorkbookById(activeWorkbookId);
  }, [activeWorkbookId, deleteWorkbookById]);

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
      const current = workbooks.find((workbook) => workbook.id === activeWorkbookId);
      if (!current) {
        return;
      }

      await interruptWorkbookWorkflow(activeWorkbookId, 'Training workbook reset by user.', current.notebookId);

      const storageKey = buildTrainingWorkbookMessageKey(activeWorkbookId, projectId);
      localStorage.removeItem(storageKey);
      localStorage.removeItem(`${storageKey}-${projectId}`);

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

  // Sidebar "+" and rename dialog go through the registry. Register the
  // phase-hook versions so sidebar mutations land in React state +
  // localStorage (issues #325 + #326). Previously only delete was wired;
  // the sidebar's direct registry mutations for add/rename were ephemeral
  // and clobbered on the next sync tick.
  const addWorkbookFromRegistry = useCallback((): string | undefined => {
    const newId = createWorkbookId();
    const newWorkbook: WorkbookEntry = {
      id: newId,
      name: nextWorkbookName(workbooks),
      notebookId: null
    };
    setWorkbooks((prev) => [...prev, newWorkbook]);
    setActiveWorkbookId(newId);
    syncRequestedWorkbookParam(newId, false);
    toast.success(`${newWorkbook.name} created`);
    return newId;
  }, [syncRequestedWorkbookParam, workbooks]);

  const renameWorkbookById = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setWorkbooks((prev) => prev.map((w) => (w.id === id ? { ...w, name: trimmed } : w)));
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    const store = useWorkbookRegistryStore.getState();
    store.setDeleteHandler('training', deleteWorkbookById);
    store.setAddHandler('training', addWorkbookFromRegistry);
    store.setRenameHandler('training', renameWorkbookById);
    return () => {
      const s = useWorkbookRegistryStore.getState();
      s.setDeleteHandler('training', null);
      s.setAddHandler('training', null);
      s.setRenameHandler('training', null);
    };
  }, [addWorkbookFromRegistry, deleteWorkbookById, ready, renameWorkbookById]);

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
