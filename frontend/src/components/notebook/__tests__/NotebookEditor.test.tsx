import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotebookEditor } from '../NotebookEditor';

const mockState = vi.hoisted(() => ({
  notebook: { notebookId: 'nb-1', projectId: 'p1', name: 'Notebook 1', metadata: {}, createdAt: '', updatedAt: '' },
  cells: [] as Array<{
    cellId: string;
    notebookId: string;
    cellType: 'code' | 'markdown';
    content: string;
    position: number;
    executionCount: number;
    executionOrder: number | null;
    executionStatus: 'idle' | 'running' | 'success' | 'error';
    executionDurationMs: number | null;
    executedAt: string | null;
    isDirty: boolean;
    output: [];
    outputRefs: [];
    createdAt: string;
    updatedAt: string;
  }>,
  isLoading: false,
  isSaving: false,
  createCell: vi.fn(),
  updateCell: vi.fn(),
  deleteCell: vi.fn(),
  runCell: vi.fn(),
  isCellLocked: vi.fn().mockReturnValue(false),
  getCellLockOwner: vi.fn().mockReturnValue(null)
}));

vi.mock('@/stores/notebookStore', () => ({
  useNotebookStore: (selector: (state: unknown) => unknown) => selector(mockState)
}));

vi.mock('../NotebookCell', () => ({
  NotebookCellComponent: ({ cell }: { cell: { cellId: string } }) => (
    <div data-testid={`code-cell-${cell.cellId}`}>Code cell {cell.cellId}</div>
  )
}));

vi.mock('../NotebookMarkdownCell', () => ({
  NotebookMarkdownCell: ({
    cell,
    hiddenCodeCount,
    isCollapsed,
    onToggleCollapsed
  }: {
    cell: { cellId: string };
    hiddenCodeCount: number;
    isCollapsed: boolean;
    onToggleCollapsed: () => void;
  }) => (
    <div data-testid={`markdown-cell-${cell.cellId}`}>
      <button type="button" onClick={onToggleCollapsed}>
        Toggle {cell.cellId}
      </button>
      <span>{isCollapsed ? 'collapsed' : 'expanded'}</span>
      <span>hidden:{hiddenCodeCount}</span>
    </div>
  )
}));

describe('NotebookEditor section collapsing', () => {
  beforeEach(() => {
    mockState.cells = [
      {
        cellId: 'm1',
        notebookId: 'nb-1',
        cellType: 'markdown',
        content: '## Section 1',
        position: 0,
        executionCount: 0,
        executionOrder: null,
        executionStatus: 'idle',
        executionDurationMs: null,
        executedAt: null,
        isDirty: false,
        output: [],
        outputRefs: [],
        createdAt: '',
        updatedAt: ''
      },
      {
        cellId: 'c1',
        notebookId: 'nb-1',
        cellType: 'code',
        content: 'print(1)',
        position: 1,
        executionCount: 0,
        executionOrder: null,
        executionStatus: 'idle',
        executionDurationMs: null,
        executedAt: null,
        isDirty: false,
        output: [],
        outputRefs: [],
        createdAt: '',
        updatedAt: ''
      },
      {
        cellId: 'c2',
        notebookId: 'nb-1',
        cellType: 'code',
        content: 'print(2)',
        position: 2,
        executionCount: 0,
        executionOrder: null,
        executionStatus: 'idle',
        executionDurationMs: null,
        executedAt: null,
        isDirty: false,
        output: [],
        outputRefs: [],
        createdAt: '',
        updatedAt: ''
      },
      {
        cellId: 'm2',
        notebookId: 'nb-1',
        cellType: 'markdown',
        content: '## Section 2',
        position: 3,
        executionCount: 0,
        executionOrder: null,
        executionStatus: 'idle',
        executionDurationMs: null,
        executedAt: null,
        isDirty: false,
        output: [],
        outputRefs: [],
        createdAt: '',
        updatedAt: ''
      },
      {
        cellId: 'c3',
        notebookId: 'nb-1',
        cellType: 'code',
        content: 'print(3)',
        position: 4,
        executionCount: 0,
        executionOrder: null,
        executionStatus: 'idle',
        executionDurationMs: null,
        executedAt: null,
        isDirty: false,
        output: [],
        outputRefs: [],
        createdAt: '',
        updatedAt: ''
      }
    ];
  });

  it('hides only cells under the collapsed markdown section', () => {
    render(<NotebookEditor projectId="p1" />);

    expect(screen.getByTestId('code-cell-c1')).toBeInTheDocument();
    expect(screen.getByTestId('code-cell-c2')).toBeInTheDocument();
    expect(screen.getByTestId('code-cell-c3')).toBeInTheDocument();
    expect(screen.getAllByText('hidden:0')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle m1' }));

    expect(screen.queryByTestId('code-cell-c1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('code-cell-c2')).not.toBeInTheDocument();
    expect(screen.getByTestId('code-cell-c3')).toBeInTheDocument();
    expect(screen.getByText('hidden:2')).toBeInTheDocument();
  });
});
