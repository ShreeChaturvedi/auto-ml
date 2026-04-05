import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkbookEntry } from '@/types/workbook';

import { useTrainingNotebookSync } from '../useTrainingNotebookSync';

const notebookApiMocks = vi.hoisted(() => ({
  notebooks: [] as Array<{ notebookId: string; metadata?: Record<string, unknown> }>,
  listNotebooks: vi.fn(async () => [] as Array<{ notebookId: string; metadata?: Record<string, unknown> }>),
  createNotebook: vi.fn(async () => ({ notebookId: 'created-nb', metadata: {} })),
  updateNotebook: vi.fn(async () => ({ notebookId: 'created-nb', metadata: {} }))
}));

vi.mock('@/lib/api/notebooks', () => ({
  listNotebooks: (...args: unknown[]) => (notebookApiMocks.listNotebooks as (...a: unknown[]) => unknown)(...args),
  createNotebook: (...args: unknown[]) => (notebookApiMocks.createNotebook as (...a: unknown[]) => unknown)(...args),
  updateNotebook: (...args: unknown[]) => (notebookApiMocks.updateNotebook as (...a: unknown[]) => unknown)(...args)
}));

function makeWorkbook(overrides: Partial<WorkbookEntry> = {}): WorkbookEntry {
  return {
    id: 'training-wb-1',
    name: 'Workbook 1',
    notebookId: null,
    ...overrides
  };
}

