import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PreprocessingTabSnapshot } from '../../preprocessingTabUtils';

describe('tabStateTransforms snapshot semantics', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('invalidates a workbook using createEmptyTabSnapshot defaults for reset fields', async () => {
    vi.doMock('../../preprocessingTabUtils', async () => {
      const actual = await vi.importActual<typeof import('../../preprocessingTabUtils')>('../../preprocessingTabUtils');
      return {
        ...actual,
        createEmptyTabSnapshot: () => ({
          ...actual.createEmptyTabSnapshot(),
          futureField: 'reset-default'
        })
      };
    });

    const { invalidateActiveTabSessionState } = await import('../tabStateTransforms');

    const result = invalidateActiveTabSessionState(
      [
        {
          id: 'tab-1',
          name: 'Workbook 1',
          notebookId: 'nb-1',
          storageVersion: 2,
          snapshot: {
            selectedDatasetId: 'dataset-1',
            runId: 'run-1',
            timeline: [],
            stepBindings: {},
            replayReport: null,
            futureField: 'stale-value',
          } as unknown as PreprocessingTabSnapshot,
        }
      ],
      'tab-1'
    );

    expect(result.invalidatedTab?.snapshot).toMatchObject({
      futureField: 'reset-default',
      selectedDatasetId: 'dataset-1',
      runId: null
    });
  });
});
