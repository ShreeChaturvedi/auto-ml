import { describe, expect, it, vi } from 'vitest';

import type { WorkbookEntry } from '@/types/workbook';
import {
  activatePreprocessingTab,
  switchPreprocessingTab
} from '../preprocessingTabActivation';
import { resolveRequestedWorkbookAction } from '../preprocessingWorkbookUrlSync';
import type { PreprocessingWorkbook } from '../../preprocessingTabUtils';

function makeTab(overrides: Partial<PreprocessingWorkbook> = {}): PreprocessingWorkbook {
  return {
    id: 'tab-1',
    name: 'Workbook 1',
    notebookId: null,
    snapshot: {
      selectedDatasetId: null,
      runId: null,
      timeline: [],
      stepBindings: {},
      replayReport: null
    },
    storageVersion: 0,
    ...overrides
  };
}

describe('tab controller helpers', () => {
  it('activates a workbook by syncing the URL, applying the snapshot, and ensuring a notebook', () => {
    const targetTab = makeTab({ id: 'tab-2', name: 'Workbook 2' });
    const setActiveTabId = vi.fn();
    const syncWorkbookSelection = vi.fn();
    const applyTabSnapshot = vi.fn();
    const ensureNotebookForTab = vi.fn(async () => null);

    activatePreprocessingTab(targetTab, {
      setActiveTabId,
      syncWorkbookSelection,
      applyTabSnapshot,
      ensureNotebookForTab
    });

    expect(setActiveTabId).toHaveBeenCalledWith('tab-2');
    expect(syncWorkbookSelection).toHaveBeenCalledWith('tab-2', true);
    expect(applyTabSnapshot).toHaveBeenCalledWith(targetTab.snapshot);
    expect(ensureNotebookForTab).toHaveBeenCalledWith(targetTab);
  });

  it('saves the current workbook before activating a different one', () => {
    const firstTab = makeTab({ id: 'tab-1' });
    const secondTab = makeTab({ id: 'tab-2' });
    const saveActiveSnapshot = vi.fn();
    const activateTab = vi.fn();

    const changed = switchPreprocessingTab('tab-2', {
      tabs: [firstTab, secondTab],
      activeTabId: 'tab-1',
      saveActiveSnapshot,
      activateTab
    });

    expect(changed).toBe(true);
    expect(saveActiveSnapshot).toHaveBeenCalledTimes(1);
    expect(activateTab).toHaveBeenCalledWith(secondTab);
    expect(saveActiveSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      activateTab.mock.invocationCallOrder[0]
    );
  });

  it('requests adoption when the URL points at a registry workbook not yet in local tabs', () => {
    const tabs = [makeTab({ id: 'tab-1', name: 'Workbook 1' })];
    const registry: WorkbookEntry[] = [
      { id: 'tab-2', name: 'Workbook 2', notebookId: null }
    ];

    expect(
      resolveRequestedWorkbookAction({
        tabsReady: true,
        activeTabId: 'tab-1',
        requestedTabId: 'tab-2',
        syncedWorkbookId: null,
        tabs,
        registry
      })
    ).toEqual({
      type: 'adopt',
      tabId: 'tab-2',
      name: 'Workbook 2'
    });
  });
});
