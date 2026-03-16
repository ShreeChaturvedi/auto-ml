import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useNotebookStore } from '@/stores/notebookStore';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import {
  createEmptyTabSnapshot,
  createWorkbookId,
  nextWorkbookName
} from '../preprocessingTabUtils';
import type { PreprocessingWorkbook, PreprocessingTabSnapshot } from '../preprocessingTabUtils';
import { useWorkbookRegistryStore } from '@/stores/workbookRegistryStore';
import { useTabPersistence } from './useTabPersistence';
import { useTabNotebookSync } from './useTabNotebookSync';

export type { PreprocessingWorkbook, PreprocessingTabSnapshot };

interface UsePreprocessingTabsOptions {
  projectId: string | undefined;
  /** Called when a tab switch/reset reveals a snapshot with no dataset selected. */
  onNeedsDatasetSelection: (firstDatasetId: string) => void;
  /** Override the initial active tab (e.g., from URL search params). */
  initialTabId?: string;
  /** Notebook to activate after tab switch (e.g., from URL search params). */
  initialNotebookId?: string;
}

export interface UsePreprocessingTabsResult {
  tabs: PreprocessingWorkbook[];
  activeTabId: string;
  activeTab: PreprocessingWorkbook | undefined;
  tabsReady: boolean;
  tabsRef: React.MutableRefObject<PreprocessingWorkbook[]>;
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
  ensureNotebookForTab: (tab: PreprocessingWorkbook, options?: { forceCreate?: boolean }) => Promise<string | null>;
  reconcileTabNotebookMappings: () => Promise<void>;
  saveActiveSnapshot: () => void;
  applyTabSnapshot: (snapshot: PreprocessingTabSnapshot) => void;
}

