import type {
  PreprocessingTabSnapshot,
  PreprocessingWorkbook
} from '../preprocessingTabUtils';

interface ActivatePreprocessingTabOptions {
  setActiveTabId: (tabId: string) => void;
  syncWorkbookSelection: (tabId: string, replace?: boolean) => void;
  applyTabSnapshot: (snapshot: PreprocessingTabSnapshot) => void;
  ensureNotebookForTab: (tab: PreprocessingWorkbook) => Promise<string | null>;
}

interface SwitchPreprocessingTabOptions {
  tabs: PreprocessingWorkbook[];
  activeTabId: string;
  saveActiveSnapshot: () => void;
  activateTab: (tab: PreprocessingWorkbook) => void;
}

export function activatePreprocessingTab(
  tab: PreprocessingWorkbook,
  {
    setActiveTabId,
    syncWorkbookSelection,
    applyTabSnapshot,
    ensureNotebookForTab
  }: ActivatePreprocessingTabOptions
): void {
  setActiveTabId(tab.id);
  syncWorkbookSelection(tab.id, true);
  applyTabSnapshot(tab.snapshot);
  void ensureNotebookForTab(tab);
}

export function switchPreprocessingTab(
  nextTabId: string,
  {
    tabs,
    activeTabId,
    saveActiveSnapshot,
    activateTab
  }: SwitchPreprocessingTabOptions
): boolean {
  const currentActiveTab = tabs.find((tab) => tab.id === activeTabId);
  if (!currentActiveTab) {
    return false;
  }

  const targetTab = tabs.find((tab) => tab.id === nextTabId);
  if (!targetTab || targetTab.id === currentActiveTab.id) {
    return false;
  }

  saveActiveSnapshot();
  activateTab(targetTab);
  return true;
}
