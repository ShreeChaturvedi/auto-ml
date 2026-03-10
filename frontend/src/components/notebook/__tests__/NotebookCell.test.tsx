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
        onInterrupt={vi.fn()}
      />
    </ThemeProvider>
  );
}

describe('NotebookCellComponent', () => {
  it('shows spinner and stop button when running', () => {
    const runningCell = createCell({
      executionStatus: 'running',
      executionOrder: 2
    });

    renderCell(runningCell);

    // Spinner replaces execution count; no "Running" text
    expect(screen.queryByText(/\[/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop execution' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Run cell' })).not.toBeInTheDocument();
  });

  it('renders execution order, formatted time, and dirty marker', () => {
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

    expect(screen.getByText('[3]')).toBeInTheDocument();
    expect(screen.getByText('· 0.1s')).toBeInTheDocument();
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

    expect(screen.getByText('[3*]')).toBeInTheDocument();
  });

  it('exposes run and delete code actions', () => {
    renderCell(createCell());

    expect(screen.getByRole('button', { name: 'Run cell' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete cell' })).toBeInTheDocument();
    // Python badge was removed — all code cells are Python
    expect(screen.queryByText('Python')).not.toBeInTheDocument();
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

  // -----------------------------------------------------------------------
  // Error status — red left border is the sole indicator
  // -----------------------------------------------------------------------

  describe('error status indicators', () => {
    it('renders error output without redundant Error label', () => {
      renderCell(
        createCell({
          executionStatus: 'error',
          output: [
            {
              type: 'error',
              content: 'ValueError: something went wrong',
              mimeType: 'text/plain'
            }
          ]
        })
      );

      expect(screen.getByText('OUTPUT')).toBeInTheDocument();
      expect(screen.getByText('ValueError: something went wrong')).toBeInTheDocument();
      // No "Error" label — the red left border on the card is the indicator
      expect(screen.queryByText('Error')).not.toBeInTheDocument();
    });

    it('shows no error icon in header when error has no output', () => {
      const { container } = render(
        <ThemeProvider defaultTheme="light">
          <NotebookCellComponent
            cell={createCell({
              executionStatus: 'error',
              output: []
            })}
            isLocked={false}
            lockOwner={null}
            projectId="project-1"
            onContentChange={vi.fn()}
            onDelete={vi.fn()}
            onRun={vi.fn()}
            onInterrupt={vi.fn()}
          />
        </ThemeProvider>
      );

      // Red left border is the only error signal — no icons or badges in header
      const errorIcon = container.querySelector('svg.text-destructive');
      expect(errorIcon).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Error status WITH outputs shows error content in output area
  // -----------------------------------------------------------------------

  describe('error status with outputs renders in output section', () => {
    it('renders the OUTPUT section with error content when error outputs exist', () => {
      renderCell(
        createCell({
          executionStatus: 'error',
          output: [
            {
              type: 'error',
              content: 'RuntimeError: division by zero',
              mimeType: 'text/plain'
            }
          ]
        })
      );

      // The output section header "OUTPUT" is rendered
      expect(screen.getByText('OUTPUT')).toBeInTheDocument();

      // The error message is visible in the output area
      expect(screen.getByText('RuntimeError: division by zero')).toBeInTheDocument();

      // Copy and collapse buttons are available for the output area
      expect(screen.getByRole('button', { name: 'Copy output' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Collapse output' })).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Lock states
  // -----------------------------------------------------------------------

  describe('lock states', () => {
    it('shows AI editing badge when cell is locked by AI', () => {
      render(
        <ThemeProvider defaultTheme="light">
          <NotebookCellComponent
            cell={createCell()}
            isLocked={true}
            lockOwner="ai"
            projectId="project-1"
            onContentChange={vi.fn()}
            onDelete={vi.fn()}
            onRun={vi.fn()}
            onInterrupt={vi.fn()}
          />
        </ThemeProvider>
      );

      expect(screen.getByText('AI editing')).toBeInTheDocument();
      // The AI editing badge should contain the Bot icon (svg)
      const aiBadge = screen.getByText('AI editing').closest('[class]')!;
      expect(aiBadge.querySelector('svg')).toBeInTheDocument();
      // Run and delete buttons should be disabled when locked
      expect(screen.getByRole('button', { name: 'Run cell' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Delete cell' })).toBeDisabled();
    });

    it('shows Editing badge when cell is locked by user', () => {
      render(
        <ThemeProvider defaultTheme="light">
          <NotebookCellComponent
            cell={createCell()}
            isLocked={true}
            lockOwner="user"
            projectId="project-1"
            onContentChange={vi.fn()}
            onDelete={vi.fn()}
            onRun={vi.fn()}
            onInterrupt={vi.fn()}
          />
        </ThemeProvider>
      );

      expect(screen.getByText('Editing')).toBeInTheDocument();
      // The Editing badge should contain the Lock icon (svg)
      const editingBadge = screen.getByText('Editing').closest('[class]')!;
      expect(editingBadge.querySelector('svg')).toBeInTheDocument();
    });

    it('does not show lock badges when cell is not locked', () => {
      renderCell(createCell());

      expect(screen.queryByText('AI editing')).not.toBeInTheDocument();
      expect(screen.queryByText('Editing')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Interrupt button calls onInterrupt
  // -----------------------------------------------------------------------

  describe('interrupt button', () => {
    it('calls onInterrupt when stop button is clicked during execution', () => {
      const onInterrupt = vi.fn();
      render(
        <ThemeProvider defaultTheme="light">
          <NotebookCellComponent
            cell={createCell({ executionStatus: 'running', executionOrder: 5 })}
            isLocked={false}
            lockOwner={null}
            projectId="project-1"
            onContentChange={vi.fn()}
            onDelete={vi.fn()}
            onRun={vi.fn()}
            onInterrupt={onInterrupt}
          />
        </ThemeProvider>
      );

      const stopButton = screen.getByRole('button', { name: 'Stop execution' });
      expect(stopButton).toBeEnabled();

      fireEvent.click(stopButton);

      expect(onInterrupt).toHaveBeenCalledTimes(1);
    });

    it('disables stop button when onInterrupt is not provided', () => {
      render(
        <ThemeProvider defaultTheme="light">
          <NotebookCellComponent
            cell={createCell({ executionStatus: 'running', executionOrder: 5 })}
            isLocked={false}
            lockOwner={null}
            projectId="project-1"
            onContentChange={vi.fn()}
            onDelete={vi.fn()}
            onRun={vi.fn()}
          />
        </ThemeProvider>
      );

      const stopButton = screen.getByRole('button', { name: 'Stop execution' });
      expect(stopButton).toBeDisabled();
    });
  });
});
