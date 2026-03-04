import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/components/theme-provider';
import type { NotebookCell } from '@/types/notebook';
import { NotebookCellComponent } from '../NotebookCell';

vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    onChange
  }: {
    value?: string;
    onChange?: (value: string) => void;
  }) => (
    <textarea
      data-testid="monaco-editor"
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  )
}));

vi.mock('@/lib/monaco/preloader', () => ({
  initMonaco: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@/lib/api/notebooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/notebooks')>();
  return {
    ...actual,
    getPythonCompletions: vi.fn().mockResolvedValue([])
  };
});

function createCell(overrides: Partial<NotebookCell> = {}): NotebookCell {
  return {
    cellId: 'cell-1',
    notebookId: 'notebook-1',
    cellType: 'code',
    content: 'print("hello")',
    position: 0,
    executionCount: 0,
    executionOrder: null,
    executionStatus: 'idle',
    executionDurationMs: null,
    executedAt: null,
    isDirty: false,
    output: [],
    outputRefs: [],
    createdAt: new Date('2026-02-28T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-02-28T00:00:00.000Z').toISOString(),
    ...overrides
  };
}

function renderCell(cell: NotebookCell) {
  return render(
    <ThemeProvider defaultTheme="light">
      <NotebookCellComponent
        cell={cell}
        isLocked={false}
        lockOwner={null}
        projectId="project-1"
        onContentChange={vi.fn()}
        onDelete={vi.fn()}
        onRun={vi.fn()}
      />
    </ThemeProvider>
  );
}

describe('NotebookCellComponent', () => {
  it('shows running execution prompt and disables run action', () => {
    const runningCell = createCell({
      executionStatus: 'running',
      executionOrder: 2
    });

    renderCell(runningCell);

    expect(screen.getByText('In [*]')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run cell' })).toBeDisabled();
  });

  it('renders execution order and dirty marker like Jupyter prompts', () => {
    const cleanCell = createCell({
      executionStatus: 'success',
      executionOrder: 3,
      executionDurationMs: 120
    });

    const { rerender } = render(
      <ThemeProvider defaultTheme="light">
        <NotebookCellComponent
          cell={cleanCell}
          isLocked={false}
          lockOwner={null}
          projectId="project-1"
          onContentChange={vi.fn()}
          onDelete={vi.fn()}
          onRun={vi.fn()}
        />
      </ThemeProvider>
    );

    expect(screen.getByText('In [3]')).toBeInTheDocument();
    expect(screen.getByText('120ms')).toBeInTheDocument();
    expect(screen.queryByText('Success')).not.toBeInTheDocument();

    const dirtyCell = createCell({
      executionStatus: 'success',
      executionOrder: 3,
      isDirty: true
    });

    rerender(
      <ThemeProvider defaultTheme="light">
        <NotebookCellComponent
          cell={dirtyCell}
          isLocked={false}
          lockOwner={null}
          projectId="project-1"
          onContentChange={vi.fn()}
          onDelete={vi.fn()}
          onRun={vi.fn()}
        />
      </ThemeProvider>
    );

    expect(screen.getByText('In [3*]')).toBeInTheDocument();
  });

  it('shows Python language badge and exposes code actions', () => {
    renderCell(createCell());

    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run cell' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete cell' })).toBeInTheDocument();
  });

  it('shows output controls and supports collapsing and copying output', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    renderCell(
      createCell({
        executionStatus: 'success',
        output: [
          {
            type: 'text',
            content: 'hello output',
            mimeType: 'text/plain'
          }
        ]
      })
    );

    expect(screen.getByRole('button', { name: 'Collapse output' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy output' })).toBeInTheDocument();
    expect(screen.getByText('hello output')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse output' }));
    expect(screen.queryByText('hello output')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand output' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy output' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('hello output');
    });
  });

  it('resolves persisted image output refs to API URLs', () => {
    renderCell(
      createCell({
        executionStatus: 'success',
        output: [
          {
            type: 'image',
            content: 'outputs/cell-1/some.png',
            mimeType: 'image/png'
          }
        ]
      })
    );

    const img = screen.getByAltText('Output');
    expect(img).toHaveAttribute(
      'src',
      expect.stringContaining('/api/cells/cell-1/outputs/some.png')
    );
  });

  it('renders image outputRefs when inline outputs are missing', () => {
    renderCell(
      createCell({
        executionStatus: 'success',
        output: [],
        outputRefs: [
          {
            type: 'image',
            ref: 'outputs/cell-1/some.png',
            mimeType: 'image/png',
            byteSize: 123
          }
        ]
      })
    );

    const img = screen.getByAltText('Output');
    expect(img).toHaveAttribute(
      'src',
      expect.stringContaining('/api/cells/cell-1/outputs/some.png')
    );
  });
});