describe('useTrainingNotebookSync', () => {
  beforeEach(() => {
    notebookApiMocks.notebooks = [];
    notebookApiMocks.listNotebooks.mockReset();
    notebookApiMocks.listNotebooks.mockImplementation(async () => notebookApiMocks.notebooks);

    notebookApiMocks.createNotebook.mockReset();
    (notebookApiMocks.createNotebook as ReturnType<typeof vi.fn>).mockImplementation(
      async (_projectId: string, request: { name: string; metadata?: Record<string, unknown> }) => ({
        notebookId: 'created-training-nb',
        name: request.name,
        metadata: request.metadata ?? {}
      })
    );

    notebookApiMocks.updateNotebook.mockReset();
    (notebookApiMocks.updateNotebook as ReturnType<typeof vi.fn>).mockImplementation(
      async (notebookId: string, request: { metadata?: Record<string, unknown> }) => ({
        notebookId,
        metadata: request.metadata ?? {}
      })
    );
  });

  it('creates a training-scoped notebook when none exists for the workbook', async () => {
    const setWorkbookNotebookId = vi.fn();

    const { result } = renderHook(() => useTrainingNotebookSync({
      projectId: 'project-1',
      activeWorkbook: makeWorkbook({ id: 'training-wb-1', name: 'Workbook 1' }),
      setWorkbookNotebookId
    }));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.notebookId).toBe('created-training-nb');
    expect(notebookApiMocks.createNotebook).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        name: 'Workbook 1',
        metadata: expect.objectContaining({
          phase: 'training',
          tabId: 'training-wb-1',
          tabName: 'Workbook 1'
        })
      })
    );
    expect(setWorkbookNotebookId).toHaveBeenCalledWith('training-wb-1', 'created-training-nb');
  });

  it('reuses a bound training notebook without calling createNotebook', async () => {
    notebookApiMocks.notebooks = [
      {
        notebookId: 'bound-training-nb',
        metadata: { phase: 'training', tabId: 'training-wb-1', tabName: 'Workbook 1' }
      }
    ];
    const setWorkbookNotebookId = vi.fn();

    const { result } = renderHook(() => useTrainingNotebookSync({
      projectId: 'project-1',
      activeWorkbook: makeWorkbook({ id: 'training-wb-1', notebookId: 'bound-training-nb' }),
      setWorkbookNotebookId
    }));

    await waitFor(() => {
      expect(result.current).toEqual({ notebookId: 'bound-training-nb', isReady: true });
    });

    expect(notebookApiMocks.createNotebook).not.toHaveBeenCalled();
    expect(notebookApiMocks.updateNotebook).not.toHaveBeenCalled(); // metadata already correct — no heal needed
  });

  it('adopts an unbound training-phase notebook whose tabId matches the workbook', async () => {
    notebookApiMocks.notebooks = [
      {
        notebookId: 'orphan-training-nb',
        metadata: { phase: 'training', tabId: 'training-wb-7', tabName: 'Workbook 7' }
      }
    ];
    const setWorkbookNotebookId = vi.fn();

    const { result } = renderHook(() => useTrainingNotebookSync({
      projectId: 'project-1',
      activeWorkbook: makeWorkbook({ id: 'training-wb-7', name: 'Workbook 7' }),
      setWorkbookNotebookId
    }));

    await waitFor(() => {
      expect(result.current.notebookId).toBe('orphan-training-nb');
    });

    expect(notebookApiMocks.createNotebook).not.toHaveBeenCalled();
    expect(setWorkbookNotebookId).toHaveBeenCalledWith('training-wb-7', 'orphan-training-nb');
  });

  it('NEVER adopts a feature-engineering notebook — creates a new training notebook instead', async () => {
    // Regression guard for the carryover bug. If the user was in FE, the FE
    // notebook is visible in the list. The sync hook MUST NOT adopt it.
    notebookApiMocks.notebooks = [
      {
        notebookId: 'fe-draft-nb',
        metadata: { phase: 'feature-engineering', tabId: 'draft-1', tabName: 'Draft Pipeline v1' }
      }
    ];
    const setWorkbookNotebookId = vi.fn();

    const { result } = renderHook(() => useTrainingNotebookSync({
      projectId: 'project-1',
      activeWorkbook: makeWorkbook({ id: 'training-wb-1', name: 'Workbook 1' }),
      setWorkbookNotebookId
    }));

    await waitFor(() => {
      expect(result.current.notebookId).toBe('created-training-nb');
    });

    expect(notebookApiMocks.createNotebook).toHaveBeenCalledTimes(1);
    // Crucially, the FE notebook's metadata is NEVER written to.
    expect(notebookApiMocks.updateNotebook).not.toHaveBeenCalledWith(
      'fe-draft-nb',
      expect.anything()
    );
    // Sanity: also never adopted by the binding setter.
    expect(setWorkbookNotebookId).toHaveBeenCalledWith('training-wb-1', 'created-training-nb');
    expect(setWorkbookNotebookId).not.toHaveBeenCalledWith(expect.any(String), 'fe-draft-nb');
  });

  it('rejects a bound notebookId that now points at a feature-engineering notebook', async () => {
    // Simulates the bug scenario: workbook has a stale binding to what was
    // once its notebook but has since been repurposed (e.g., legacy state).
    // The hook must not trust the binding — it must re-validate against
    // the current metadata.
    notebookApiMocks.notebooks = [
      {
        notebookId: 'stale-nb',
        metadata: { phase: 'feature-engineering', tabId: 'draft-x' }
      }
    ];
    const setWorkbookNotebookId = vi.fn();

    const { result } = renderHook(() => useTrainingNotebookSync({
      projectId: 'project-1',
      activeWorkbook: makeWorkbook({ id: 'training-wb-1', notebookId: 'stale-nb' }),
      setWorkbookNotebookId
    }));

    await waitFor(() => {
      expect(result.current.notebookId).toBe('created-training-nb');
    });

    // Stale binding replaced with the newly created training notebook.
    expect(setWorkbookNotebookId).toHaveBeenCalledWith('training-wb-1', 'created-training-nb');
    expect(notebookApiMocks.updateNotebook).not.toHaveBeenCalledWith('stale-nb', expect.anything());
  });

  it('heals metadata drift on an adopted notebook (updates phase/tabId/tabName in place)', async () => {
    notebookApiMocks.notebooks = [
      {
        notebookId: 'legacy-nb',
        metadata: {} // unphased legacy notebook — adoptable
      }
    ];
    const setWorkbookNotebookId = vi.fn();

    const { result } = renderHook(() => useTrainingNotebookSync({
      projectId: 'project-1',
      activeWorkbook: makeWorkbook({ id: 'training-wb-1', notebookId: 'legacy-nb', name: 'Workbook 1' }),
      setWorkbookNotebookId
    }));

    await waitFor(() => {
      expect(result.current.notebookId).toBe('legacy-nb');
    });

    expect(notebookApiMocks.updateNotebook).toHaveBeenCalledWith(
      'legacy-nb',
      expect.objectContaining({
        metadata: expect.objectContaining({
          phase: 'training',
          tabId: 'training-wb-1',
          tabName: 'Workbook 1'
        })
      })
    );
  });

  it('ignores a URL deep-link pointing at a feature-engineering notebook', async () => {
    notebookApiMocks.notebooks = [
      {
        notebookId: 'fe-deep-linked',
        metadata: { phase: 'feature-engineering', tabId: 'draft-1' }
      }
    ];
    const setWorkbookNotebookId = vi.fn();

    const { result } = renderHook(() => useTrainingNotebookSync({
      projectId: 'project-1',
      activeWorkbook: makeWorkbook({ id: 'training-wb-1', name: 'Workbook 1' }),
      setWorkbookNotebookId,
      initialNotebookId: 'fe-deep-linked'
    }));

    await waitFor(() => {
      expect(result.current.notebookId).toBe('created-training-nb');
    });

    // The deep-linked FE notebook is NOT adopted and its metadata is NOT touched.
    expect(notebookApiMocks.updateNotebook).not.toHaveBeenCalledWith('fe-deep-linked', expect.anything());
    expect(setWorkbookNotebookId).not.toHaveBeenCalledWith(expect.any(String), 'fe-deep-linked');
  });

  it('adopts a URL deep-link pointing at a valid training notebook', async () => {
    notebookApiMocks.notebooks = [
      {
        notebookId: 'deep-training-nb',
        metadata: { phase: 'training', tabId: 'training-wb-1' }
      }
    ];
    const setWorkbookNotebookId = vi.fn();

    const { result } = renderHook(() => useTrainingNotebookSync({
      projectId: 'project-1',
      activeWorkbook: makeWorkbook({ id: 'training-wb-1', name: 'Workbook 1' }),
      setWorkbookNotebookId,
      initialNotebookId: 'deep-training-nb'
    }));

    await waitFor(() => {
      expect(result.current.notebookId).toBe('deep-training-nb');
    });

    expect(notebookApiMocks.createNotebook).not.toHaveBeenCalled();
    expect(setWorkbookNotebookId).toHaveBeenCalledWith('training-wb-1', 'deep-training-nb');
  });

  it('resolves a new notebook when the active workbook changes', async () => {
    notebookApiMocks.notebooks = [];
    const setWorkbookNotebookId = vi.fn();

    let callCount = 0;
    (notebookApiMocks.createNotebook as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount += 1;
      return { notebookId: `created-training-nb-${callCount}`, metadata: {} };
    });

    const { result, rerender } = renderHook(
      (props: { activeWorkbook: WorkbookEntry }) => useTrainingNotebookSync({
        projectId: 'project-1',
        activeWorkbook: props.activeWorkbook,
        setWorkbookNotebookId
      }),
      { initialProps: { activeWorkbook: makeWorkbook({ id: 'training-wb-1', name: 'Workbook 1' }) } }
    );

    await waitFor(() => {
      expect(result.current.notebookId).toBe('created-training-nb-1');
    });

    rerender({ activeWorkbook: makeWorkbook({ id: 'training-wb-2', name: 'Workbook 2' }) });

    await waitFor(() => {
      expect(result.current.notebookId).toBe('created-training-nb-2');
    });

    expect(notebookApiMocks.createNotebook).toHaveBeenCalledTimes(2);
    expect(setWorkbookNotebookId).toHaveBeenCalledWith('training-wb-1', 'created-training-nb-1');
    expect(setWorkbookNotebookId).toHaveBeenCalledWith('training-wb-2', 'created-training-nb-2');
  });

  it('clears state when projectId or activeWorkbook becomes undefined', async () => {
    const setWorkbookNotebookId = vi.fn();

    const { result, rerender } = renderHook(
      (props: { projectId: string | undefined; activeWorkbook: WorkbookEntry | undefined }) => useTrainingNotebookSync({
        projectId: props.projectId,
        activeWorkbook: props.activeWorkbook,
        setWorkbookNotebookId
      }),
      { initialProps: { projectId: 'project-1', activeWorkbook: makeWorkbook({ id: 'training-wb-1' }) } }
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    rerender({ projectId: undefined, activeWorkbook: undefined });

    await waitFor(() => {
      expect(result.current.notebookId).toBeNull();
    });
  });
});