export function usePreprocessingTabs({
  projectId,
  onNeedsDatasetSelection,
  initialTabId,
  initialNotebookId
}: UsePreprocessingTabsOptions): UsePreprocessingTabsResult {
  const notebookCells = useNotebookStore((state) => state.cells);
  const deleteNotebook = useNotebookStore((state) => state.deleteNotebook);

  const tables = usePreprocessingStore((state) => state.tables);
  const selectedDatasetId = usePreprocessingStore((state) => state.selectedDatasetId);
  const runId = usePreprocessingStore((state) => state.runId);
  const timeline = usePreprocessingStore((state) => state.timeline);
  const stepBindings = usePreprocessingStore((state) => state.stepBindings);
  const replayReport = usePreprocessingStore((state) => state.replayReport);
  const applyTabSnapshotToStore = usePreprocessingStore((state) => state.applyTabSnapshot);
  const syncDivergence = usePreprocessingStore((state) => state.syncDivergence);
  const renameNotebook = useNotebookStore((state) => state.renameNotebook);
  const updateNotebookMetadata = useNotebookStore((state) => state.updateNotebookMetadata);
  const notebookProjectId = useNotebookStore((state) => state.currentProjectId);
  const notebooks = useNotebookStore((state) => state.notebooks);

  // ---- Persistence (localStorage, hydration, refs) -------------------------

  const {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    tabsReady,
    tabsRef,
    activeTabIdRef,
    buildTabStorageKey,
    buildScopedTabStorageKey
  } = useTabPersistence({ projectId });

  const initialAppliedRef = useRef(false);

  // ---- Rename dialog state -------------------------------------------------

  const [renameTabDialogOpen, setRenameTabDialogOpen] = useState(false);
  const [renameTabName, setRenameTabName] = useState('');

  // ---- Sync workbooks to registry store for sidebar rendering --------------

  useEffect(() => {
    if (!tabsReady) return;
    useWorkbookRegistryStore.getState().setWorkbooks(
      'preprocessing',
      tabs.map((t) => ({ id: t.id, name: t.name, notebookId: t.notebookId }))
    );
    return () => {
      useWorkbookRegistryStore.getState().setWorkbooks('preprocessing', []);
    };
  }, [tabs, tabsReady]);

  // ---- Sync divergence when notebook cells change --------------------------

  useEffect(() => {
    void syncDivergence(notebookCells);
  }, [notebookCells, syncDivergence]);

  // ---- Keep active tab snapshot in sync with preprocessing store state -----

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
  }, [activeTabId, replayReport, runId, selectedDatasetId, setTabs, stepBindings, tabsRef, timeline]);

  // ---- Derived active tab --------------------------------------------------

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0],
    [activeTabId, tabs]
  );

  // ---- Snapshot helpers ----------------------------------------------------

  const applyTabSnapshot = useCallback((snapshot: PreprocessingTabSnapshot) => {
    applyTabSnapshotToStore(snapshot);
    if (!snapshot.selectedDatasetId && tables.length > 0) {
      onNeedsDatasetSelection(tables[0].datasetId);
    }
  }, [applyTabSnapshotToStore, onNeedsDatasetSelection, tables]);

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
  }, [activeTabIdRef, replayReport, runId, selectedDatasetId, setTabs, stepBindings, tabsRef, timeline]);

  // ---- Tab ↔ notebook binding ----------------------------------------------

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
  }, [setTabs, tabsRef]);

  // ---- Notebook sync (reconciliation + ensure) -----------------------------

  const { ensureNotebookForTab, reconcileTabNotebookMappings } = useTabNotebookSync({
    projectId,
    tabsReady,
    tabsRef,
    activeTabIdRef,
    tabs,
    activeTab,
    setTabNotebookId
  });

  // ---- Tab CRUD ------------------------------------------------------------

  const handleTabSwitch = useCallback((value: string) => {
    const currentActiveTab = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    if (!currentActiveTab) return;
    const targetTab = tabsRef.current.find((tab) => tab.id === value);
    if (!targetTab || targetTab.id === currentActiveTab.id) return;
    saveActiveSnapshot();
    setActiveTabId(targetTab.id);
    applyTabSnapshot(targetTab.snapshot);
    void ensureNotebookForTab(targetTab);
  }, [activeTabIdRef, applyTabSnapshot, ensureNotebookForTab, saveActiveSnapshot, setActiveTabId, tabsRef]);

  // ---- Apply initial tab/notebook from URL search params ------------------

  useEffect(() => {
    if (!tabsReady || initialAppliedRef.current) return;
    if (!initialTabId && !initialNotebookId) return;

    if (initialTabId) {
      const targetTab = tabs.find((tab) => tab.id === initialTabId);
      if (targetTab && targetTab.id !== activeTabId) {
        handleTabSwitch(targetTab.id);
      }
    }

    if (initialNotebookId) {
      if (notebookProjectId !== projectId) return;
      if (!notebooks.some((entry) => entry.notebookId === initialNotebookId)) return;
      void useNotebookStore.getState().setActiveNotebook(initialNotebookId);
    }
    initialAppliedRef.current = true;
  }, [activeTabId, handleTabSwitch, initialNotebookId, initialTabId, notebookProjectId, notebooks, projectId, tabs, tabsReady]);

  const handleNewTab = useCallback(() => {
    const currentActiveTab = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    if (!currentActiveTab) return;
    const newTab: PreprocessingWorkbook = {
      id: createWorkbookId(),
      name: nextWorkbookName(tabsRef.current),
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
  }, [activeTabIdRef, applyTabSnapshot, ensureNotebookForTab, saveActiveSnapshot, setActiveTabId, setTabs, tabsRef]);

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
  }, [activeTabIdRef, applyTabSnapshot, buildScopedTabStorageKey, deleteNotebook, ensureNotebookForTab, projectId, setActiveTabId, setTabs, tabsRef]);

  // ---- Rename tab ----------------------------------------------------------

  const openRenameTabDialog = useCallback(() => {
    const currentActiveTab = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    if (!currentActiveTab) return;
    setRenameTabName(currentActiveTab.name);
    setRenameTabDialogOpen(true);
  }, [activeTabIdRef, tabsRef]);

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
      void updateNotebookMetadata(notebookId, { tabId: currentActiveTab.id, tabName: trimmed });
    }
    setRenameTabDialogOpen(false);
  }, [activeTabIdRef, renameNotebook, renameTabName, setTabs, tabsRef, updateNotebookMetadata]);

  // ---- Reset active tab ----------------------------------------------------

  const resetActiveTab = useCallback(() => {
    const currentActiveTab = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    if (!currentActiveTab) return;
    const oldNotebookId = currentActiveTab.notebookId;

    if (projectId) {
      localStorage.removeItem(buildScopedTabStorageKey(currentActiveTab.id));
    }

    const nextSnapshot = createEmptyTabSnapshot();
    const resetTab: PreprocessingWorkbook = {
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
  }, [activeTabIdRef, applyTabSnapshot, buildScopedTabStorageKey, deleteNotebook, ensureNotebookForTab, onNeedsDatasetSelection, projectId, setTabs, tables, tabsRef]);

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
