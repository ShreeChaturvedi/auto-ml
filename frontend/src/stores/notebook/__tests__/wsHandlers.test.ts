/**
 * wsHandlers tests
 *
 * Focused coverage of the `notebook:cells_reset` guard which must reject
 * messages for any notebook other than the currently active one. Without
 * this guard, a stale savepoint restore for notebook B could clobber the
 * cells of notebook A after the user has switched tabs.
 *
 * Rather than mocking the full NotebookWSClient + Zustand store, we invoke
 * `setupWSHandlers` against a minimal fake client that captures registered
 * handlers keyed by event name, then call them directly.
 */

import { describe, expect, it, vi } from 'vitest';

import type { NotebookWSClient } from '@/lib/websocket/notebookClient';
import type { NotebookCell } from '@/types/notebook';
import { setupWSHandlers } from '../wsHandlers';

type Handler = (msg: unknown) => void;

function makeFakeClient() {
  const handlers = new Map<string, Handler>();
  const client = {
    on: vi.fn((event: string, cb: Handler) => {
      handlers.set(event, cb);
      return () => handlers.delete(event);
    }),
  } as unknown as NotebookWSClient;
  return { client, handlers };
}

function makeCell(overrides: Partial<NotebookCell> = {}): NotebookCell {
  return {
    cellId: 'cell-1',
    notebookId: 'nb-A',
    cellType: 'code',
    title: null,
    content: 'print(1)',
    position: 0,
    metadata: {},
    executionCount: 0,
    executionOrder: undefined,
    executionStatus: 'idle',
    executionDurationMs: null,
    executedAt: null,
    isDirty: false,
    output: [],
    outputRefs: [],
    lockedBy: null,
    lockedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('wsHandlers — notebook:cells_reset', () => {
  it('rejects cells_reset messages targeting a different notebook', () => {
    const originalCells: NotebookCell[] = [
      makeCell({ cellId: 'a-1', notebookId: 'nb-A', position: 0, content: 'keep me' }),
      makeCell({ cellId: 'a-2', notebookId: 'nb-A', position: 1, content: 'keep me too' }),
    ];

    // Mutable state backing the fake `get`/`set` pair.
    const state = {
      activeNotebookId: 'nb-A' as string | null,
      cells: originalCells,
    };
    const get = () => ({
      activeNotebookId: state.activeNotebookId,
      cells: state.cells,
      updateCellLocally: vi.fn(),
      removeCellLocally: vi.fn(),
      setCellLock: vi.fn(),
      clearCellLock: vi.fn(),
    });
    const set = vi.fn((partial: unknown) => {
      if (typeof partial === 'function') {
        const next = (partial as (s: { cells: NotebookCell[] }) => { cells: NotebookCell[] })({ cells: state.cells });
        if (next && Array.isArray(next.cells)) state.cells = next.cells;
      } else if (partial && typeof partial === 'object' && 'cells' in partial) {
        state.cells = (partial as { cells: NotebookCell[] }).cells;
      }
    });

    const { client, handlers } = makeFakeClient();
    setupWSHandlers(client, get, set);

    const resetHandler = handlers.get('notebook:cells_reset');
    expect(resetHandler).toBeDefined();

    // Dispatch a reset targeting notebook B (different from active nb-A).
    resetHandler!({
      type: 'notebook:cells_reset',
      notebookId: 'nb-B',
      cells: [makeCell({ cellId: 'b-1', notebookId: 'nb-B', position: 0, content: 'intruder' })],
    });

    // State for nb-A must be untouched.
    expect(state.cells).toBe(originalCells);
    expect(state.cells).toHaveLength(2);
    expect(state.cells.map((c) => c.cellId)).toEqual(['a-1', 'a-2']);
  });

  it('accepts cells_reset messages for the active notebook', () => {
    const state = {
      activeNotebookId: 'nb-A' as string | null,
      cells: [
        makeCell({ cellId: 'a-1', notebookId: 'nb-A', position: 0, content: 'old' }),
      ] as NotebookCell[],
    };
    const get = () => ({
      activeNotebookId: state.activeNotebookId,
      cells: state.cells,
      updateCellLocally: vi.fn(),
      removeCellLocally: vi.fn(),
      setCellLock: vi.fn(),
      clearCellLock: vi.fn(),
    });
    const set = vi.fn((partial: unknown) => {
      if (typeof partial === 'function') {
        const next = (partial as (s: { cells: NotebookCell[] }) => { cells: NotebookCell[] })({ cells: state.cells });
        if (next && Array.isArray(next.cells)) state.cells = next.cells;
      } else if (partial && typeof partial === 'object' && 'cells' in partial) {
        state.cells = (partial as { cells: NotebookCell[] }).cells;
      }
    });

    const { client, handlers } = makeFakeClient();
    setupWSHandlers(client, get, set);

    const resetHandler = handlers.get('notebook:cells_reset');
    expect(resetHandler).toBeDefined();

    resetHandler!({
      type: 'notebook:cells_reset',
      notebookId: 'nb-A',
      cells: [
        makeCell({ cellId: 'new-1', notebookId: 'nb-A', position: 0, content: 'fresh' }),
        makeCell({ cellId: 'new-2', notebookId: 'nb-A', position: 1, content: 'second' }),
      ],
    });

    // Cells for the active notebook must have been replaced.
    expect(state.cells.map((c) => c.cellId)).toEqual(['new-1', 'new-2']);
  });
});
