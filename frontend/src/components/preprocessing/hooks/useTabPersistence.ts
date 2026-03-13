import { useCallback, useEffect, useRef, useState } from 'react';

import { usePreprocessingStore } from '@/stores/preprocessingStore';
import {
  buildProcessingStorageKey,
  buildProcessingTabsStateKey,
  extractRunIdFromStoredMessages,
  parseStoredPreprocessingTabsState
} from '../storagePersistence';
import {
  createDefaultTab,
  createEmptyTabSnapshot,
  normalizeProcessingTabNames
} from '../preprocessingTabUtils';
import type { PreprocessingTab } from '../preprocessingTabUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseTabPersistenceOptions {
  projectId: string | undefined;
}

export interface UseTabPersistenceResult {
  /** Restored tabs (or a single default tab). */
  tabs: PreprocessingTab[];
  setTabs: React.Dispatch<React.SetStateAction<PreprocessingTab[]>>;
  activeTabId: string;
  setActiveTabId: React.Dispatch<React.SetStateAction<string>>;
  tabsReady: boolean;
  tabsRef: React.MutableRefObject<PreprocessingTab[]>;
  activeTabIdRef: React.MutableRefObject<string>;
  buildTabStorageKey: (tabId: string) => string;
  buildScopedTabStorageKey: (tabId: string) => string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const DEFAULT_TAB_ID = 'processing-tab-1';

export function useTabPersistence({
  projectId
}: UseTabPersistenceOptions): UseTabPersistenceResult {
  const runId = usePreprocessingStore((state) => state.runId);
  const setRunId = usePreprocessingStore((state) => state.setRunId);
  const applyTabSnapshot = usePreprocessingStore((state) => state.applyTabSnapshot);

  const [tabs, setTabs] = useState<PreprocessingTab[]>([createDefaultTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(DEFAULT_TAB_ID);
  const [tabsReady, setTabsReady] = useState(false);

  const tabsRef = useRef<PreprocessingTab[]>([]);
  const activeTabIdRef = useRef<string>(DEFAULT_TAB_ID);
  const hydratedTabsProjectRef = useRef<string | null>(null);
  const suppressStoredRunHydrationRef = useRef(false);

  // ---- Storage key builders ------------------------------------------------

  const buildTabStorageKey = useCallback(
    (tabId: string): string => buildProcessingStorageKey(tabId),
    []
  );

  const buildScopedTabStorageKey = useCallback(
    (tabId: string): string =>
      projectId
        ? `${buildTabStorageKey(tabId)}-${projectId}`
        : buildTabStorageKey(tabId),
    [buildTabStorageKey, projectId]
  );

  // ---- Restore tabs from localStorage when projectId changes ---------------

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
    applyTabSnapshot(activeRecoveredTab.snapshot);
    setTabsReady(true);
  }, [applyTabSnapshot, buildScopedTabStorageKey, projectId]);

  // ---- Keep refs in sync ---------------------------------------------------

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  // ---- Ensure activeTabId points to an existing tab ------------------------

  useEffect(() => {
    if (tabs.length === 0) {
      return;
    }
    if (!tabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
    }
  }, [activeTabId, tabs]);

  // ---- Persist tabs state to localStorage ----------------------------------

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

  // ---- Restore stored run id when active tab changes -----------------------

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

  // ---- Clear suppression flag when a real runId is set ---------------------

  useEffect(() => {
    if (runId) {
      suppressStoredRunHydrationRef.current = false;
    }
  }, [runId]);

  return {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    tabsReady,
    tabsRef,
    activeTabIdRef,
    buildTabStorageKey,
    buildScopedTabStorageKey
  };
}
