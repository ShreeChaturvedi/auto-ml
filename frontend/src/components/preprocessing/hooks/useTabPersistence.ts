import { useCallback, useEffect, useRef, useState } from 'react';

import { usePreprocessingStore } from '@/stores/preprocessingStore';
import { buildWorkflowSessionKey, useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import {
  buildProcessingStorageKey,
  buildWorkbookTabsStateKey,
  extractRawRunReferenceFromStoredMessages,
  migrateWorkbookState,
  type StoredPreprocessingTabState
} from '../storagePersistence';
import { isWorkflowThreadId } from '@/lib/workflowThread';
import {
  DEFAULT_WORKBOOK_ID,
  createDefaultWorkbook,
  createEmptyTabSnapshot,
  normalizeWorkbookNames
} from '../preprocessingTabUtils';
import type { PreprocessingWorkbook } from '../preprocessingTabUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseTabPersistenceOptions {
  projectId: string | undefined;
}

export interface UseTabPersistenceResult {
  /** Restored workbooks (or a single default workbook). */
  tabs: PreprocessingWorkbook[];
  setTabs: React.Dispatch<React.SetStateAction<PreprocessingWorkbook[]>>;
  activeTabId: string;
  setActiveTabId: React.Dispatch<React.SetStateAction<string>>;
  tabsReady: boolean;
  tabsRef: React.MutableRefObject<PreprocessingWorkbook[]>;
  activeTabIdRef: React.MutableRefObject<string>;
  buildTabStorageKey: (tabId: string) => string;
  buildScopedTabStorageKey: (tabId: string) => string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTabPersistence({
  projectId
}: UseTabPersistenceOptions): UseTabPersistenceResult {
  const runId = usePreprocessingStore((state) => state.runId);
  const setRunId = usePreprocessingStore((state) => state.setRunId);
  const applyTabSnapshot = usePreprocessingStore((state) => state.applyTabSnapshot);

  const [tabs, setTabs] = useState<PreprocessingWorkbook[]>([createDefaultWorkbook()]);
  const [activeTabId, setActiveTabId] = useState<string>(DEFAULT_WORKBOOK_ID);
  const [tabsReady, setTabsReady] = useState(false);

  const tabsRef = useRef<PreprocessingWorkbook[]>([]);
  const activeTabIdRef = useRef<string>(DEFAULT_WORKBOOK_ID);
  const hydratedTabsProjectRef = useRef<string | null>(null);
  const suppressStoredRunHydrationRef = useRef(false);
  const prevRunIdRef = useRef<string | null>(null);

  // ---- Storage key builders ------------------------------------------------

  const buildTabStorageKey = buildProcessingStorageKey;

  const buildScopedTabStorageKey = useCallback(
    (tabId: string): string =>
      projectId
        ? `${buildProcessingStorageKey(tabId)}-${projectId}`
        : buildProcessingStorageKey(tabId),
    [projectId]
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

    const persistedTabsState = migrateWorkbookState(projectId);

    const recoveredTabs: PreprocessingWorkbook[] = [];
    const knownTabIds = new Set<string>();

    const appendRecoveredTab = (tab: StoredPreprocessingTabState) => {
      if (knownTabIds.has(tab.id)) {
        return;
      }
      knownTabIds.add(tab.id);
      const storageKey = buildScopedTabStorageKey(tab.id);
      const rawStoredMessages = localStorage.getItem(storageKey);
      const runReference = extractRawRunReferenceFromStoredMessages(rawStoredMessages);
      const isThreadId = isWorkflowThreadId(runReference);
      if (projectId && isThreadId) {
        localStorage.removeItem(storageKey);
        useWorkflowSessionStore
          .getState()
          .clearSession(buildWorkflowSessionKey(projectId, buildTabStorageKey(tab.id)));
      }
      const inferredRunId = isThreadId ? null : runReference;
      recoveredTabs.push({
        id: tab.id,
        name: tab.name,
        notebookId: tab.notebookId,
        storageVersion: tab.storageVersion,
        snapshot: {
          ...createEmptyTabSnapshot(),
          runId: inferredRunId,
          selectedDatasetId: tab.selectedDatasetId
        }
      });
    };

    persistedTabsState?.tabs.forEach(appendRecoveredTab);

    if (recoveredTabs.length === 0) {
      recoveredTabs.push(createDefaultWorkbook());
    }
    const normalizedRecoveredTabs = normalizeWorkbookNames(recoveredTabs);

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
  }, [applyTabSnapshot, buildScopedTabStorageKey, buildTabStorageKey, projectId]);

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
      buildWorkbookTabsStateKey(projectId),
      JSON.stringify({
        activeTabId: persistedActiveTabId,
        tabs: tabs.map((tab) => ({
          id: tab.id,
          name: tab.name,
          storageVersion: tab.storageVersion,
          notebookId: tab.notebookId,
          selectedDatasetId: tab.snapshot.selectedDatasetId ?? null
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
    const rawStoredMessages = localStorage.getItem(storageKey);
    const runReference = extractRawRunReferenceFromStoredMessages(rawStoredMessages);
    const isThreadId = isWorkflowThreadId(runReference);
    if (isThreadId) {
      localStorage.removeItem(storageKey);
      useWorkflowSessionStore
        .getState()
        .clearSession(buildWorkflowSessionKey(projectId, buildTabStorageKey(activeTab.id)));
    }
    const inferredRunId = isThreadId ? null : runReference;
    if (inferredRunId) {
      setRunId(inferredRunId);
    }
  }, [activeTabId, buildScopedTabStorageKey, buildTabStorageKey, projectId, runId, setRunId]);

  // ---- Manage suppression flag for stale run ID clearing -------------------
  // When runId transitions from a value to null (e.g. hydrateRunById got a 404
  // and cleared the stale reference), suppress re-inference from localStorage
  // so the tab persistence effect doesn't immediately re-set the same stale ID.
  // When a legitimate runId is later set, clear the suppression flag.

  useEffect(() => {
    const prev = prevRunIdRef.current;
    prevRunIdRef.current = runId;

    if (runId) {
      // A real run ID was set — allow future hydration from localStorage.
      suppressStoredRunHydrationRef.current = false;
    } else if (prev) {
      // runId went from a truthy value to null — suppress re-inference.
      suppressStoredRunHydrationRef.current = true;
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
