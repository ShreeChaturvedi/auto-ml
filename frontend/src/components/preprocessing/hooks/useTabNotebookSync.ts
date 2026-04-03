import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useNotebookStore } from '@/stores/notebookStore';
import type { NotebookPhaseMetadata } from '@/types/notebook';
import type { PreprocessingWorkbook } from '../preprocessingTabUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPreprocessingMetadata(tab: PreprocessingWorkbook): NotebookPhaseMetadata {
  return { phase: 'preprocessing', tabId: tab.id, tabName: tab.name };
}

function matchesPreprocessingTabNotebook(
  notebook: { metadata?: unknown },
  tabId: string
): boolean {
  const metadata = notebook.metadata && typeof notebook.metadata === 'object' && !Array.isArray(notebook.metadata)
    ? notebook.metadata as Record<string, unknown>
    : null;
  return metadata?.phase === 'preprocessing' && metadata?.tabId === tabId;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseTabNotebookSyncOptions {
  projectId: string | undefined;
  tabsReady: boolean;
  tabsRef: React.MutableRefObject<PreprocessingWorkbook[]>;
  activeTabIdRef: React.MutableRefObject<string>;
  tabs: PreprocessingWorkbook[];
  activeTab: PreprocessingWorkbook | undefined;
  setTabNotebookId: (tabId: string, notebookId: string | null) => void;
}

export interface UseTabNotebookSyncResult {
  ensureNotebookForTab: (
    tab: PreprocessingWorkbook,
    options?: { forceCreate?: boolean }
  ) => Promise<string | null>;
  reconcileTabNotebookMappings: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTabNotebookSync({
  projectId,
  tabsReady,
  tabsRef,
  activeTabIdRef,
  tabs,
  activeTab,
  setTabNotebookId
}: UseTabNotebookSyncOptions): UseTabNotebookSyncResult {
  const activeNotebookId = useNotebookStore((state) => state.activeNotebookId);
  const notebookProjectId = useNotebookStore((state) => state.currentProjectId);
  const createNotebook = useNotebookStore((state) => state.createNotebook);
  const loadNotebooksInStore = useNotebookStore((state) => state.loadNotebooks);
  const renameNotebook = useNotebookStore((state) => state.renameNotebook);
  const setActiveNotebook = useNotebookStore((state) => state.setActiveNotebook);
  const deleteNotebook = useNotebookStore((state) => state.deleteNotebook);
  const updateNotebookMetadata = useNotebookStore((state) => state.updateNotebookMetadata);

  const notebookEnsureLocksRef = useRef(new Map<string, Promise<string | null>>());
  const notebookReconcileLockRef = useRef<Promise<void> | null>(null);

  const activateNotebookIfTabIsActive = useCallback(async (
    tabId: string,
    notebookId: string
  ): Promise<boolean> => {
    if (activeTabIdRef.current !== tabId) {
      return false;
    }
    await setActiveNotebook(notebookId);
    return useNotebookStore.getState().activeNotebookId === notebookId;
  }, [activeTabIdRef, setActiveNotebook]);

  // ---- reconcileTabNotebookMappings ----------------------------------------

  const reconcileTabNotebookMappings = useCallback(async (): Promise<void> => {
    if (!projectId || !tabsReady) {
      return;
    }
    if (useNotebookStore.getState().currentProjectId !== projectId) {
      return;
    }

    const existingLock = notebookReconcileLockRef.current;
    if (existingLock) {
      await existingLock;
      return;
    }

    const reconcilePromise = (async () => {
      const pendingEnsureLocks = Array.from(notebookEnsureLocksRef.current.values());
      if (pendingEnsureLocks.length > 0) {
        await Promise.allSettled(pendingEnsureLocks);
      }

      await loadNotebooksInStore();
      let notebooks = useNotebookStore.getState().notebooks;
      let notebookIds = new Set(notebooks.map((entry) => entry.notebookId));
      let nextTabs = tabsRef.current.map((tab) => ({ ...tab }));
      let tabsChanged = false;

      // 1) Clear stale notebook bindings that no longer exist.
      nextTabs = nextTabs.map((tab) => {
        if (tab.notebookId && !notebookIds.has(tab.notebookId)) {
          tabsChanged = true;
          return { ...tab, notebookId: null };
        }
        return tab;
      });

      // 2) Ensure every tab has exactly one notebook, reusing unassigned notebooks first.
      const mappedNotebookIds = new Set(
        nextTabs
          .map((tab) => tab.notebookId)
          .filter((value): value is string => Boolean(value))
      );
      const unassignedNotebooks = notebooks.filter((entry) => !mappedNotebookIds.has(entry.notebookId));

      for (const tab of nextTabs) {
        if (tab.notebookId) {
          continue;
        }

        let assignedNotebookId: string | null = null;
        const exactMatchIndex = unassignedNotebooks.findIndex((entry) =>
          matchesPreprocessingTabNotebook(entry, tab.id)
        );
        const adopted = exactMatchIndex >= 0
          ? unassignedNotebooks.splice(exactMatchIndex, 1)[0]
          : unassignedNotebooks.shift();
        if (adopted) {
          assignedNotebookId = adopted.notebookId;
          if (adopted.name !== tab.name) {
            await renameNotebook(adopted.notebookId, tab.name);
          }
          await updateNotebookMetadata(adopted.notebookId, buildPreprocessingMetadata(tab));
        } else {
          const created = await createNotebook(tab.name, buildPreprocessingMetadata(tab));
          assignedNotebookId = created?.notebookId ?? null;
          if (assignedNotebookId) {
            await loadNotebooksInStore();
            notebooks = useNotebookStore.getState().notebooks;
            notebookIds = new Set(notebooks.map((entry) => entry.notebookId));
          }
        }

        if (assignedNotebookId) {
          tab.notebookId = assignedNotebookId;
          mappedNotebookIds.add(assignedNotebookId);
          tabsChanged = true;
        }
      }

      if (tabsChanged) {
        for (const tab of nextTabs) {
          setTabNotebookId(tab.id, tab.notebookId);
        }
      }

      // 2.5) Ensure all mapped notebooks have correct phase metadata.
      //      Refresh from store so we see metadata set during step 2.
      await loadNotebooksInStore();
      notebooks = useNotebookStore.getState().notebooks;
      for (const tab of nextTabs) {
        if (!tab.notebookId) continue;
        const nb = notebooks.find((entry) => entry.notebookId === tab.notebookId);
        const meta = nb?.metadata as Record<string, unknown> | undefined;
        if (nb && (!meta?.phase || meta.tabId !== tab.id)) {
          await updateNotebookMetadata(tab.notebookId, buildPreprocessingMetadata(tab));
        }
      }

      // 3) Delete orphan notebooks (not referenced by any existing processing tab).
      //    Only delete notebooks whose phase is 'preprocessing' or undefined.
      //    Never delete notebooks belonging to other phases (e.g. feature-engineering, training).
      //    Read tabsRef.current (latest) to see the most up-to-date tab-to-notebook
      //    mappings, including any tabs created/deleted during this reconciliation.
      const finalMappedNotebookIds = new Set(
        tabsRef.current
          .map((tab) => tab.notebookId)
          .filter((value): value is string => Boolean(value))
      );
      for (const notebook of notebooks) {
        if (finalMappedNotebookIds.has(notebook.notebookId)) {
          continue;
        }
        const meta = notebook.metadata as Record<string, unknown> | undefined;
        const phase = meta?.phase as string | undefined;
        if (phase && phase !== 'preprocessing') {
          continue;
        }
        await deleteNotebook(notebook.notebookId);
      }

      // 4) Keep active tab and notebook view aligned.
      const latestTabs = tabsRef.current;
      const activeTabEntry = latestTabs.find((tab) => tab.id === activeTabIdRef.current) ?? latestTabs[0];
      if (activeTabEntry?.notebookId) {
        await setActiveNotebook(activeTabEntry.notebookId);
      }
    })();

    notebookReconcileLockRef.current = reconcilePromise;
    try {
      await reconcilePromise;
    } finally {
      notebookReconcileLockRef.current = null;
    }
  }, [
    activeTabIdRef,
    createNotebook,
    deleteNotebook,
    loadNotebooksInStore,
    projectId,
    renameNotebook,
    setActiveNotebook,
    setTabNotebookId,
    tabsRef,
    tabsReady,
    updateNotebookMetadata
  ]);

  // ---- ensureNotebookForTab ------------------------------------------------

  const ensureNotebookForTab = useCallback(async (
    tab: PreprocessingWorkbook,
    options?: { forceCreate?: boolean }
  ): Promise<string | null> => {
    const forceCreate = options?.forceCreate === true;
    const currentTab = tabsRef.current.find((entry) => entry.id === tab.id) ?? tab;

    const existingLock = notebookEnsureLocksRef.current.get(currentTab.id);
    if (existingLock) {
      return existingLock;
    }

    const ensurePromise = (async () => {
      const reconcileLock = notebookReconcileLockRef.current;
      if (reconcileLock) {
        await reconcileLock;
      }

      const tabState = tabsRef.current.find((entry) => entry.id === currentTab.id) ?? currentTab;

      if (!forceCreate && tabState.notebookId) {
        const existingNotebookId = tabState.notebookId;
        let hasNotebook = useNotebookStore.getState().notebooks.some((entry) => entry.notebookId === existingNotebookId);
        if (!hasNotebook) {
          await loadNotebooksInStore();
          hasNotebook = useNotebookStore.getState().notebooks.some((entry) => entry.notebookId === existingNotebookId);
        }
        if (hasNotebook) {
          const activated = await activateNotebookIfTabIsActive(tabState.id, existingNotebookId);
          if (activated || activeTabIdRef.current !== tabState.id) {
            return existingNotebookId;
          }
        }
        setTabNotebookId(tabState.id, null);
      }

      // Fresh project bootstrap path: adopt the backend-default notebook for the only tab.
      if (!forceCreate) {
        const latestTabState = tabsRef.current.find((entry) => entry.id === currentTab.id) ?? tabState;
        if (!latestTabState.notebookId) {
          await loadNotebooksInStore();
          const availableNotebooks = useNotebookStore.getState().notebooks;
          const tabsWithoutNotebook = tabsRef.current.filter((entry) => !entry.notebookId);
          const mappedNotebookIds = new Set(
            tabsRef.current
              .map((entry) => entry.notebookId)
              .filter((value): value is string => Boolean(value))
          );
          const unassignedNotebooks = availableNotebooks.filter(
            (entry) => !mappedNotebookIds.has(entry.notebookId)
          );
          const exactMatch = unassignedNotebooks.find((entry) =>
            matchesPreprocessingTabNotebook(entry, latestTabState.id)
          );

          if (exactMatch) {
            setTabNotebookId(latestTabState.id, exactMatch.notebookId);
            await activateNotebookIfTabIsActive(latestTabState.id, exactMatch.notebookId);
            if (exactMatch.name !== latestTabState.name) {
              await renameNotebook(exactMatch.notebookId, latestTabState.name);
            }
            await updateNotebookMetadata(exactMatch.notebookId, buildPreprocessingMetadata(latestTabState));
            return exactMatch.notebookId;
          }

          if (
            tabsWithoutNotebook.length === 1
            && tabsWithoutNotebook[0].id === latestTabState.id
            && unassignedNotebooks.length === 1
          ) {
            const adopted = unassignedNotebooks[0];
            setTabNotebookId(latestTabState.id, adopted.notebookId);
            await activateNotebookIfTabIsActive(latestTabState.id, adopted.notebookId);
            if (adopted.name !== latestTabState.name) {
              await renameNotebook(adopted.notebookId, latestTabState.name);
            }
            await updateNotebookMetadata(adopted.notebookId, buildPreprocessingMetadata(latestTabState));
            return adopted.notebookId;
          }
        }
      }

      const tabForCreate = tabsRef.current.find((entry) => entry.id === currentTab.id) ?? currentTab;
      const created = await createNotebook(tabForCreate.name, buildPreprocessingMetadata(tabForCreate));
      const createdNotebookId = created?.notebookId ?? null;
      if (createdNotebookId) {
        setTabNotebookId(currentTab.id, createdNotebookId);
        if (activeTabIdRef.current !== currentTab.id) {
          const visibleTab = tabsRef.current.find((entry) => entry.id === activeTabIdRef.current);
          if (visibleTab?.notebookId && visibleTab.notebookId !== createdNotebookId) {
            await setActiveNotebook(visibleTab.notebookId);
          }
        }
      }
      return createdNotebookId;
    })();

    notebookEnsureLocksRef.current.set(currentTab.id, ensurePromise);
    try {
      return await ensurePromise;
    } finally {
      notebookEnsureLocksRef.current.delete(currentTab.id);
    }
  }, [
    createNotebook,
    loadNotebooksInStore,
    renameNotebook,
    activateNotebookIfTabIsActive,
    setActiveNotebook,
    setTabNotebookId,
    activeTabIdRef,
    tabsRef,
    updateNotebookMetadata
  ]);

  // ---- Trigger notebook reconciliation when tabs change --------------------

  const tabIdsSignature = useMemo(
    () => tabs.map((tab) => tab.id).join('|'),
    [tabs]
  );

  useEffect(() => {
    if (!tabsReady || !projectId) {
      return;
    }
    if (notebookProjectId !== projectId) {
      return;
    }
    void reconcileTabNotebookMappings();
  }, [notebookProjectId, projectId, reconcileTabNotebookMappings, tabIdsSignature, tabsReady]);

  // ---- Ensure the active tab has a notebook --------------------------------

  useEffect(() => {
    if (!tabsReady || !activeTab) {
      return;
    }
    if (activeTab.notebookId && activeNotebookId === activeTab.notebookId) {
      return;
    }
    void ensureNotebookForTab(activeTab);
  }, [activeNotebookId, activeTab, ensureNotebookForTab, tabsReady]);

  return {
    ensureNotebookForTab,
    reconcileTabNotebookMappings
  };
}
