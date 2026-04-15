import { describe, expect, it } from 'vitest';

import {
  deleteActiveTab,
  invalidateActiveTabSessionState,
  resetActiveTabState
} from '../tabStateTransforms';
import type { PreprocessingWorkbook } from '../../preprocessingTabUtils';

function createTab(overrides: Partial<PreprocessingWorkbook> & Pick<PreprocessingWorkbook, 'id' | 'name'>): PreprocessingWorkbook {
  return {
    id: overrides.id,
    name: overrides.name,
    notebookId: overrides.notebookId ?? null,
    storageVersion: overrides.storageVersion ?? 0,
    snapshot: overrides.snapshot ?? {
      selectedDatasetId: null,
      runId: null,
      timeline: [],
      stepBindings: {},
      replayReport: null
    }
  };
}

describe('tabStateTransforms', () => {
  it('deletes the active workbook and prefers the previous workbook as fallback', () => {
    const tabs = [
      createTab({ id: 'tab-1', name: 'Workbook 1', notebookId: 'nb-1' }),
      createTab({ id: 'tab-2', name: 'Workbook 2', notebookId: 'nb-2' }),
      createTab({ id: 'tab-3', name: 'Workbook 3', notebookId: 'nb-3' })
    ];

    const result = deleteActiveTab(tabs, 'tab-2');

    expect(result.deletedTab?.id).toBe('tab-2');
    expect(result.fallbackTab?.id).toBe('tab-1');
    expect(result.nextTabs.map((tab) => tab.id)).toEqual(['tab-1', 'tab-3']);
  });

  it('resets the active workbook snapshot, clears its notebook binding, and bumps storage version', () => {
    const tabs = [
      createTab({
        id: 'tab-1',
        name: 'Workbook 1',
        notebookId: 'nb-1',
        storageVersion: 3,
        snapshot: {
          selectedDatasetId: 'dataset-1',
          runId: 'run-1',
          timeline: [
            {
              id: 'evt-1',
              runId: 'run-1',
              stepId: 'step-1',
              toolName: 'profile_active_dataset',
              title: 'Profile dataset',
              status: 'applied',
              requiresApproval: false,
              cellIds: [],
              createdAt: 1,
              updatedAt: 1
            }
          ],
          stepBindings: {
            'step-1': {
              stepId: 'step-1',
              cellIds: ['cell-1'],
              codeHash: 'hash-1',
              lastSyncedAt: 1
            }
          },
          replayReport: null
        }
      })
    ];

    const result = resetActiveTabState(tabs, 'tab-1');

    expect(result.resetTab).toEqual({
      id: 'tab-1',
      name: 'Workbook 1',
      notebookId: null,
      storageVersion: 4,
      snapshot: {
        selectedDatasetId: null,
        runId: null,
        timeline: [],
        stepBindings: {},
        replayReport: null
      }
    });
    expect(result.nextTabs).toEqual([result.resetTab]);
  });

  it('invalidates the active workbook session without clearing the selected dataset', () => {
    const tabs = [
      createTab({
        id: 'tab-1',
        name: 'Workbook 1',
        notebookId: 'nb-1',
        storageVersion: 2,
        snapshot: {
          selectedDatasetId: 'dataset-1',
          runId: 'run-1',
          timeline: [
            {
              id: 'evt-1',
              runId: 'run-1',
              stepId: 'step-1',
              toolName: 'profile_active_dataset',
              title: 'Profile dataset',
              status: 'applied',
              requiresApproval: false,
              cellIds: [],
              createdAt: 1,
              updatedAt: 1
            }
          ],
          stepBindings: {
            'step-1': {
              stepId: 'step-1',
              cellIds: ['cell-1'],
              codeHash: 'hash-1',
              lastSyncedAt: 1
            }
          },
          replayReport: {
            checkedAt: 1,
            compatible: false,
            issues: ['stale'],
            source: 'local_precheck'
          }
        }
      })
    ];

    const result = invalidateActiveTabSessionState(tabs, 'tab-1');

    expect(result.invalidatedTab).toEqual({
      id: 'tab-1',
      name: 'Workbook 1',
      notebookId: 'nb-1',
      storageVersion: 3,
      snapshot: {
        selectedDatasetId: 'dataset-1',
        runId: null,
        timeline: [],
        stepBindings: {},
        replayReport: null
      }
    });
    expect(result.nextTabs).toEqual([result.invalidatedTab]);
  });
});
