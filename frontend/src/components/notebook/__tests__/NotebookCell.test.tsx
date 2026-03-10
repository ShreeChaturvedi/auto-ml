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
  it('shows running execution prompt and stop button', () => {
    const runningCell = createCell({
      executionStatus: 'running',
      executionOrder: 2
    });

    renderCell(runningCell);

    expect(screen.getByText('In [*]')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop execution' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Run cell' })).not.toBeInTheDocument();
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

  // -----------------------------------------------------------------------
  // Error badge suppression when richOutputs contain error outputs
  // -----------------------------------------------------------------------

  describe('error status badge suppression', () => {
    it('does NOT show header Error badge when executionStatus is error AND richOutputs has error outputs', () => {
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

      // The output area should be rendered with the error content
      expect(screen.getByText('OUTPUT')).toBeInTheDocument();
      expect(screen.getByText('ValueError: something went wrong')).toBeInTheDocument();

      // The header Error badge should NOT be present because richOutputs.length > 0
      // The condition is: cell.executionStatus === 'error' && richOutputs.length === 0
      // Find all elements with "Error" text - the one in the output area is from CellOutputRenderer
      const errorElements = screen.getAllByText('Error');
      // Only the CellOutputRenderer error label should exist, not the header badge
      errorElements.forEach((el) => {
        // The header badge uses text-destructive class, the output renderer uses text-red-500
        const parentDiv = el.closest('div');
        expect(parentDiv?.className).not.toContain('text-destructive');
      });
    });

    it('shows header Error badge when executionStatus is error AND richOutputs is empty', () => {
      renderCell(
        createCell({
          executionStatus: 'error',
          output: []
        })
      );

      // The header Error badge should be present because richOutputs.length === 0
      const errorBadge = screen.getByText('Error');
      expect(errorBadge).toBeInTheDocument();

      // Verify it's the header badge (uses text-destructive styling)
      const parentSpan = errorBadge.closest('span');
      expect(parentSpan?.className).toContain('text-destructive');
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
