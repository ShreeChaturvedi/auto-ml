import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useNotebookStore } from '@/stores/notebookStore';
import type { PreprocessingTab } from '../preprocessingTabUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseTabNotebookSyncOptions {
  projectId: string | undefined;
  tabsReady: boolean;
  tabsRef: React.MutableRefObject<PreprocessingTab[]>;
  activeTabIdRef: React.MutableRefObject<string>;
  tabs: PreprocessingTab[];
  activeTab: PreprocessingTab | undefined;
  setTabNotebookId: (tabId: string, notebookId: string | null) => void;
}

export interface UseTabNotebookSyncResult {
  ensureNotebookForTab: (
    tab: PreprocessingTab,
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

  const notebookEnsureLocksRef = useRef(new Map<string, Promise<string | null>>());
  const notebookReconcileLockRef = useRef<Promise<void> | null>(null);

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
        const adopted = unassignedNotebooks.shift();
        if (adopted) {
          assignedNotebookId = adopted.notebookId;
          if (adopted.name !== tab.name) {
            await renameNotebook(adopted.notebookId, tab.name);
          }
        } else {
          const created = await createNotebook(tab.name);
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

      // 3) Delete orphan notebooks (not referenced by any existing processing tab).
      await loadNotebooksInStore();
      notebooks = useNotebookStore.getState().notebooks;
      const finalMappedNotebookIds = new Set(
        tabsRef.current
          .map((tab) => tab.notebookId)
          .filter((value): value is string => Boolean(value))
      );
      for (const notebook of notebooks) {
        if (finalMappedNotebookIds.has(notebook.notebookId)) {
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
    tabsReady
  ]);

  // ---- ensureNotebookForTab ------------------------------------------------

  const ensureNotebookForTab = useCallback(async (
    tab: PreprocessingTab,
    options?: { forceCreate?: boolean }
  ): Promise<string | null> => {
    const forceCreate = options?.forceCreate === true;
    const currentTab = tabsRef.current.find((entry) => entry.id === tab.id) ?? tab;

    const existingLock = notebookEnsureLocksRef.current.get(currentTab.id);
    if (existingLock) {
      return existingLock;
    }

    const ensurePromise = (async () => {
      const tabState = tabsRef.current.find((entry) => entry.id === currentTab.id) ?? currentTab;

      if (!forceCreate && tabState.notebookId) {
        const existingNotebookId = tabState.notebookId;
        let hasNotebook = useNotebookStore.getState().notebooks.some((entry) => entry.notebookId === existingNotebookId);
        if (!hasNotebook) {
          await loadNotebooksInStore();
          hasNotebook = useNotebookStore.getState().notebooks.some((entry) => entry.notebookId === existingNotebookId);
        }
        if (hasNotebook) {
          await setActiveNotebook(existingNotebookId);
          if (useNotebookStore.getState().activeNotebookId === existingNotebookId) {
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

          if (
            tabsWithoutNotebook.length === 1
            && tabsWithoutNotebook[0].id === latestTabState.id
            && unassignedNotebooks.length === 1
          ) {
            const adopted = unassignedNotebooks[0];
            setTabNotebookId(latestTabState.id, adopted.notebookId);
            await setActiveNotebook(adopted.notebookId);
            if (adopted.name !== latestTabState.name) {
              await renameNotebook(adopted.notebookId, latestTabState.name);
            }
            return adopted.notebookId;
          }
        }
      }

      const created = await createNotebook((tabsRef.current.find((entry) => entry.id === currentTab.id) ?? currentTab).name);
      const createdNotebookId = created?.notebookId ?? null;
      if (createdNotebookId) {
        setTabNotebookId(currentTab.id, createdNotebookId);
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
    setActiveNotebook,
    setTabNotebookId,
    tabsRef
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
