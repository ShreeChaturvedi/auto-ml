import { useCallback, useState } from 'react';

import { buildWorkflowSessionKey, useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import type { AvailableTable } from '@/types/preprocessing';
import type { NotebookPhaseMetadata } from '@/types/notebook';
import type { PreprocessingWorkbook } from '../preprocessingTabUtils';
import {
  createAdoptedTab,
  createNewTab,
  invalidateActiveTabSessionState,
  renameTab,
  resetActiveTabState
} from './tabStateTransforms';

interface UseTabCrudOptions {
  projectId: string | undefined;
  tabsRef: React.MutableRefObject<PreprocessingWorkbook[]>;
  activeTabIdRef: React.MutableRefObject<string>;
  setTabs: React.Dispatch<React.SetStateAction<PreprocessingWorkbook[]>>;
  tables: AvailableTable[];
  renameNotebook: (notebookId: string, name: string) => Promise<unknown>;
  updateNotebookMetadata: (notebookId: string, metadata: NotebookPhaseMetadata) => Promise<unknown>;
  deleteNotebook: (notebookId: string) => Promise<unknown>;
  buildScopedTabStorageKey: (tabId: string) => string;
  buildTabStorageKey: (tabId: string) => string;
  handleTabSwitch: (value: string) => void;
  activateTab: (tab: PreprocessingWorkbook) => void;
  saveActiveSnapshot: () => void;
  applyTabSnapshot: (snapshot: PreprocessingWorkbook['snapshot']) => void;
  ensureNotebookForTab: (
    tab: PreprocessingWorkbook,
    options?: { forceCreate?: boolean }
  ) => Promise<string | null>;
  onNeedsDatasetSelection: (firstDatasetId: string) => void;
}

interface UseTabCrudResult {
  handleNewTab: () => string | null;
  adoptTab: (id: string, name: string) => void;
  deleteTabById: (tabId: string) => string | undefined;
  handleDeleteTab: () => string | null;
  openRenameTabDialog: () => void;
  handleRenameTab: () => void;
  renameTabDialogOpen: boolean;
  setRenameTabDialogOpen: (open: boolean) => void;
  renameTabName: string;
  setRenameTabName: (name: string) => void;
  resetActiveTab: () => void;
  invalidateActiveTabSession: () => void;
}

export function useTabCrud({
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
}: UseTabCrudOptions): UseTabCrudResult {
  const [renameTabDialogOpen, setRenameTabDialogOpen] = useState(false);
  const [renameTabName, setRenameTabName] = useState('');

  const updateTabs = useCallback((updater: (tabs: PreprocessingWorkbook[]) => PreprocessingWorkbook[]) => {
    setTabs((previous) => {
      const nextTabs = updater(previous);
      tabsRef.current = nextTabs;
      return nextTabs;
    });
  }, [setTabs, tabsRef]);

  const handleNewTab = useCallback(() => {
    const currentActiveTab = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    if (!currentActiveTab) return null;

    const newTab = createNewTab(tabsRef.current);
    saveActiveSnapshot();
    updateTabs((previous) => [...previous, newTab]);
    activateTab(newTab);
    return newTab.id;
  }, [activeTabIdRef, activateTab, saveActiveSnapshot, tabsRef, updateTabs]);

  const adoptTab = useCallback((id: string, name: string) => {
    if (tabsRef.current.some((tab) => tab.id === id)) {
      handleTabSwitch(id);
      return;
    }

    const newTab = createAdoptedTab(id, name);
    saveActiveSnapshot();
    updateTabs((previous) => [...previous, newTab]);
    activateTab(newTab);
  }, [activateTab, handleTabSwitch, saveActiveSnapshot, tabsRef, updateTabs]);

  const deleteTabById = useCallback((tabId: string) => {
    const currentTabs = tabsRef.current;
    const deletedTab = currentTabs.find((tab) => tab.id === tabId) ?? null;
    if (!deletedTab || currentTabs.length <= 1) {
      return undefined;
    }

    const isActiveTab = activeTabIdRef.current === tabId;
    const deletedTabIndex = currentTabs.findIndex((tab) => tab.id === tabId);
    const fallbackTab = isActiveTab
      ? (currentTabs[deletedTabIndex - 1] ?? currentTabs[deletedTabIndex + 1] ?? null)
      : (currentTabs.find((tab) => tab.id === activeTabIdRef.current) ?? null);
    if (!fallbackTab) {
      return undefined;
    }

    if (projectId) {
      localStorage.removeItem(buildScopedTabStorageKey(deletedTab.id));
    }

    const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);
    updateTabs(() => nextTabs);

    if (isActiveTab) {
      activateTab(fallbackTab);
    }

    void (async () => {
      let fallbackNotebookId: string | null = fallbackTab.notebookId;
      if (isActiveTab) {
        fallbackNotebookId = await ensureNotebookForTab(fallbackTab);
      }
      if (deletedTab.notebookId && deletedTab.notebookId !== fallbackNotebookId) {
        await deleteNotebook(deletedTab.notebookId);
      }
    })();

    return fallbackTab.id;
  }, [
    activeTabIdRef,
    activateTab,
    buildScopedTabStorageKey,
    deleteNotebook,
    ensureNotebookForTab,
    projectId,
    tabsRef,
    updateTabs
  ]);

  const handleDeleteTab = useCallback(() => {
    const nextActiveTabId = deleteTabById(activeTabIdRef.current);
    if (!nextActiveTabId) {
      return null;
    }
    return nextActiveTabId;
  }, [activeTabIdRef, deleteTabById]);

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

    updateTabs((previous) => renameTab(previous, currentActiveTab.id, trimmed));
    if (currentActiveTab.notebookId) {
      void renameNotebook(currentActiveTab.notebookId, trimmed);
      void updateNotebookMetadata(currentActiveTab.notebookId, {
        tabId: currentActiveTab.id,
        tabName: trimmed
      });
    }
    setRenameTabDialogOpen(false);
  }, [activeTabIdRef, renameNotebook, renameTabName, tabsRef, updateNotebookMetadata, updateTabs]);

  const resetActiveTab = useCallback(() => {
    const currentActiveTab = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    if (!currentActiveTab) return;

    if (projectId) {
      localStorage.removeItem(buildScopedTabStorageKey(currentActiveTab.id));
    }

    const { nextTabs, resetTab } = resetActiveTabState(tabsRef.current, currentActiveTab.id);
    if (!resetTab) {
      return;
    }

    updateTabs(() => nextTabs);
    applyTabSnapshot(resetTab.snapshot);
    if (tables.length > 0) {
      onNeedsDatasetSelection(tables[0].datasetId);
    }

    void (async () => {
      const nextNotebookId = await ensureNotebookForTab(resetTab, { forceCreate: true });
      if (currentActiveTab.notebookId && currentActiveTab.notebookId !== nextNotebookId) {
        await deleteNotebook(currentActiveTab.notebookId);
      }
    })();
  }, [
    activeTabIdRef,
    applyTabSnapshot,
    buildScopedTabStorageKey,
    deleteNotebook,
    ensureNotebookForTab,
    onNeedsDatasetSelection,
    projectId,
    tables,
    tabsRef,
    updateTabs
  ]);

  const invalidateActiveTabSession = useCallback(() => {
    const currentActiveTab = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    if (!currentActiveTab) return;

    if (projectId) {
      localStorage.removeItem(buildScopedTabStorageKey(currentActiveTab.id));
      useWorkflowSessionStore
        .getState()
        .clearSession(buildWorkflowSessionKey(projectId, buildTabStorageKey(currentActiveTab.id)));
    }

    const { nextTabs, invalidatedTab } = invalidateActiveTabSessionState(tabsRef.current, currentActiveTab.id);
    if (!invalidatedTab) {
      return;
    }

    updateTabs(() => nextTabs);
    applyTabSnapshot(invalidatedTab.snapshot);
  }, [
    activeTabIdRef,
    applyTabSnapshot,
    buildScopedTabStorageKey,
    buildTabStorageKey,
    projectId,
    tabsRef,
    updateTabs
  ]);

  return {
    handleNewTab,
    adoptTab,
    deleteTabById,
    handleDeleteTab,
    openRenameTabDialog,
    handleRenameTab,
    renameTabDialogOpen,
    setRenameTabDialogOpen,
    renameTabName,
    setRenameTabName,
    resetActiveTab,
    invalidateActiveTabSession
  };
}
