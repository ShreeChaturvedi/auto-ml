import { useCallback, useEffect, useRef } from 'react';

import type { ReplayCompatibilityReport } from '@/stores/preprocessingStore';
import type { AvailableTable, StepCellBinding, TransformationEvent } from '@/types/preprocessing';
import type { PreprocessingTabSnapshot, PreprocessingWorkbook } from '../preprocessingTabUtils';
import { updateTabSnapshot } from './tabStateTransforms';

interface UseTabSnapshotSyncOptions {
  activeTabId: string;
  activeTabIdRef: React.MutableRefObject<string>;
  tabsRef: React.MutableRefObject<PreprocessingWorkbook[]>;
  setTabs: React.Dispatch<React.SetStateAction<PreprocessingWorkbook[]>>;
  tables: AvailableTable[];
  selectedDatasetId: string | null;
  runId: string | null;
  timeline: TransformationEvent[];
  stepBindings: Record<string, StepCellBinding>;
  replayReport: ReplayCompatibilityReport | null;
  applyTabSnapshotToStore: (snapshot: PreprocessingTabSnapshot) => void;
  onNeedsDatasetSelection: (firstDatasetId: string) => void;
}

interface UseTabSnapshotSyncResult {
  applyTabSnapshot: (snapshot: PreprocessingTabSnapshot) => void;
  saveActiveSnapshot: () => void;
}

export function useTabSnapshotSync({
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
}: UseTabSnapshotSyncOptions): UseTabSnapshotSyncResult {
  const previousActiveTabIdRef = useRef(activeTabId);

  const buildCurrentSnapshot = useCallback((): PreprocessingTabSnapshot => ({
    selectedDatasetId,
    runId,
    timeline,
    stepBindings,
    replayReport
  }), [replayReport, runId, selectedDatasetId, stepBindings, timeline]);

  const persistSnapshotForTab = useCallback((tabId: string, snapshot: PreprocessingTabSnapshot) => {
    if (!tabsRef.current.some((tab) => tab.id === tabId)) {
      return;
    }

    setTabs((previous) => {
      if (!previous.some((tab) => tab.id === tabId)) {
        return previous;
      }

      const nextTabs = updateTabSnapshot(previous, tabId, snapshot);
      tabsRef.current = nextTabs;
      return nextTabs;
    });
  }, [setTabs, tabsRef]);

  const applyTabSnapshot = useCallback((snapshot: PreprocessingTabSnapshot) => {
    applyTabSnapshotToStore(snapshot);
    if (!snapshot.selectedDatasetId && tables.length > 0) {
      onNeedsDatasetSelection(tables[0].datasetId);
    }
  }, [applyTabSnapshotToStore, onNeedsDatasetSelection, tables]);

  useEffect(() => {
    if (previousActiveTabIdRef.current !== activeTabId) {
      previousActiveTabIdRef.current = activeTabId;
      return;
    }

    persistSnapshotForTab(activeTabId, buildCurrentSnapshot());
  }, [activeTabId, buildCurrentSnapshot, persistSnapshotForTab]);

  const saveActiveSnapshot = useCallback(() => {
    persistSnapshotForTab(activeTabIdRef.current, buildCurrentSnapshot());
  }, [activeTabIdRef, buildCurrentSnapshot, persistSnapshotForTab]);

  return {
    applyTabSnapshot,
    saveActiveSnapshot
  };
}
