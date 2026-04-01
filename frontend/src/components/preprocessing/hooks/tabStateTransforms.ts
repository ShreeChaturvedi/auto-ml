import {
  createEmptyTabSnapshot,
  createWorkbookId,
  nextWorkbookName
} from '../preprocessingTabUtils';
import type { PreprocessingWorkbook, PreprocessingTabSnapshot } from '../preprocessingTabUtils';

function updateTab(
  tabs: PreprocessingWorkbook[],
  tabId: string,
  updater: (tab: PreprocessingWorkbook) => PreprocessingWorkbook
): PreprocessingWorkbook[] {
  return tabs.map((tab) => (tab.id === tabId ? updater(tab) : tab));
}

export function updateTabSnapshot(
  tabs: PreprocessingWorkbook[],
  tabId: string,
  snapshot: PreprocessingTabSnapshot
): PreprocessingWorkbook[] {
  return updateTab(tabs, tabId, (tab) => ({ ...tab, snapshot }));
}

export function setTabNotebookBinding(
  tabs: PreprocessingWorkbook[],
  tabId: string,
  notebookId: string | null
): PreprocessingWorkbook[] {
  return updateTab(tabs, tabId, (tab) => ({ ...tab, notebookId }));
}

export function createNewTab(tabs: PreprocessingWorkbook[]): PreprocessingWorkbook {
  return {
    id: createWorkbookId(),
    name: nextWorkbookName(tabs),
    notebookId: null,
    snapshot: createEmptyTabSnapshot(),
    storageVersion: 0
  };
}

export function createAdoptedTab(id: string, name: string): PreprocessingWorkbook {
  return {
    id,
    name,
    notebookId: null,
    snapshot: createEmptyTabSnapshot(),
    storageVersion: 0
  };
}

export interface DeleteActiveTabResult {
  nextTabs: PreprocessingWorkbook[];
  deletedTab: PreprocessingWorkbook | null;
  fallbackTab: PreprocessingWorkbook | null;
}

export function deleteActiveTab(
  tabs: PreprocessingWorkbook[],
  activeTabId: string
): DeleteActiveTabResult {
  const deletedTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  if (!deletedTab || tabs.length <= 1) {
    return { nextTabs: tabs, deletedTab, fallbackTab: null };
  }

  const targetIndex = tabs.findIndex((tab) => tab.id === activeTabId);
  const fallbackTab = tabs[targetIndex - 1] ?? tabs[targetIndex + 1] ?? null;
  if (!fallbackTab) {
    return { nextTabs: tabs, deletedTab, fallbackTab: null };
  }

  return {
    nextTabs: tabs.filter((tab) => tab.id !== activeTabId),
    deletedTab,
    fallbackTab
  };
}

export function renameTab(
  tabs: PreprocessingWorkbook[],
  tabId: string,
  name: string
): PreprocessingWorkbook[] {
  return updateTab(tabs, tabId, (tab) => ({ ...tab, name }));
}

export interface ResetActiveTabStateResult {
  nextTabs: PreprocessingWorkbook[];
  resetTab: PreprocessingWorkbook | null;
}

export function resetActiveTabState(
  tabs: PreprocessingWorkbook[],
  activeTabId: string
): ResetActiveTabStateResult {
  const currentTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  if (!currentTab) {
    return { nextTabs: tabs, resetTab: null };
  }

  const nextSnapshot = createEmptyTabSnapshot();
  const resetTab: PreprocessingWorkbook = {
    ...currentTab,
    notebookId: null,
    snapshot: nextSnapshot,
    storageVersion: currentTab.storageVersion + 1
  };

  return {
    nextTabs: updateTab(tabs, activeTabId, () => resetTab),
    resetTab
  };
}

export interface InvalidateActiveTabSessionStateResult {
  nextTabs: PreprocessingWorkbook[];
  invalidatedTab: PreprocessingWorkbook | null;
}

export function invalidateActiveTabSessionState(
  tabs: PreprocessingWorkbook[],
  activeTabId: string
): InvalidateActiveTabSessionStateResult {
  const currentTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  if (!currentTab) {
    return { nextTabs: tabs, invalidatedTab: null };
  }

  const nextSnapshot: PreprocessingTabSnapshot = {
    ...currentTab.snapshot,
    runId: null,
    timeline: [],
    stepBindings: {},
    replayReport: null
  };
  const invalidatedTab: PreprocessingWorkbook = {
    ...currentTab,
    snapshot: nextSnapshot,
    storageVersion: currentTab.storageVersion + 1
  };

  return {
    nextTabs: updateTab(tabs, activeTabId, () => invalidatedTab),
    invalidatedTab
  };
}
