import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotebookCell, ExecutionResult, CellOutput } from '../../types/notebook';
import { useNotebookStore } from '../notebookStore';
import {
  selectCodeCells,
  selectMarkdownCells,
  selectCellById,
  selectHasAiLockedCells
} from '../notebookStore';

const notebookWsClientMock = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  isConnected: false,
  on: vi.fn(() => vi.fn())
}));

// ============================================================
// Mocks
// ============================================================

vi.mock('../../lib/api/notebooks', () => ({
  runCell: vi.fn(),
  listNotebooks: vi.fn(),
  listCells: vi.fn(),
  getCell: vi.fn(),
  createCell: vi.fn(),
  updateCell: vi.fn(),
  deleteCell: vi.fn(),
  createNotebook: vi.fn(),
  updateNotebook: vi.fn(),
  deleteNotebook: vi.fn(),
  reorderCells: vi.fn(),
  getCellLock: vi.fn(),
  interruptKernel: vi.fn(),
  restartKernel: vi.fn(),
  getCellOutputUrl: vi.fn(),
  parseOutputRefUrl: vi.fn(),
  getPythonCompletions: vi.fn()
}));

vi.mock('../../lib/websocket/notebookClient', () => ({
  getNotebookWSClient: vi.fn(() => notebookWsClientMock)
}));

// Import the mocked modules so we can control return values
import * as notebooksApi from '../../lib/api/notebooks';

const listNotebooksMock = vi.mocked(notebooksApi.listNotebooks);
const listCellsMock = vi.mocked(notebooksApi.listCells);
const runCellMock = vi.mocked(notebooksApi.runCell);
const getCellMock = vi.mocked(notebooksApi.getCell);

// ============================================================
// Helpers
// ============================================================

function makeCellFixture(overrides: Partial<NotebookCell> = {}): NotebookCell {
  return {
    cellId: 'cell-1',
    notebookId: 'nb-1',
    cellType: 'code',
    title: null,
    content: 'print("hello")',
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
    ...overrides
  };
}

function seedCells(cells: NotebookCell[]) {
  // Seed an active notebook too so updateCellLocally's stale guard accepts
  // writes — it now requires a matching activeNotebookId. Tests that don't
  // care about a specific notebook rely on the default fixture's 'nb-1'.
  const activeNotebookId = cells[0]?.notebookId ?? 'nb-1';
  useNotebookStore.setState({ cells, activeNotebookId });
}

// ============================================================
// Tests
// ============================================================

