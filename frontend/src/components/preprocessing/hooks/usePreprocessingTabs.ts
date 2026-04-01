import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useNotebookStore } from '@/stores/notebookStore';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import type { PreprocessingWorkbook, PreprocessingTabSnapshot } from '../preprocessingTabUtils';
import { useWorkbookRegistryStore } from '@/stores/workbookRegistryStore';
import { setTabNotebookBinding } from './tabStateTransforms';
import { useTabCrud } from './useTabCrud';
import { useTabPersistence } from './useTabPersistence';
import { useTabNotebookSync } from './useTabNotebookSync';
import { useTabSnapshotSync } from './useTabSnapshotSync';

export type { PreprocessingWorkbook, PreprocessingTabSnapshot };

interface UsePreprocessingTabsOptions {
  projectId: string | undefined;
  /** Called when a tab switch/reset reveals a snapshot with no dataset selected. */
  onNeedsDatasetSelection: (firstDatasetId: string) => void;
  /** Override the initial active tab (e.g., from URL search params). */
  initialTabId?: string;
  /** Notebook to activate after tab switch (e.g., from URL search params). */
  initialNotebookId?: string;
  /** Current workbook requested by the URL, if any. */
  requestedTabId?: string;
  /** Keep the workbook URL param aligned with the active tab. */
  syncWorkbookParam?: (tabId: string, replace?: boolean) => void;
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
  handleNewTab: () => string | null;
  /** Adopt a workbook created externally (e.g. by the sidebar via workbookRegistryStore). */
  adoptTab: (id: string, name: string) => void;
  handleDeleteTab: () => string | null;
  openRenameTabDialog: () => void;
  handleRenameTab: () => void;
  renameTabDialogOpen: boolean;
  setRenameTabDialogOpen: (open: boolean) => void;
  renameTabName: string;
  setRenameTabName: (name: string) => void;
  resetActiveTab: () => void;
  invalidateActiveTabSession: () => void;
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
  initialNotebookId,
  requestedTabId,
  syncWorkbookParam
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
  const syncedWorkbookIdRef = useRef<string | null>(null);

  // ---- Sync workbooks to registry store for sidebar rendering --------------

  useEffect(() => {
    if (!tabsReady) return;
    useWorkbookRegistryStore.getState().setWorkbooks(
      'preprocessing',
      tabs.map((t) => ({ id: t.id, name: t.name, notebookId: t.notebookId }))
    );
  }, [tabs, tabsReady]);

  // ---- Sync divergence when notebook cells change --------------------------

  useEffect(() => {
    void syncDivergence(notebookCells);
  }, [notebookCells, syncDivergence]);

  // ---- Derived active tab --------------------------------------------------

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0],
    [activeTabId, tabs]
  );

  const syncWorkbookSelection = useCallback((tabId: string, replace = true) => {
    syncedWorkbookIdRef.current = tabId;
    syncWorkbookParam?.(tabId, replace);
  }, [syncWorkbookParam]);

  const { applyTabSnapshot, saveActiveSnapshot } = useTabSnapshotSync({
    activeTabId,
    activeTabIdRef,
    tabsRef,
    setTabs,
    tables,
    selectedDatasetId,
    runId,
    timeline,
    stepBindings,
    replayReport,
    applyTabSnapshotToStore,
    onNeedsDatasetSelection
  });

  // ---- Tab ↔ notebook binding ----------------------------------------------

  const setTabNotebookId = useCallback((tabId: string, notebookId: string | null) => {
    setTabs((previous) => {
      const nextTabs = setTabNotebookBinding(previous, tabId, notebookId);
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

  const activateTab = useCallback((tab: PreprocessingWorkbook) => {
    setActiveTabId(tab.id);
    syncWorkbookSelection(tab.id, true);
    applyTabSnapshot(tab.snapshot);
    void ensureNotebookForTab(tab);
  }, [applyTabSnapshot, ensureNotebookForTab, setActiveTabId, syncWorkbookSelection]);

  // ---- Tab CRUD ------------------------------------------------------------

  const handleTabSwitch = useCallback((value: string) => {
    const currentActiveTab = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    if (!currentActiveTab) return;
    const targetTab = tabsRef.current.find((tab) => tab.id === value);
    if (!targetTab || targetTab.id === currentActiveTab.id) return;
    saveActiveSnapshot();
    activateTab(targetTab);
  }, [activeTabIdRef, activateTab, saveActiveSnapshot, tabsRef]);

  const {
    handleNewTab,
    adoptTab,
    handleDeleteTab,
    openRenameTabDialog,
    handleRenameTab,
    renameTabDialogOpen,
    setRenameTabDialogOpen,
    renameTabName,
    setRenameTabName,
    resetActiveTab,
    invalidateActiveTabSession
  } = useTabCrud({
    projectId,
    tabsRef,
    activeTabIdRef,
    setTabs,
    tables,
    renameNotebook,
    updateNotebookMetadata,
    deleteNotebook,
    buildScopedTabStorageKey,
    buildTabStorageKey,
    handleTabSwitch,
    activateTab,
    saveActiveSnapshot,
    applyTabSnapshot,
    ensureNotebookForTab,
    onNeedsDatasetSelection
  });

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

  useEffect(() => {
    if (!tabsReady || !activeTab?.id) {
      return;
    }

    if (!requestedTabId) {
      syncWorkbookSelection(activeTab.id, true);
      return;
    }

    if (requestedTabId === activeTab.id) {
      if (syncedWorkbookIdRef.current === requestedTabId) {
        syncedWorkbookIdRef.current = null;
      }
      return;
    }

    if (syncedWorkbookIdRef.current === activeTab.id) {
      syncWorkbookSelection(activeTab.id, true);
      return;
    }

    if (tabs.some((tab) => tab.id === requestedTabId)) {
      handleTabSwitch(requestedTabId);
      return;
    }

    const registry = useWorkbookRegistryStore.getState().preprocessing;
    const entry = registry.find((workbook) => workbook.id === requestedTabId);
    if (entry) {
      adoptTab(requestedTabId, entry.name);
      return;
    }

    syncWorkbookSelection(activeTab.id, true);
  }, [activeTab?.id, adoptTab, handleTabSwitch, requestedTabId, syncWorkbookSelection, tabs, tabsReady]);

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
    adoptTab,
    handleDeleteTab,
    openRenameTabDialog,
    handleRenameTab,
    renameTabDialogOpen,
    setRenameTabDialogOpen,
    renameTabName,
    setRenameTabName,
    resetActiveTab,
    invalidateActiveTabSession,
    setTabNotebookId,
    ensureNotebookForTab,
    reconcileTabNotebookMappings,
    saveActiveSnapshot,
    applyTabSnapshot
  };
}
