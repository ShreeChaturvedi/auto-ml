import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFeatureNotebookSync } from '../useFeatureNotebookSync';

const notebookApiMocks = vi.hoisted(() => ({
  notebooks: [] as Array<{ notebookId: string; metadata?: Record<string, unknown> }>,
  listNotebooks: vi.fn(async () => [] as Array<{ notebookId: string; metadata?: Record<string, unknown> }>),
  createNotebook: vi.fn(async () => ({ notebookId: 'created-nb', metadata: {} })),
  updateNotebook: vi.fn(async () => ({ notebookId: 'created-nb', metadata: {} }))
}));

const mockFeatureState = vi.hoisted(() => ({
  setVersionNotebookId: vi.fn()
}));

vi.mock('@/lib/api/notebooks', () => ({
  listNotebooks: (...args: unknown[]) => (notebookApiMocks.listNotebooks as (...a: unknown[]) => unknown)(...args),
  createNotebook: (...args: unknown[]) => (notebookApiMocks.createNotebook as (...a: unknown[]) => unknown)(...args),
  updateNotebook: (...args: unknown[]) => (notebookApiMocks.updateNotebook as (...a: unknown[]) => unknown)(...args)
}));

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: Object.assign(
    (selector: (state: typeof mockFeatureState) => unknown) => selector(mockFeatureState),
    {
      getState: () => mockFeatureState
    }
  )
}));

describe('useFeatureNotebookSync', () => {
  beforeEach(() => {
    notebookApiMocks.notebooks = [];
    notebookApiMocks.listNotebooks.mockReset();
    notebookApiMocks.listNotebooks.mockImplementation(async () => notebookApiMocks.notebooks);
    notebookApiMocks.createNotebook.mockReset();
    (notebookApiMocks.createNotebook as ReturnType<typeof vi.fn>).mockImplementation(async (_projectId: string, request: { metadata?: Record<string, unknown> }) => ({
      notebookId: 'created-nb',
      metadata: request.metadata ?? {}
    }));
    notebookApiMocks.updateNotebook.mockReset();
    (notebookApiMocks.updateNotebook as ReturnType<typeof vi.fn>).mockImplementation(async (notebookId: string, request: { metadata?: Record<string, unknown> }) => ({
      notebookId,
      metadata: request.metadata ?? {}
    }));
    mockFeatureState.setVersionNotebookId.mockReset();
  });

  it('creates a fresh FE notebook instead of reusing a preprocessing notebook binding', async () => {
    notebookApiMocks.notebooks = [
      {
        notebookId: 'prep-nb-1',
        metadata: {
          phase: 'preprocessing',
          tabId: 'pre-wb-1'
        }
      }
    ];
    notebookApiMocks.createNotebook.mockResolvedValue({
      notebookId: 'fe-nb-1',
      metadata: {
        phase: 'feature-engineering',
        tabId: 'draft-1'
      }
    });

    const { result } = renderHook(() => useFeatureNotebookSync({
      projectId: 'project-1',
      currentVersion: {
        id: 'draft-1',
        projectId: 'project-1',
        name: 'Draft Pipeline v1',
        status: 'draft',
        createdAt: new Date('2026-04-01T00:00:00.000Z').toISOString(),
        readinessReport: {
          dataSummary: {
            addedColumns: [],
            removedColumns: [],
            renamedColumns: [],
            typeChanges: [],
            nullDeltas: [],
            warnings: []
          },
          steps: []
        },
        notebookId: 'prep-nb-1'
      }
    }));

    await waitFor(() => {
      expect(result.current).toEqual({
        notebookId: 'fe-nb-1',
        isReady: true
      });
    });

    expect(notebookApiMocks.createNotebook).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        name: 'Draft Pipeline v1',
        metadata: expect.objectContaining({
          phase: 'feature-engineering',
          tabId: 'draft-1'
        })
      })
    );
    expect(notebookApiMocks.updateNotebook).not.toHaveBeenCalledWith(
      'prep-nb-1',
      expect.anything()
    );
    expect(mockFeatureState.setVersionNotebookId).toHaveBeenCalledWith('project-1', 'draft-1', 'fe-nb-1');
  });

  it('adopts the notebook already tagged for the current FE draft', async () => {
    notebookApiMocks.notebooks = [
      {
        notebookId: 'fe-nb-2',
        metadata: {
          phase: 'feature-engineering',
          tabId: 'draft-2',
          tabName: 'Draft Pipeline v2'
        }
      }
    ];

    const { result } = renderHook(() => useFeatureNotebookSync({
      projectId: 'project-1',
      currentVersion: {
        id: 'draft-2',
        projectId: 'project-1',
        name: 'Draft Pipeline v2',
        status: 'draft',
        createdAt: new Date('2026-04-01T00:00:00.000Z').toISOString(),
        readinessReport: {
          dataSummary: {
            addedColumns: [],
            removedColumns: [],
            renamedColumns: [],
            typeChanges: [],
            nullDeltas: [],
            warnings: []
          },
          steps: []
        }
      }
    }));

    await waitFor(() => {
      expect(result.current).toEqual({
        notebookId: 'fe-nb-2',
        isReady: true
      });
    });

    expect(notebookApiMocks.createNotebook).not.toHaveBeenCalled();
    expect(notebookApiMocks.updateNotebook).toHaveBeenCalledWith('fe-nb-2', expect.objectContaining({
      metadata: expect.objectContaining({
        phase: 'feature-engineering',
        tabId: 'draft-2'
      })
    }));
    expect(mockFeatureState.setVersionNotebookId).toHaveBeenCalledWith('project-1', 'draft-2', 'fe-nb-2');
  });
});
