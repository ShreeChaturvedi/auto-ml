import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFeatureNotebookSync } from '../useFeatureNotebookSync';

const notebookApiMocks = await vi.hoisted(async () => {
  const { createNotebookApiMocks } = await import('@/test/notebookApiFixtures');
  return createNotebookApiMocks();
});

const mockFeatureState = vi.hoisted(() => ({
  setVersionNotebookId: vi.fn()
}));

const notebookStoreState = vi.hoisted(() => ({
  currentProjectId: null as string | null,
  notebooks: [] as Array<{ notebookId: string; kind: 'phase' | 'standalone'; metadata?: Record<string, unknown> }>
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

vi.mock('@/stores/notebookStore', () => ({
  useNotebookStore: Object.assign(
    (selector: (state: typeof notebookStoreState) => unknown) => selector(notebookStoreState),
    {
      getState: () => notebookStoreState
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
      kind: 'phase',
      metadata: request.metadata ?? {}
    }));
    notebookApiMocks.updateNotebook.mockReset();
    (notebookApiMocks.updateNotebook as ReturnType<typeof vi.fn>).mockImplementation(async (notebookId: string, request: { metadata?: Record<string, unknown> }) => ({
      notebookId,
      metadata: request.metadata ?? {}
    }));
    mockFeatureState.setVersionNotebookId.mockReset();
    notebookStoreState.currentProjectId = null;
    notebookStoreState.notebooks = [];
  });

  it('creates a fresh FE notebook instead of reusing a preprocessing notebook binding', async () => {
    notebookApiMocks.notebooks = [
      {
        notebookId: 'prep-nb-1',
        kind: 'phase',
        metadata: {
          phase: 'preprocessing',
          tabId: 'pre-wb-1'
        }
      }
    ];
    notebookApiMocks.createNotebook.mockResolvedValue({
      notebookId: 'fe-nb-1',
      kind: 'phase',
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

  it('NEVER adopts a standalone notebook via URL deep-link or binding reuse', async () => {
    // Regression guard: a user's exploration notebook from the data viewer
    // must never be adopted as a feature-engineering notebook, even when its
    // metadata happens to match the current draft. `kind: 'standalone'` trumps
    // any metadata match and the binding hint from `currentVersion.notebookId`.
    notebookApiMocks.notebooks = [
      {
        notebookId: 'scratch-nb',
        kind: 'standalone',
        metadata: {
          phase: 'feature-engineering',
          tabId: 'draft-1'
        }
      }
    ];
    notebookApiMocks.createNotebook.mockResolvedValue({
      notebookId: 'fe-nb-new',
      kind: 'phase',
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
        // Deep-link hint — the hook must NOT adopt 'scratch-nb' even though
        // currentVersion.notebookId points at it.
        notebookId: 'scratch-nb'
      }
    }));

    await waitFor(() => {
      expect(result.current).toEqual({
        notebookId: 'fe-nb-new',
        isReady: true
      });
    });

    // The standalone notebook is NEVER touched or adopted.
    expect(notebookApiMocks.updateNotebook).not.toHaveBeenCalledWith(
      'scratch-nb',
      expect.anything()
    );
    expect(mockFeatureState.setVersionNotebookId).not.toHaveBeenCalledWith(
      'project-1',
      'draft-1',
      'scratch-nb'
    );
    // And a fresh FE phase notebook was created instead.
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
  });

  it('adopts the notebook already tagged for the current FE draft', async () => {
    notebookApiMocks.notebooks = [
      {
        notebookId: 'fe-nb-2',
        kind: 'phase',
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

  it('starts ready immediately when the live notebook store already has the bound FE notebook', async () => {
    notebookStoreState.currentProjectId = 'project-1';
    notebookStoreState.notebooks = [
      {
        notebookId: 'fe-nb-cached',
        kind: 'phase',
        metadata: {
          phase: 'feature-engineering',
          tabId: 'draft-cached',
          tabName: 'Draft Pipeline cached'
        }
      }
    ];
    notebookApiMocks.notebooks = notebookStoreState.notebooks;

    const { result } = renderHook(() => useFeatureNotebookSync({
      projectId: 'project-1',
      currentVersion: {
        id: 'draft-cached',
        projectId: 'project-1',
        name: 'Draft Pipeline cached',
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
        notebookId: 'fe-nb-cached'
      }
    }));

    expect(result.current).toEqual({
      notebookId: 'fe-nb-cached',
      isReady: true
    });

    await waitFor(() => {
      expect(result.current).toEqual({
        notebookId: 'fe-nb-cached',
        isReady: true
      });
    });

    expect(notebookApiMocks.createNotebook).not.toHaveBeenCalled();
  });

  it('rejects a bound notebookId that points at a different FE draft and creates a fresh notebook', async () => {
    notebookApiMocks.notebooks = [
      {
        notebookId: 'fe-nb-old',
        kind: 'phase',
        metadata: {
          phase: 'feature-engineering',
          tabId: 'draft-1',
          tabName: 'Draft Pipeline v1'
        }
      }
    ];
    notebookApiMocks.createNotebook.mockResolvedValue({
      notebookId: 'fe-nb-new',
      kind: 'phase',
      metadata: {
        phase: 'feature-engineering',
        tabId: 'draft-2'
      }
    });

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
        },
        notebookId: 'fe-nb-old'
      }
    }));

    expect(result.current).toEqual({
      notebookId: null,
      isReady: false
    });

    await waitFor(() => {
      expect(result.current).toEqual({
        notebookId: 'fe-nb-new',
        isReady: true
      });
    });

    expect(notebookApiMocks.createNotebook).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        name: 'Draft Pipeline v2',
        metadata: expect.objectContaining({
          phase: 'feature-engineering',
          tabId: 'draft-2'
        })
      })
    );
    expect(mockFeatureState.setVersionNotebookId).not.toHaveBeenCalledWith('project-1', 'draft-2', 'fe-nb-old');
    expect(mockFeatureState.setVersionNotebookId).toHaveBeenCalledWith('project-1', 'draft-2', 'fe-nb-new');
  });

  it('does not expose the previous draft notebook during the first render after a version switch', async () => {
    notebookApiMocks.notebooks = [
      {
        notebookId: 'fe-nb-1',
        kind: 'phase',
        metadata: {
          phase: 'feature-engineering',
          tabId: 'draft-1',
          tabName: 'Draft Pipeline v1'
        }
      },
      {
        notebookId: 'fe-nb-2',
        kind: 'phase',
        metadata: {
          phase: 'feature-engineering',
          tabId: 'draft-2',
          tabName: 'Draft Pipeline v2'
        }
      }
    ];

    const { result, rerender } = renderHook(
      (version: {
        id: string;
        name: string;
        notebookId?: string;
      }) => useFeatureNotebookSync({
        projectId: 'project-1',
        currentVersion: {
          id: version.id,
          projectId: 'project-1',
          name: version.name,
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
          notebookId: version.notebookId
        }
      }),
      {
        initialProps: {
          id: 'draft-1',
          name: 'Draft Pipeline v1',
          notebookId: 'fe-nb-1'
        }
      }
    );

    await waitFor(() => {
      expect(result.current).toEqual({
        notebookId: 'fe-nb-1',
        isReady: true
      });
    });

    rerender({
      id: 'draft-2',
      name: 'Draft Pipeline v2',
      notebookId: 'fe-nb-2'
    });

    expect(result.current).toEqual({
      notebookId: null,
      isReady: false
    });

    await waitFor(() => {
      expect(result.current).toEqual({
        notebookId: 'fe-nb-2',
        isReady: true
      });
    });
  });
});
