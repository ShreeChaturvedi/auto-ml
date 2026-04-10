/**
 * useInsightActions tests — focused coverage of the `notebook` action branch
 * which must:
 *  1. Seed pending insight context BEFORE creating the notebook (so the
 *     editor picks it up on first mount).
 *  2. Create a STANDALONE notebook via the API.
 *  3. Navigate to /project/:id/data-viewer.
 *  4. Open the new notebook as a tab via `useDataStore.openNotebookTab`.
 *
 * The error path must clear the pending context and surface a toast.
 */

import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { InsightAction } from '@/components/data/eda/edaInsights';

// ── Mocks ─────────────────────────────────────────────────────

const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

const notebookApiMocks = vi.hoisted(() => ({
  createNotebook: vi.fn(),
}));
vi.mock('@/lib/api/notebooks', () => ({
  createNotebook: (...args: unknown[]) => notebookApiMocks.createNotebook(...args),
}));

const insightNavMocks = vi.hoisted(() => ({
  setPendingInsightContext: vi.fn(),
  clearPendingContext: vi.fn(),
}));
vi.mock('@/stores/insightNavigationStore', () => {
  const state = () => ({
    setPendingInsightContext: insightNavMocks.setPendingInsightContext,
    clearPendingContext: insightNavMocks.clearPendingContext,
  });
  return {
    useInsightNavigationStore: Object.assign(
      (selector: (s: unknown) => unknown) => selector(state()),
      { getState: state }
    ),
  };
});

const dataStoreMocks = vi.hoisted(() => ({
  openNotebookTab: vi.fn(),
}));
vi.mock('@/stores/dataStore', () => {
  const state = () => ({
    openNotebookTab: dataStoreMocks.openNotebookTab,
  });
  return {
    useDataStore: Object.assign(
      (selector: (s: unknown) => unknown) => selector(state()),
      { getState: state }
    ),
  };
});

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: toastMocks,
}));

// Import AFTER mocks.
import { useInsightActions } from '../useInsightActions';

// ── Helpers ───────────────────────────────────────────────────

function makeNotebookAction(): InsightAction {
  return {
    type: 'notebook',
    columns: ['age', 'income'],
    issueType: 'missing',
    severity: 'high',
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe('useInsightActions — notebook branch', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    notebookApiMocks.createNotebook.mockReset();
    insightNavMocks.setPendingInsightContext.mockReset();
    insightNavMocks.clearPendingContext.mockReset();
    dataStoreMocks.openNotebookTab.mockReset();
    toastMocks.error.mockReset();
    toastMocks.success.mockReset();
  });

  it('seeds context first, creates a standalone notebook, navigates, and opens the tab', async () => {
    notebookApiMocks.createNotebook.mockResolvedValue({
      notebookId: 'created-scratch-nb',
      kind: 'standalone',
    });

    const { result } = renderHook(() =>
      useInsightActions({
        projectId: 'proj-42',
        tableName: 'customers',
        datasetSchema: [
          { column: 'age', dtype: 'int' },
          { column: 'income', dtype: 'float' },
        ],
      })
    );

    await act(async () => {
      await result.current.handleInsightAction(makeNotebookAction());
    });

    // 1) Pending context seeded BEFORE the create call.
    expect(insightNavMocks.setPendingInsightContext).toHaveBeenCalledTimes(1);
    expect(notebookApiMocks.createNotebook).toHaveBeenCalledTimes(1);
    const seedOrder =
      insightNavMocks.setPendingInsightContext.mock.invocationCallOrder[0];
    const createOrder = notebookApiMocks.createNotebook.mock.invocationCallOrder[0];
    expect(seedOrder).toBeLessThan(createOrder);

    // The seeded context includes the action details and table name.
    const seededCtx = insightNavMocks.setPendingInsightContext.mock.calls[0][0];
    expect(seededCtx).toMatchObject({
      columns: ['age', 'income'],
      issueType: 'missing',
      severity: 'high',
      tableName: 'customers',
      datasetSchema: [
        { column: 'age', dtype: 'int' },
        { column: 'income', dtype: 'float' },
      ],
    });

    // 2) createNotebook called with kind: 'standalone' and a descriptive name.
    expect(notebookApiMocks.createNotebook).toHaveBeenCalledWith(
      'proj-42',
      expect.objectContaining({
        kind: 'standalone',
        name: expect.stringContaining('age, income'),
      })
    );
    // The label is truncated to 120 chars.
    const createReq = notebookApiMocks.createNotebook.mock.calls[0][1];
    expect(createReq.name.length).toBeLessThanOrEqual(120);

    // 3) Navigation to the data viewer.
    expect(navigateMock).toHaveBeenCalledWith('/project/proj-42/data-viewer');

    // 4) New notebook opened as a tab via the data store.
    expect(dataStoreMocks.openNotebookTab).toHaveBeenCalledWith('created-scratch-nb');

    // No error path side-effects.
    expect(insightNavMocks.clearPendingContext).not.toHaveBeenCalled();
    expect(toastMocks.error).not.toHaveBeenCalled();
  });

  it('clears the pending context and toasts when createNotebook fails', async () => {
    notebookApiMocks.createNotebook.mockRejectedValue(new Error('backend down'));

    const { result } = renderHook(() =>
      useInsightActions({
        projectId: 'proj-err',
        tableName: 'orders',
      })
    );

    await act(async () => {
      await result.current.handleInsightAction(makeNotebookAction());
    });

    expect(insightNavMocks.setPendingInsightContext).toHaveBeenCalledTimes(1);
    expect(insightNavMocks.clearPendingContext).toHaveBeenCalledTimes(1);
    expect(toastMocks.error).toHaveBeenCalledWith('Failed to open insight in notebook');
    expect(navigateMock).not.toHaveBeenCalled();
    expect(dataStoreMocks.openNotebookTab).not.toHaveBeenCalled();
  });

  it('surfaces an error toast and does nothing when projectId is missing', async () => {
    const { result } = renderHook(() =>
      useInsightActions({
        projectId: undefined,
        tableName: 'customers',
      })
    );

    await act(async () => {
      await result.current.handleInsightAction(makeNotebookAction());
    });

    expect(toastMocks.error).toHaveBeenCalledWith('No project context for notebook generation');
    expect(notebookApiMocks.createNotebook).not.toHaveBeenCalled();
    expect(insightNavMocks.setPendingInsightContext).not.toHaveBeenCalled();
  });
});