describe('notebookStore', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    useNotebookStore.getState().reset();
    vi.clearAllMocks();
    notebookWsClientMock.isConnected = false;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // ==========================================================
  // Session lifecycle
  // ==========================================================
  describe('disconnect', () => {
    it('closes the websocket client when leaving a notebook-backed phase', async () => {
      listNotebooksMock.mockResolvedValue([
        {
          notebookId: 'nb-1',
          projectId: 'proj-1',
          name: 'Notebook 1',
          kind: 'phase',
          metadata: {},
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z'
        }
      ]);
      listCellsMock.mockResolvedValue([]);
      notebookWsClientMock.isConnected = true;

      await useNotebookStore.getState().initializeNotebook('proj-1');
      useNotebookStore.getState().disconnect();

      expect(notebookWsClientMock.unsubscribe).toHaveBeenCalledWith('nb-1');
      expect(notebookWsClientMock.disconnect).toHaveBeenCalledTimes(1);
      expect(useNotebookStore.getState().wsClient).toBeNull();
      expect(useNotebookStore.getState().isConnected).toBe(false);
    });

    it('ignores archived phase notebooks when selecting the default active notebook on initialize', async () => {
      listNotebooksMock.mockResolvedValue([
        {
          notebookId: 'archived-training-nb',
          projectId: 'proj-1',
          name: 'Workbook 2',
          kind: 'phase',
          metadata: { phase: 'archived', archivedFromPhase: 'training' },
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z'
        },
        {
          notebookId: 'preprocessing-nb',
          projectId: 'proj-1',
          name: 'Workbook 1',
          kind: 'phase',
          metadata: { phase: 'preprocessing', tabId: 'prep-1' },
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z'
        }
      ]);
      listCellsMock.mockResolvedValue([]);
      notebookWsClientMock.isConnected = true;

      await useNotebookStore.getState().initializeNotebook('proj-1');

      expect(useNotebookStore.getState().activeNotebookId).toBe('preprocessing-nb');
      expect(useNotebookStore.getState().notebook?.notebookId).toBe('preprocessing-nb');
    });
  });

  // ==========================================================
  // runCell
  // ==========================================================
  describe('runCell', () => {
    it('sets status to running, then to success with outputs after API resolves', async () => {
      const cell = makeCellFixture({ cellId: 'cell-1', executionStatus: 'idle' });
      seedCells([cell]);

      const executionResult: ExecutionResult = {
        status: 'success',
        stdout: 'hello\n',
        stderr: '',
        outputs: [{ type: 'text', content: 'hello\n' }],
        executionMs: 42,
        executionOrder: 1
      };

      // Make runCell resolve after a tick so we can observe intermediate state
      let resolveRun!: (val: ExecutionResult) => void;
      runCellMock.mockReturnValue(new Promise((r) => { resolveRun = r; }));
      getCellMock.mockResolvedValue({
        ...cell,
        executionStatus: 'success',
        output: [{ type: 'text', content: 'hello\n' }],
        executionOrder: 1,
        executionDurationMs: 42,
        isDirty: false
      });

      const runPromise = useNotebookStore.getState().runCell('cell-1', 'proj-1');

      // After kicking off, status should be 'running'
      const runningCell = useNotebookStore.getState().cells.find((c) => c.cellId === 'cell-1');
      expect(runningCell?.executionStatus).toBe('running');
      expect(runningCell?.executionDurationMs).toBeNull();

      // Resolve the API call
      resolveRun(executionResult);
      await runPromise;

      const finalCell = useNotebookStore.getState().cells.find((c) => c.cellId === 'cell-1');
      expect(finalCell?.executionStatus).toBe('success');
      expect(finalCell?.output).toEqual([{ type: 'text', content: 'hello\n' }]);
    });

    it('sets status to error with error message when API throws', async () => {
      const cell = makeCellFixture({ cellId: 'cell-2' });
      seedCells([cell]);

      runCellMock.mockRejectedValue(new Error('Kernel crashed'));

      await useNotebookStore.getState().runCell('cell-2', 'proj-1');

      const errorCell = useNotebookStore.getState().cells.find((c) => c.cellId === 'cell-2');
      expect(errorCell?.executionStatus).toBe('error');
    });

    it('populates output with error type when API throws', async () => {
      const cell = makeCellFixture({ cellId: 'cell-3' });
      seedCells([cell]);

      runCellMock.mockRejectedValue(new Error('Timeout exceeded'));

      await useNotebookStore.getState().runCell('cell-3', 'proj-1');

      const errorCell = useNotebookStore.getState().cells.find((c) => c.cellId === 'cell-3');
      expect(errorCell?.output).toHaveLength(1);

      const errorOutput = errorCell?.output[0] as CellOutput;
      expect(errorOutput.type).toBe('error');
      expect(errorOutput.content).toBe('Timeout exceeded');
    });

    it('sets executionOrder from the run result', async () => {
      const cell = makeCellFixture({ cellId: 'cell-4' });
      seedCells([cell]);

      const executionResult: ExecutionResult = {
        status: 'success',
        stdout: '',
        stderr: '',
        outputs: [],
        executionMs: 10,
        executionOrder: 7
      };

      runCellMock.mockResolvedValue(executionResult);
      getCellMock.mockResolvedValue({
        ...cell,
        executionStatus: 'success',
        output: [],
        executionOrder: 7,
        executionDurationMs: 10,
        isDirty: false
      });

      await useNotebookStore.getState().runCell('cell-4', 'proj-1');

      const updatedCell = useNotebookStore.getState().cells.find((c) => c.cellId === 'cell-4');
      expect(updatedCell?.executionOrder).toBe(7);
    });

    it('sets executionDurationMs from the run result', async () => {
      const cell = makeCellFixture({ cellId: 'cell-5' });
      seedCells([cell]);

      const executionResult: ExecutionResult = {
        status: 'success',
        stdout: '',
        stderr: '',
        outputs: [],
        executionMs: 1234,
        executionOrder: 2
      };

      runCellMock.mockResolvedValue(executionResult);
      getCellMock.mockResolvedValue({
        ...cell,
        executionStatus: 'success',
        output: [],
        executionOrder: 2,
        executionDurationMs: 1234,
        isDirty: false
      });

      await useNotebookStore.getState().runCell('cell-5', 'proj-1');

      const updatedCell = useNotebookStore.getState().cells.find((c) => c.cellId === 'cell-5');
      expect(updatedCell?.executionDurationMs).toBe(1234);
    });
  });

  // ==========================================================
  // Cell state management
  // ==========================================================
  describe('updateCellLocally', () => {
    it('adds a new cell when it does not exist', () => {
      seedCells([]);

      const newCell = makeCellFixture({ cellId: 'new-cell', position: 0 });
      useNotebookStore.getState().updateCellLocally(newCell);

      const cells = useNotebookStore.getState().cells;
      expect(cells).toHaveLength(1);
      expect(cells[0].cellId).toBe('new-cell');
    });

    it('updates an existing cell in place', () => {
      const existing = makeCellFixture({ cellId: 'cell-x', content: 'old' });
      seedCells([existing]);

      const updated = makeCellFixture({ cellId: 'cell-x', content: 'new', position: 0 });
      useNotebookStore.getState().updateCellLocally(updated);

      const cells = useNotebookStore.getState().cells;
      expect(cells).toHaveLength(1);
      expect(cells[0].content).toBe('new');
    });

    it('adjusts positions of existing cells when inserting a new cell', () => {
      const cellA = makeCellFixture({ cellId: 'a', position: 0 });
      const cellB = makeCellFixture({ cellId: 'b', position: 1 });
      seedCells([cellA, cellB]);

      const inserted = makeCellFixture({ cellId: 'c', position: 1 });
      useNotebookStore.getState().updateCellLocally(inserted);

      const cells = useNotebookStore.getState().cells;
      expect(cells).toHaveLength(3);

      const posMap = Object.fromEntries(cells.map((c) => [c.cellId, c.position]));
      expect(posMap['a']).toBe(0);
      expect(posMap['c']).toBe(1);
      expect(posMap['b']).toBe(2);
    });

    it('drops writes when the cell belongs to a different notebook than active', () => {
      // Stale-guard regression: an in-flight API response or WS event for
      // notebook B that lands after the user switched to notebook A must not
      // leak into A's cell list.
      const cellFromA = makeCellFixture({ cellId: 'a-1', notebookId: 'nb-A', position: 0 });
      useNotebookStore.setState({ cells: [cellFromA], activeNotebookId: 'nb-A' });

      const cellFromB = makeCellFixture({
        cellId: 'b-1',
        notebookId: 'nb-B',
        position: 0,
        content: 'from nb-B'
      });
      useNotebookStore.getState().updateCellLocally(cellFromB);

      const cells = useNotebookStore.getState().cells;
      expect(cells).toHaveLength(1);
      expect(cells[0].cellId).toBe('a-1');
      expect(cells.some((c) => c.cellId === 'b-1')).toBe(false);
    });

    it('drops writes when activeNotebookId is null', () => {
      // During disconnect/reconnect activeNotebookId may briefly be null.
      // Any late-arriving cell update must be dropped.
      useNotebookStore.setState({ cells: [], activeNotebookId: null });

      const incoming = makeCellFixture({ cellId: 'late', notebookId: 'nb-1', position: 0 });
      useNotebookStore.getState().updateCellLocally(incoming);

      expect(useNotebookStore.getState().cells).toHaveLength(0);
      expect(useNotebookStore.getState().activeNotebookId).toBeNull();
    });
  });

  // ==========================================================
  // runAllCells
  // ==========================================================
  describe('runAllCells', () => {
    it('stops iterating once the abort signal fires', async () => {
      const cellA = makeCellFixture({ cellId: 'ra-a', position: 0, notebookId: 'nb-run' });
      const cellB = makeCellFixture({ cellId: 'ra-b', position: 1, notebookId: 'nb-run' });
      const cellC = makeCellFixture({ cellId: 'ra-c', position: 2, notebookId: 'nb-run' });
      useNotebookStore.setState({
        cells: [cellA, cellB, cellC],
        activeNotebookId: 'nb-run',
        notebook: { notebookId: 'nb-run' } as never
      });

      const controller = new AbortController();
      const runCalls: string[] = [];

      runCellMock.mockImplementation(async () => {
        // Abort after the first cell has begun, before the loop moves on.
        controller.abort();
        return {
          status: 'success',
          stdout: '',
          stderr: '',
          outputs: [],
          executionMs: 1,
          executionOrder: runCalls.length + 1
        };
      });
      getCellMock.mockImplementation(async (cellId: string) => {
        runCalls.push(cellId);
        return makeCellFixture({
          cellId,
          notebookId: 'nb-run',
          position: [cellA, cellB, cellC].find((c) => c.cellId === cellId)?.position ?? 0,
          executionStatus: 'success'
        });
      });

      await useNotebookStore.getState().runAllCells('proj-1', controller.signal);

      // Only the first code cell should have been executed before the abort broke the loop.
      expect(runCellMock).toHaveBeenCalledTimes(1);
      expect(runCellMock).toHaveBeenCalledWith('ra-a', 'proj-1');
      // runAllRunningCellId is cleared in the finally block.
      expect(useNotebookStore.getState().runAllRunningCellId).toBeNull();
    });

    it('stops iterating on the first errored cell', async () => {
      const cellA = makeCellFixture({ cellId: 'er-a', position: 0, notebookId: 'nb-err' });
      const cellB = makeCellFixture({ cellId: 'er-b', position: 1, notebookId: 'nb-err' });
      const cellC = makeCellFixture({ cellId: 'er-c', position: 2, notebookId: 'nb-err' });
      useNotebookStore.setState({
        cells: [cellA, cellB, cellC],
        activeNotebookId: 'nb-err',
        notebook: { notebookId: 'nb-err' } as never
      });

      // The first runCell call rejects — runCell's own catch block sets the
      // cell's executionStatus to 'error' synchronously, which runAllCells
      // uses to halt further execution.
      runCellMock.mockRejectedValueOnce(new Error('boom'));

      const controller = new AbortController();
      await useNotebookStore.getState().runAllCells('proj-1', controller.signal);

      // Loop must stop after the first cell — second and third never run.
      expect(runCellMock).toHaveBeenCalledTimes(1);
      expect(runCellMock).toHaveBeenCalledWith('er-a', 'proj-1');
      expect(useNotebookStore.getState().runAllRunningCellId).toBeNull();

      const finalA = useNotebookStore.getState().cells.find((c) => c.cellId === 'er-a');
      expect(finalA?.executionStatus).toBe('error');
    });
  });

  describe('disconnect', () => {
    it('closes the active websocket client and clears it from store state', () => {
      useNotebookStore.setState({
        notebook: { notebookId: 'nb-1' } as never,
        wsClient: {
          unsubscribe: notebookWsClientMock.unsubscribe,
          disconnect: notebookWsClientMock.disconnect
        } as never,
        currentProjectId: 'project-1',
        activeNotebookId: 'nb-1',
        isConnected: true,
      });

      useNotebookStore.getState().disconnect();

      expect(notebookWsClientMock.unsubscribe).toHaveBeenCalledWith('nb-1');
      expect(notebookWsClientMock.disconnect).toHaveBeenCalledTimes(1);
      expect(useNotebookStore.getState().wsClient).toBeNull();
      expect(useNotebookStore.getState().activeNotebookId).toBeNull();
      expect(useNotebookStore.getState().isConnected).toBe(false);
    });
  });

  describe('loadNotebooks', () => {
    it('does not fall back to an archived phase notebook when refreshing the notebook list', async () => {
      useNotebookStore.setState({
        currentProjectId: 'proj-1',
        activeNotebookId: null,
        notebook: null
      });
      listNotebooksMock.mockResolvedValue([
        {
          notebookId: 'archived-training-nb',
          projectId: 'proj-1',
          name: 'Workbook 3',
          kind: 'phase',
          metadata: { phase: 'archived', archivedFromPhase: 'training' },
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z'
        },
        {
          notebookId: 'training-nb',
          projectId: 'proj-1',
          name: 'Workbook 1',
          kind: 'phase',
          metadata: { phase: 'training', tabId: 'training-wb-1' },
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z'
        }
      ]);

      await useNotebookStore.getState().loadNotebooks('proj-1');

      expect(useNotebookStore.getState().activeNotebookId).toBe('training-nb');
      expect(useNotebookStore.getState().notebook?.notebookId).toBe('training-nb');
    });
  });

  describe('removeCellLocally', () => {
    it('removes a cell and adjusts positions of cells after it', () => {
      const cellA = makeCellFixture({ cellId: 'a', position: 0 });
      const cellB = makeCellFixture({ cellId: 'b', position: 1 });
      const cellC = makeCellFixture({ cellId: 'c', position: 2 });
      seedCells([cellA, cellB, cellC]);

      useNotebookStore.getState().removeCellLocally('b');

      const cells = useNotebookStore.getState().cells;
      expect(cells).toHaveLength(2);
      expect(cells.find((c) => c.cellId === 'b')).toBeUndefined();

      const posMap = Object.fromEntries(cells.map((c) => [c.cellId, c.position]));
      expect(posMap['a']).toBe(0);
      expect(posMap['c']).toBe(1);
    });

    it('does not crash when removing a non-existent cell', () => {
      const cellA = makeCellFixture({ cellId: 'a', position: 0 });
      seedCells([cellA]);

      useNotebookStore.getState().removeCellLocally('nonexistent');

      const cells = useNotebookStore.getState().cells;
      expect(cells).toHaveLength(1);
    });
  });

  describe('setCellLock / clearCellLock', () => {
    it('sets a lock on a cell', () => {
      useNotebookStore.getState().setCellLock('cell-1', 'ai');

      const lock = useNotebookStore.getState().lockedCells.get('cell-1');
      expect(lock).toBeDefined();
      expect(lock?.lockedBy).toBe('ai');
      expect(lock?.cellId).toBe('cell-1');
      expect(lock?.lockedAt).toBeInstanceOf(Date);
    });

    it('clears a lock on a cell', () => {
      useNotebookStore.getState().setCellLock('cell-1', 'user');
      expect(useNotebookStore.getState().lockedCells.has('cell-1')).toBe(true);

      useNotebookStore.getState().clearCellLock('cell-1');
      expect(useNotebookStore.getState().lockedCells.has('cell-1')).toBe(false);
    });

    it('clearing a non-existent lock is a no-op', () => {
      useNotebookStore.getState().clearCellLock('no-such-cell');
      expect(useNotebookStore.getState().lockedCells.size).toBe(0);
    });
  });

  describe('isCellLocked / getCellLockOwner', () => {
    it('returns true when the cell is locked', () => {
      useNotebookStore.getState().setCellLock('cell-1', 'ai');
      expect(useNotebookStore.getState().isCellLocked('cell-1')).toBe(true);
    });

    it('returns false when the cell is not locked', () => {
      expect(useNotebookStore.getState().isCellLocked('cell-1')).toBe(false);
    });

    it('returns the lock owner when locked', () => {
      useNotebookStore.getState().setCellLock('cell-1', 'user');
      expect(useNotebookStore.getState().getCellLockOwner('cell-1')).toBe('user');
    });

    it('returns null when the cell is not locked', () => {
      expect(useNotebookStore.getState().getCellLockOwner('cell-1')).toBeNull();
    });
  });

  // ==========================================================
  // Selectors
  // ==========================================================
  describe('selectCodeCells', () => {
    it('filters to code cells only', () => {
      const code1 = makeCellFixture({ cellId: 'c1', cellType: 'code', position: 0 });
      const md1 = makeCellFixture({ cellId: 'm1', cellType: 'markdown', position: 1 });
      const code2 = makeCellFixture({ cellId: 'c2', cellType: 'code', position: 2 });
      seedCells([code1, md1, code2]);

      const codeCells = selectCodeCells(useNotebookStore.getState());
      expect(codeCells).toHaveLength(2);
      expect(codeCells.every((c) => c.cellType === 'code')).toBe(true);
    });
  });

  describe('selectMarkdownCells', () => {
    it('filters to markdown cells only', () => {
      const code1 = makeCellFixture({ cellId: 'c1', cellType: 'code', position: 0 });
      const md1 = makeCellFixture({ cellId: 'm1', cellType: 'markdown', position: 1 });
      const md2 = makeCellFixture({ cellId: 'm2', cellType: 'markdown', position: 2 });
      seedCells([code1, md1, md2]);

      const mdCells = selectMarkdownCells(useNotebookStore.getState());
      expect(mdCells).toHaveLength(2);
      expect(mdCells.every((c) => c.cellType === 'markdown')).toBe(true);
    });
  });

  describe('selectCellById', () => {
    it('returns the correct cell', () => {
      const cellA = makeCellFixture({ cellId: 'a', position: 0, content: 'alpha' });
      const cellB = makeCellFixture({ cellId: 'b', position: 1, content: 'beta' });
      seedCells([cellA, cellB]);

      const found = selectCellById('b')(useNotebookStore.getState());
      expect(found?.cellId).toBe('b');
      expect(found?.content).toBe('beta');
    });

    it('returns undefined for a missing cell', () => {
      seedCells([]);
      const found = selectCellById('missing')(useNotebookStore.getState());
      expect(found).toBeUndefined();
    });
  });

  describe('selectHasAiLockedCells', () => {
    it('returns true when an AI lock exists', () => {
      useNotebookStore.getState().setCellLock('cell-1', 'ai');

      expect(selectHasAiLockedCells(useNotebookStore.getState())).toBe(true);
    });

    it('returns false when only user locks exist', () => {
      useNotebookStore.getState().setCellLock('cell-1', 'user');

      expect(selectHasAiLockedCells(useNotebookStore.getState())).toBe(false);
    });

    it('returns false when no locks exist', () => {
      expect(selectHasAiLockedCells(useNotebookStore.getState())).toBe(false);
    });
  });
});
