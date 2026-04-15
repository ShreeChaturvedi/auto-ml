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

    switchPreprocessingTab('tab-2', {
      tabs: [firstTab, secondTab],
      activeTabId: 'tab-1',
      saveActiveSnapshot,
      activateTab
    });

    expect(saveActiveSnapshot).toHaveBeenCalledTimes(1);
    expect(activateTab).toHaveBeenCalledWith(secondTab);
    expect(saveActiveSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      activateTab.mock.invocationCallOrder[0]
    );
  });

  it('skips work when the requested tab is already active', () => {
    const activeTab = makeTab({ id: 'tab-1' });
    const saveActiveSnapshot = vi.fn();
    const activateTab = vi.fn();

    switchPreprocessingTab('tab-1', {
      tabs: [activeTab],
      activeTabId: 'tab-1',
      saveActiveSnapshot,
      activateTab
    });

    expect(saveActiveSnapshot).not.toHaveBeenCalled();
    expect(activateTab).not.toHaveBeenCalled();
  });

  it('syncs the active workbook when the URL has no workbook selection', () => {
    expect(
      resolveRequestedWorkbookAction({
        tabsReady: true,
        activeTabId: 'tab-1',
        requestedTabId: undefined,
        syncedWorkbookId: null,
        tabs: [makeTab({ id: 'tab-1' })],
        registry: []
      })
    ).toEqual({
      type: 'sync-active',
      tabId: 'tab-1'
    });
  });

  it('clears the synced marker when the URL already matches the active workbook', () => {
    expect(
      resolveRequestedWorkbookAction({
        tabsReady: true,
        activeTabId: 'tab-1',
        requestedTabId: 'tab-1',
        syncedWorkbookId: 'tab-1',
        tabs: [makeTab({ id: 'tab-1' })],
        registry: []
      })
    ).toEqual({
      type: 'clear-synced'
    });
  });

  it('switches to an existing workbook when the URL points at a local tab', () => {
    expect(
      resolveRequestedWorkbookAction({
        tabsReady: true,
        activeTabId: 'tab-1',
        requestedTabId: 'tab-2',
        syncedWorkbookId: null,
        tabs: [makeTab({ id: 'tab-1' }), makeTab({ id: 'tab-2' })],
        registry: []
      })
    ).toEqual({
      type: 'switch',
      tabId: 'tab-2'
    });
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

  it('falls back to syncing the active workbook when the URL points at an unknown workbook', () => {
    expect(
      resolveRequestedWorkbookAction({
        tabsReady: true,
        activeTabId: 'tab-1',
        requestedTabId: 'missing-tab',
        syncedWorkbookId: null,
        tabs: [makeTab({ id: 'tab-1' })],
        registry: []
      })
    ).toEqual({
      type: 'sync-active',
      tabId: 'tab-1'
    });
  });
});
