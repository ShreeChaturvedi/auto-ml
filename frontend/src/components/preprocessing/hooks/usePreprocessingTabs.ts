import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useNotebookStore } from '@/stores/notebookStore';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import {
  buildProcessingStorageKey,
  buildProcessingTabsStateKey,
  extractRunIdFromStoredMessages,
  parseStoredPreprocessingTabsState
} from '../storagePersistence';
import {
  DEFAULT_TAB_ID,
  createDefaultTab,
  createEmptyTabSnapshot,
  createTabId,
  nextProcessingTabName,
  normalizeProcessingTabNames
} from '../preprocessingTabUtils';
import type { PreprocessingTab, PreprocessingTabSnapshot } from '../preprocessingTabUtils';

export type { PreprocessingTab, PreprocessingTabSnapshot };

interface UsePreprocessingTabsOptions {
  projectId: string | undefined;
  /** Called when a tab switch/reset reveals a snapshot with no dataset selected. */
  onNeedsDatasetSelection: (firstDatasetId: string) => void;
}

export interface UsePreprocessingTabsResult {
  tabs: PreprocessingTab[];
  activeTabId: string;
  activeTab: PreprocessingTab | undefined;
  tabsReady: boolean;
  tabsRef: React.MutableRefObject<PreprocessingTab[]>;
  activeTabIdRef: React.MutableRefObject<string>;
  buildTabStorageKey: (tabId: string) => string;
  buildScopedTabStorageKey: (tabId: string) => string;
  handleTabSwitch: (value: string) => void;
  handleNewTab: () => void;
  handleDeleteTab: () => void;
  openRenameTabDialog: () => void;
  handleRenameTab: () => void;
  renameTabDialogOpen: boolean;
  setRenameTabDialogOpen: (open: boolean) => void;
  renameTabName: string;
  setRenameTabName: (name: string) => void;
  resetActiveTab: () => void;
  setTabNotebookId: (tabId: string, notebookId: string | null) => void;
  ensureNotebookForTab: (tab: PreprocessingTab, options?: { forceCreate?: boolean }) => Promise<string | null>;
  reconcileTabNotebookMappings: () => Promise<void>;
  saveActiveSnapshot: () => void;
  applyTabSnapshot: (snapshot: PreprocessingTabSnapshot) => void;
}

