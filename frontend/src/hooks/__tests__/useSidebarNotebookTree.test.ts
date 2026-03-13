/**
 * useSidebarNotebookTree tests
 *
 * This hook groups project notebooks into a phase → tab → notebook tree
 * for the sidebar. The bug was that notebooks had empty metadata ({}),
 * so the filter `metadata.phase === phase` found nothing, and the sidebar
 * showed zero notebooks.
 *
 * These tests verify the grouping logic handles:
 * - Notebooks WITH correct phase metadata (the fix)
 * - Notebooks WITHOUT metadata (should be excluded — proves the bug path)
 * - Mixed grouping: tabs vs ungrouped
 * - Store sync propagation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── Mocks ─────────────────────────────────────────────────────

const listNotebooksMock = vi.fn();
vi.mock('@/lib/api/notebooks', () => ({
  listNotebooks: (...args: unknown[]) => listNotebooksMock(...args)
}));

vi.mock('@/lib/websocket/notebookClient', () => ({
  getNotebookWSClient: vi.fn(() => ({
    connect: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    isConnected: false,
    on: vi.fn(() => vi.fn())
  }))
}));

import { useNotebookStore } from '@/stores/notebookStore';
import { useSidebarNotebookTree } from '@/hooks/useSidebarNotebookTree';
import type { Notebook } from '@/types/notebook';

// ── Fixtures ──────────────────────────────────────────────────

function makeNotebook(overrides: Partial<Notebook> = {}): Notebook {
  return {
    notebookId: `nb-${Math.random().toString(36).slice(2, 6)}`,
    projectId: 'proj-1',
    name: 'Test Notebook',
    metadata: {},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe('useSidebarNotebookTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNotebookStore.getState().reset();
    listNotebooksMock.mockResolvedValue([]);
  });

  afterEach(() => {
    useNotebookStore.getState().reset();
  });

  it('returns empty nodes when no project is provided', () => {
    const { result } = renderHook(() => useSidebarNotebookTree(undefined));
    expect(result.current).toEqual([]);
  });

  it('returns three phase nodes (preprocessing, feature-engineering, training)', async () => {
    listNotebooksMock.mockResolvedValue([]);
    const { result } = renderHook(() => useSidebarNotebookTree('proj-1'));

    await waitFor(() => {
      expect(result.current).toHaveLength(3);
    });

    const phases = result.current.map((n) => n.phase);
    expect(phases).toEqual(['preprocessing', 'feature-engineering', 'training']);
  });

  // ── THIS IS THE BUG SCENARIO ────────────────────────────────
  // Notebooks with empty metadata should NOT appear in any phase group.
  // This is exactly what happened before the fix.

  it('notebooks with empty metadata are excluded from all phases', async () => {
    const orphan = makeNotebook({ metadata: {} });
    listNotebooksMock.mockResolvedValue([orphan]);

    const { result } = renderHook(() => useSidebarNotebookTree('proj-1'));

    await waitFor(() => {
      expect(listNotebooksMock).toHaveBeenCalledWith('proj-1');
    });

    for (const node of result.current) {
      expect(node.tabs).toHaveLength(0);
      expect(node.notebooks).toHaveLength(0);
    }
  });

  // ── CORRECT METADATA PATH ───────────────────────────────────

  it('groups preprocessing notebooks by tabId', async () => {
    const nb1 = makeNotebook({
      notebookId: 'nb-1',
      name: 'Processing 1',
      metadata: { phase: 'preprocessing', tabId: 'tab-a', tabName: 'Processing 1' }
    });
    const nb2 = makeNotebook({
      notebookId: 'nb-2',
      name: 'Processing 2',
      metadata: { phase: 'preprocessing', tabId: 'tab-b', tabName: 'Processing 2' }
    });
    listNotebooksMock.mockResolvedValue([nb1, nb2]);

    const { result } = renderHook(() => useSidebarNotebookTree('proj-1'));

    await waitFor(() => {
      const preprocessing = result.current.find((n) => n.phase === 'preprocessing');
      expect(preprocessing!.tabs).toHaveLength(2);
    });

    const preprocessing = result.current.find((n) => n.phase === 'preprocessing')!;
    expect(preprocessing.tabs[0].tabId).toBe('tab-a');
    expect(preprocessing.tabs[0].notebooks).toHaveLength(1);
    expect(preprocessing.tabs[0].notebooks[0].notebookId).toBe('nb-1');
    expect(preprocessing.tabs[1].tabId).toBe('tab-b');
    expect(preprocessing.notebooks).toHaveLength(0); // none ungrouped
  });

  it('puts preprocessing notebooks without tabId into ungrouped list', async () => {
    const nbWithTab = makeNotebook({
      notebookId: 'nb-1',
      metadata: { phase: 'preprocessing', tabId: 'tab-a', tabName: 'Tab A' }
    });
    const nbWithoutTab = makeNotebook({
      notebookId: 'nb-2',
      metadata: { phase: 'preprocessing' } // no tabId
    });
    listNotebooksMock.mockResolvedValue([nbWithTab, nbWithoutTab]);

    const { result } = renderHook(() => useSidebarNotebookTree('proj-1'));

    await waitFor(() => {
      const preprocessing = result.current.find((n) => n.phase === 'preprocessing');
      expect(preprocessing!.tabs).toHaveLength(1);
      expect(preprocessing!.notebooks).toHaveLength(1);
    });

    const preprocessing = result.current.find((n) => n.phase === 'preprocessing')!;
    expect(preprocessing.notebooks[0].notebookId).toBe('nb-2');
  });

  it('puts training notebooks in flat list (no tab grouping)', async () => {
    const nb1 = makeNotebook({
      notebookId: 'nb-t1',
      metadata: { phase: 'training' }
    });
    const nb2 = makeNotebook({
      notebookId: 'nb-t2',
      metadata: { phase: 'training' }
    });
    listNotebooksMock.mockResolvedValue([nb1, nb2]);

    const { result } = renderHook(() => useSidebarNotebookTree('proj-1'));

    await waitFor(() => {
      const training = result.current.find((n) => n.phase === 'training');
      expect(training!.notebooks).toHaveLength(2);
    });

    const training = result.current.find((n) => n.phase === 'training')!;
    expect(training.tabs).toHaveLength(0);
    expect(training.notebooks.map((nb) => nb.notebookId)).toEqual(['nb-t1', 'nb-t2']);
  });

  it('groups feature-engineering notebooks the same way as preprocessing', async () => {
    const nb = makeNotebook({
      notebookId: 'nb-fe',
      metadata: { phase: 'feature-engineering', tabId: 'fe-tab-1', tabName: 'FE Tab 1' }
    });
    listNotebooksMock.mockResolvedValue([nb]);

    const { result } = renderHook(() => useSidebarNotebookTree('proj-1'));

    await waitFor(() => {
      const fe = result.current.find((n) => n.phase === 'feature-engineering');
      expect(fe!.tabs).toHaveLength(1);
    });

    const fe = result.current.find((n) => n.phase === 'feature-engineering')!;
    expect(fe.tabs[0].tabId).toBe('fe-tab-1');
    expect(fe.tabs[0].tabName).toBe('FE Tab 1');
  });

  it('correctly isolates notebooks across different phases', async () => {
    const preNb = makeNotebook({
      notebookId: 'nb-pre',
      metadata: { phase: 'preprocessing', tabId: 'tab-1', tabName: 'Tab 1' }
    });
    const trainNb = makeNotebook({
      notebookId: 'nb-train',
      metadata: { phase: 'training' }
    });
    const feNb = makeNotebook({
      notebookId: 'nb-fe',
      metadata: { phase: 'feature-engineering', tabId: 'fe-1', tabName: 'FE 1' }
    });
    listNotebooksMock.mockResolvedValue([preNb, trainNb, feNb]);

    const { result } = renderHook(() => useSidebarNotebookTree('proj-1'));

    await waitFor(() => {
      expect(result.current.find((n) => n.phase === 'preprocessing')!.tabs).toHaveLength(1);
    });

    const pre = result.current.find((n) => n.phase === 'preprocessing')!;
    const train = result.current.find((n) => n.phase === 'training')!;
    const fe = result.current.find((n) => n.phase === 'feature-engineering')!;

    expect(pre.tabs).toHaveLength(1);
    expect(pre.tabs[0].notebooks[0].notebookId).toBe('nb-pre');
    expect(train.notebooks).toHaveLength(1);
    expect(train.notebooks[0].notebookId).toBe('nb-train');
    expect(fe.tabs).toHaveLength(1);
    expect(fe.tabs[0].notebooks[0].notebookId).toBe('nb-fe');
  });

  // ── STORE SYNC ──────────────────────────────────────────────
  // When the notebook store updates (e.g., after reconciliation),
  // the sidebar should reflect the new data without another API call.

  it('syncs from notebook store when store project matches', async () => {
    listNotebooksMock.mockResolvedValue([]);

    const { result } = renderHook(() => useSidebarNotebookTree('proj-1'));

    // Initially empty
    await waitFor(() => {
      expect(listNotebooksMock).toHaveBeenCalledWith('proj-1');
    });

    // Simulate store getting updated (as happens after tab-notebook reconciliation)
    const nbWithMeta = makeNotebook({
      notebookId: 'nb-synced',
      projectId: 'proj-1',
      metadata: { phase: 'preprocessing', tabId: 'synced-tab', tabName: 'Synced' }
    });

    act(() => {
      useNotebookStore.setState({
        currentProjectId: 'proj-1',
        notebooks: [nbWithMeta]
      });
    });

    await waitFor(() => {
      const preprocessing = result.current.find((n) => n.phase === 'preprocessing');
      expect(preprocessing!.tabs).toHaveLength(1);
      expect(preprocessing!.tabs[0].notebooks[0].notebookId).toBe('nb-synced');
    });
  });

  it('does NOT sync from store when store project differs', async () => {
    const nbForOtherProject = makeNotebook({
      notebookId: 'nb-other',
      projectId: 'proj-other',
      metadata: { phase: 'preprocessing', tabId: 'x', tabName: 'X' }
    });

    listNotebooksMock.mockResolvedValue([]);

    const { result } = renderHook(() => useSidebarNotebookTree('proj-1'));

    await waitFor(() => {
      expect(listNotebooksMock).toHaveBeenCalledWith('proj-1');
    });

    // Store updates for a different project
    act(() => {
      useNotebookStore.setState({
        currentProjectId: 'proj-other',
        notebooks: [nbForOtherProject]
      });
    });

    // Should still show nothing for proj-1
    const preprocessing = result.current.find((n) => n.phase === 'preprocessing');
    expect(preprocessing!.tabs).toHaveLength(0);
    expect(preprocessing!.notebooks).toHaveLength(0);
  });

  // ── MULTIPLE NOTEBOOKS PER TAB ──────────────────────────────

  it('groups multiple notebooks under the same tab', async () => {
    const nb1 = makeNotebook({
      notebookId: 'nb-1',
      name: 'NB 1',
      metadata: { phase: 'preprocessing', tabId: 'shared-tab', tabName: 'Shared' }
    });
    const nb2 = makeNotebook({
      notebookId: 'nb-2',
      name: 'NB 2',
      metadata: { phase: 'preprocessing', tabId: 'shared-tab', tabName: 'Shared' }
    });
    listNotebooksMock.mockResolvedValue([nb1, nb2]);

    const { result } = renderHook(() => useSidebarNotebookTree('proj-1'));

    await waitFor(() => {
      const preprocessing = result.current.find((n) => n.phase === 'preprocessing');
      expect(preprocessing!.tabs).toHaveLength(1);
      expect(preprocessing!.tabs[0].notebooks).toHaveLength(2);
    });
  });

  it('uses tabId as tabName fallback when tabName is missing', async () => {
    const nb = makeNotebook({
      notebookId: 'nb-1',
      metadata: { phase: 'preprocessing', tabId: 'fallback-id' } // no tabName
    });
    listNotebooksMock.mockResolvedValue([nb]);

    const { result } = renderHook(() => useSidebarNotebookTree('proj-1'));

    await waitFor(() => {
      const preprocessing = result.current.find((n) => n.phase === 'preprocessing');
      expect(preprocessing!.tabs).toHaveLength(1);
      expect(preprocessing!.tabs[0].tabName).toBe('fallback-id');
    });
  });
});