export function usePreprocessingTabs({
  projectId,
  onNeedsDatasetSelection
}: UsePreprocessingTabsOptions): UsePreprocessingTabsResult {
  const notebookCells = useNotebookStore((state) => state.cells);
  const activeNotebookId = useNotebookStore((state) => state.activeNotebookId);
  const notebookProjectId = useNotebookStore((state) => state.currentProjectId);
  const createNotebook = useNotebookStore((state) => state.createNotebook);
  const loadNotebooksInStore = useNotebookStore((state) => state.loadNotebooks);
  const renameNotebook = useNotebookStore((state) => state.renameNotebook);
  const setActiveNotebook = useNotebookStore((state) => state.setActiveNotebook);
  const deleteNotebook = useNotebookStore((state) => state.deleteNotebook);

  const tables = usePreprocessingStore((state) => state.tables);
  const selectedDatasetId = usePreprocessingStore((state) => state.selectedDatasetId);
  const runId = usePreprocessingStore((state) => state.runId);
  const timeline = usePreprocessingStore((state) => state.timeline);
  const stepBindings = usePreprocessingStore((state) => state.stepBindings);
  const replayReport = usePreprocessingStore((state) => state.replayReport);
  const setRunId = usePreprocessingStore((state) => state.setRunId);
  const syncDivergence = usePreprocessingStore((state) => state.syncDivergence);

  const [tabs, setTabs] = useState<PreprocessingTab[]>([createDefaultTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(DEFAULT_TAB_ID);
  const [tabsReady, setTabsReady] = useState(false);
  const [renameTabDialogOpen, setRenameTabDialogOpen] = useState(false);
  const [renameTabName, setRenameTabName] = useState('');

  const tabsRef = useRef<PreprocessingTab[]>([]);
  const activeTabIdRef = useRef<string>(DEFAULT_TAB_ID);
  const hydratedTabsProjectRef = useRef<string | null>(null);
  const suppressStoredRunHydrationRef = useRef(false);
  const notebookEnsureLocksRef = useRef(new Map<string, Promise<string | null>>());
  const notebookReconcileLockRef = useRef<Promise<void> | null>(null);

  const buildTabStorageKey = useCallback((tabId: string): string => (
    buildProcessingStorageKey(tabId)
  ), []);

  const buildScopedTabStorageKey = useCallback((tabId: string): string => (
    projectId
      ? `${buildTabStorageKey(tabId)}-${projectId}`
      : buildTabStorageKey(tabId)
  ), [buildTabStorageKey, projectId]);

  // Restore tabs from localStorage when projectId changes
  useEffect(() => {
    if (!projectId) {
      return;
    }
    if (hydratedTabsProjectRef.current === projectId) {
      return;
    }

    setTabsReady(false);
    hydratedTabsProjectRef.current = projectId;

    const persistedTabsState = parseStoredPreprocessingTabsState(
      localStorage.getItem(buildProcessingTabsStateKey(projectId))
    );

    const recoveredTabs: PreprocessingTab[] = [];
    const knownTabIds = new Set<string>();

    const appendRecoveredTab = (
      id: string,
      name: string,
      storageVersion: number,
      notebookId: string | null
    ) => {
      if (knownTabIds.has(id)) {
        return;
      }
      knownTabIds.add(id);
      const storageKey = buildScopedTabStorageKey(id);
      const inferredRunId = extractRunIdFromStoredMessages(localStorage.getItem(storageKey));
      recoveredTabs.push({
        id,
        name,
        notebookId,
        storageVersion,
        snapshot: {
          ...createEmptyTabSnapshot(),
          runId: inferredRunId
        }
      });
    };

    persistedTabsState?.tabs.forEach((tab) => {
      appendRecoveredTab(tab.id, tab.name, tab.storageVersion, tab.notebookId);
    });

    if (recoveredTabs.length === 0) {
      recoveredTabs.push(createDefaultTab());
    }
    const normalizedRecoveredTabs = normalizeProcessingTabNames(recoveredTabs);

    const persistedActiveTabId = persistedTabsState?.activeTabId ?? normalizedRecoveredTabs[0].id;
    const recoveredActiveTabId = normalizedRecoveredTabs.some((tab) => tab.id === persistedActiveTabId)
      ? persistedActiveTabId
      : normalizedRecoveredTabs[0].id;
    const activeRecoveredTab = normalizedRecoveredTabs.find((tab) => tab.id === recoveredActiveTabId) ?? normalizedRecoveredTabs[0];

    setTabs(normalizedRecoveredTabs);
    tabsRef.current = normalizedRecoveredTabs;
    setActiveTabId(recoveredActiveTabId);
    usePreprocessingStore.setState({
      selectedDatasetId: activeRecoveredTab.snapshot.selectedDatasetId,
      runId: activeRecoveredTab.snapshot.runId,
      timeline: activeRecoveredTab.snapshot.timeline,
      stepBindings: activeRecoveredTab.snapshot.stepBindings,
      replayReport: activeRecoveredTab.snapshot.replayReport,
      error: null
    });
    setTabsReady(true);
  }, [buildScopedTabStorageKey, projectId]);

  // Keep tabsRef in sync
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  // Keep activeTabIdRef in sync
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  // Sync divergence when notebook cells change
  useEffect(() => {
    void syncDivergence(notebookCells);
  }, [notebookCells, syncDivergence]);

  // Ensure activeTabId points to an existing tab
  useEffect(() => {
    if (tabs.length === 0) {
      return;
    }
    if (!tabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
    }
  }, [activeTabId, tabs]);

  // Persist tabs state to localStorage
  useEffect(() => {
    if (!tabsReady || !projectId || tabs.length === 0) {
      return;
    }
    const persistedActiveTabId = tabs.some((tab) => tab.id === activeTabId)
      ? activeTabId
      : tabs[0].id;

    localStorage.setItem(
      buildProcessingTabsStateKey(projectId),
      JSON.stringify({
        activeTabId: persistedActiveTabId,
        tabs: tabs.map((tab) => ({
          id: tab.id,
          name: tab.name,
          storageVersion: tab.storageVersion,
          notebookId: tab.notebookId
        }))
      })
    );
  }, [activeTabId, projectId, tabs, tabsReady]);

  // Keep active tab snapshot in sync with preprocessing store state
  useEffect(() => {
    setTabs((previous) => {
      const nextTabs = previous.map((tab) => {
        if (tab.id !== activeTabId) {
          return tab;
        }
        return {
          ...tab,
          snapshot: {
            selectedDatasetId,
            runId,
            timeline,
            stepBindings,
            replayReport
          }
        };
      });
      tabsRef.current = nextTabs;
      return nextTabs;
    });
  }, [activeTabId, replayReport, runId, selectedDatasetId, stepBindings, timeline]);

  // Restore stored run id when active tab changes
  useEffect(() => {
    if (!projectId) {
      return;
    }
    const activeTab = tabsRef.current.find((tab) => tab.id === activeTabId);
    if (!activeTab) {
      return;
    }
    if (runId) {
      return;
    }
    if (suppressStoredRunHydrationRef.current) {
      return;
    }
    const storageKey = buildScopedTabStorageKey(activeTab.id);
    const inferredRunId = extractRunIdFromStoredMessages(localStorage.getItem(storageKey));
    if (inferredRunId) {
      setRunId(inferredRunId);
    }
  }, [activeTabId, buildScopedTabStorageKey, projectId, runId, setRunId]);

  // Clear suppression flag when a real runId is set
  useEffect(() => {
    if (runId) {
      suppressStoredRunHydrationRef.current = false;
    }
  }, [runId]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0],
    [activeTabId, tabs]
  );

  const applyTabSnapshot = useCallback((snapshot: PreprocessingTabSnapshot) => {
    usePreprocessingStore.setState({
      selectedDatasetId: snapshot.selectedDatasetId,
      runId: snapshot.runId,
      timeline: snapshot.timeline,
      stepBindings: snapshot.stepBindings,
      replayReport: snapshot.replayReport,
      error: null
    });
    if (!snapshot.selectedDatasetId && tables.length > 0) {
      onNeedsDatasetSelection(tables[0].datasetId);
    }
  }, [onNeedsDatasetSelection, tables]);

  const saveActiveSnapshot = useCallback(() => {
    const currentActiveTab = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    if (!currentActiveTab) return;
    setTabs((previous) => {
      const nextTabs = previous.map((tab) => (
        tab.id === currentActiveTab.id
          ? { ...tab, snapshot: { selectedDatasetId, runId, timeline, stepBindings, replayReport } }
          : tab
      ));
      tabsRef.current = nextTabs;
      return nextTabs;
    });
  }, [replayReport, runId, selectedDatasetId, stepBindings, timeline]);

  const setTabNotebookId = useCallback((tabId: string, notebookId: string | null) => {
    tabsRef.current = tabsRef.current.map((tab) => (
      tab.id === tabId
        ? { ...tab, notebookId }
        : tab
    ));
    setTabs((previous) => {
      const nextTabs = previous.map((tab) => (
        tab.id === tabId
          ? { ...tab, notebookId }
          : tab
      ));
      tabsRef.current = nextTabs;
      return nextTabs;
    });
  }, []);

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
        tabsRef.current = nextTabs;
        setTabs(nextTabs);
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
    createNotebook,
    deleteNotebook,
    loadNotebooksInStore,
    projectId,
    renameNotebook,
    setActiveNotebook,
    tabsReady
  ]);

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
    setTabNotebookId
  ]);

  // Trigger notebook reconciliation when tabs change (after project loads)
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

  // Ensure the active tab has a notebook
  useEffect(() => {
    if (!tabsReady || !activeTab) {
      return;
    }
    if (activeTab.notebookId && activeNotebookId === activeTab.notebookId) {
      return;
    }
    void ensureNotebookForTab(activeTab);
  }, [activeNotebookId, activeTab, ensureNotebookForTab, tabsReady]);

  const handleTabSwitch = useCallback((value: string) => {
    const currentActiveTab = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    if (!currentActiveTab) return;
    const targetTab = tabsRef.current.find((tab) => tab.id === value);
    if (!targetTab || targetTab.id === currentActiveTab.id) return;
    saveActiveSnapshot();
    setActiveTabId(targetTab.id);
    applyTabSnapshot(targetTab.snapshot);
    void ensureNotebookForTab(targetTab);
  }, [applyTabSnapshot, ensureNotebookForTab, saveActiveSnapshot]);

  const handleNewTab = useCallback(() => {
    const currentActiveTab = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    if (!currentActiveTab) return;
    const newTab: PreprocessingTab = {
      id: createTabId(),
      name: nextProcessingTabName(tabsRef.current),
      notebookId: null,
      snapshot: createEmptyTabSnapshot(),
      storageVersion: 0
    };
    saveActiveSnapshot();
    setTabs((previous) => {
      const nextTabs = [...previous, newTab];
      tabsRef.current = nextTabs;
      return nextTabs;
    });
    setActiveTabId(newTab.id);
    applyTabSnapshot(newTab.snapshot);
    void ensureNotebookForTab(newTab);
  }, [applyTabSnapshot, ensureNotebookForTab, saveActiveSnapshot]);

  const handleDeleteTab = useCallback(() => {
    const currentTabs = tabsRef.current;
    const currentActiveTab = currentTabs.find((tab) => tab.id === activeTabIdRef.current);
    if (!currentActiveTab || currentTabs.length <= 1) return;
    const targetIndex = currentTabs.findIndex((tab) => tab.id === currentActiveTab.id);
    const fallbackTab = currentTabs[targetIndex - 1] ?? currentTabs[targetIndex + 1];
    if (!fallbackTab) return;
    const notebookIdToDelete = currentActiveTab.notebookId;
    if (projectId) {
      localStorage.removeItem(buildScopedTabStorageKey(currentActiveTab.id));
    }
    setTabs((previous) => {
      const nextTabs = previous.filter((tab) => tab.id !== currentActiveTab.id);
      tabsRef.current = nextTabs;
      return nextTabs;
    });
    setActiveTabId(fallbackTab.id);
    applyTabSnapshot(fallbackTab.snapshot);
    void (async () => {
      const fallbackNotebookId = await ensureNotebookForTab(fallbackTab);
      if (
        notebookIdToDelete
        && notebookIdToDelete !== fallbackNotebookId
      ) {
        await deleteNotebook(notebookIdToDelete);
      }
    })();
  }, [applyTabSnapshot, buildScopedTabStorageKey, deleteNotebook, ensureNotebookForTab, projectId]);

  const openRenameTabDialog = useCallback(() => {
    const currentActiveTab = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    if (!currentActiveTab) return;
    setRenameTabName(currentActiveTab.name);
    setRenameTabDialogOpen(true);
  }, []);

  const handleRenameTab = useCallback(() => {
    const currentActiveTab = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    if (!currentActiveTab) return;
    const trimmed = renameTabName.trim();
    if (!trimmed) return;
    const notebookId = currentActiveTab.notebookId;
    setTabs((previous) => {
      const nextTabs = previous.map((tab) =>
        tab.id === currentActiveTab.id ? { ...tab, name: trimmed } : tab
      );
      tabsRef.current = nextTabs;
      return nextTabs;
    });
    if (notebookId) {
      void renameNotebook(notebookId, trimmed);
    }
    setRenameTabDialogOpen(false);
  }, [renameNotebook, renameTabName]);

  const resetActiveTab = useCallback(() => {
    const currentActiveTab = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    if (!currentActiveTab) return;
    const oldNotebookId = currentActiveTab.notebookId;

    if (projectId) {
      localStorage.removeItem(buildScopedTabStorageKey(currentActiveTab.id));
    }

    const nextSnapshot = createEmptyTabSnapshot();
    const resetTab: PreprocessingTab = {
      ...currentActiveTab,
      notebookId: null,
      snapshot: nextSnapshot
    };
    setTabs((previous) => {
      const nextTabs = previous.map((tab) => (
        tab.id === currentActiveTab.id
          ? {
              ...tab,
              notebookId: null,
              snapshot: nextSnapshot,
              storageVersion: tab.storageVersion + 1
            }
          : tab
      ));
      tabsRef.current = nextTabs;
      return nextTabs;
    });
    applyTabSnapshot(nextSnapshot);
    if (tables.length > 0) {
      onNeedsDatasetSelection(tables[0].datasetId);
    }
    void (async () => {
      const nextNotebookId = await ensureNotebookForTab(resetTab, { forceCreate: true });
      if (
        oldNotebookId
        && oldNotebookId !== nextNotebookId
      ) {
        await deleteNotebook(oldNotebookId);
      }
    })();
  }, [applyTabSnapshot, buildScopedTabStorageKey, deleteNotebook, ensureNotebookForTab, onNeedsDatasetSelection, projectId, tables]);

  return {
    tabs,
    activeTabId,
    activeTab,
    tabsReady,
    tabsRef,
    activeTabIdRef,
    buildTabStorageKey,
    buildScopedTabStorageKey,
    handleTabSwitch,
    handleNewTab,
    handleDeleteTab,
    openRenameTabDialog,
    handleRenameTab,
    renameTabDialogOpen,
    setRenameTabDialogOpen,
    renameTabName,
    setRenameTabName,
    resetActiveTab,
    setTabNotebookId,
    ensureNotebookForTab,
    reconcileTabNotebookMappings,
    saveActiveSnapshot,
    applyTabSnapshot
  };
}
