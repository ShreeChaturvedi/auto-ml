import { fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NlSqlEditor } from '../NlSqlEditor';

vi.mock('@/hooks/useProjectThemeColor', () => ({
  useProjectThemeColor: () => ({ syntaxThemeId: 'adaptive-light' })
}));

vi.mock('@/lib/monaco/dom', () => ({
  assignMonacoHiddenTextareaIdentity: vi.fn()
}));

vi.mock('@/lib/monaco/LazyMonacoEditor', () => ({
  LazyMonacoEditor: ({ onMount }: { onMount?: (editor: unknown, monaco: unknown) => void }) => {
    if (onMount) {
      const mockEditor = {
        getLayoutInfo: () => ({ contentLeft: 30 }),
        getDomNode: () => null,
        focus: vi.fn(),
        getModel: () => ({
          getLineCount: () => 1,
          getLineMaxColumn: () => 1
        }),
        setPosition: vi.fn(),
        revealLine: vi.fn(),
        setScrollTop: vi.fn(),
        updateOptions: vi.fn()
      };
      const mockMonaco = {
        editor: { setTheme: vi.fn() }
      };
      // Fire onMount in a microtask to avoid React render errors
      Promise.resolve().then(() => onMount(mockEditor, mockMonaco));
    }
    return <div data-testid="mock-monaco" />;
  }
}));

const baseProps = {
  sql: '',
  phase: 'generating' as const,
  editedSql: '',
  onSqlChange: vi.fn(),
  originalSql: '',
  onRevealComplete: vi.fn(),
};

describe('NlSqlEditor', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows shimmer overlay on top of Monaco during generating phase', () => {
    const { container } = render(<NlSqlEditor {...baseProps} />);

    expect(container.querySelector('.nl-editor-shimmer')).toBeTruthy();
    expect(screen.getByLabelText(/generating sql/i)).toBeInTheDocument();
    // Monaco is always mounted — shimmer overlays it
    expect(screen.getByTestId('mock-monaco')).toBeInTheDocument();
  });

  it('shows char animation pre overlay during revealing phase', () => {
    vi.useFakeTimers();
    const { container } = render(
      <NlSqlEditor
        {...baseProps}
        sql="SELECT id FROM users;"
        phase="revealing"
        editedSql="SELECT id FROM users;"
        originalSql="SELECT id FROM users;"
      />
    );

    // Pre overlay should be present
    const pre = container.querySelector('pre');
    expect(pre).toBeTruthy();
    expect(pre).toHaveAttribute('aria-label', 'Generated SQL (revealing)');

    // Monaco should be mounted and visible (single mount, no hidden wrapper)
    expect(screen.getByTestId('mock-monaco')).toBeInTheDocument();
  });

  it('pre overlay has opacity-0 during reviewing phase', () => {
    const { container } = render(
      <NlSqlEditor
        {...baseProps}
        sql="SELECT id FROM users;"
        phase="reviewing"
        editedSql="SELECT id FROM users;"
        originalSql="SELECT id FROM users;"
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    const pre = container.querySelector('pre');
    expect(pre).toBeTruthy();
    expect(pre!.className.includes('opacity-0')).toBe(true);
  });

  it('shows Monaco during reviewing phase', async () => {
    render(
      <NlSqlEditor
        {...baseProps}
        sql="SELECT id FROM users;"
        phase="reviewing"
        editedSql="SELECT id FROM users;"
        originalSql="SELECT id FROM users;"
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByTestId('mock-monaco')).toBeInTheDocument();
  });

  it('shows approve and reject buttons in reviewing phase', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();

    render(
      <NlSqlEditor
        {...baseProps}
        sql="SELECT 1;"
        phase="reviewing"
        editedSql="SELECT 1;"
        originalSql="SELECT 1;"
        onApprove={onApprove}
        onReject={onReject}
      />
    );

    const approveBtn = screen.getByRole('button', { name: /approve and run/i });
    const rejectBtn = screen.getByRole('button', { name: /reject generated sql/i });
    expect(approveBtn).toBeInTheDocument();
    expect(rejectBtn).toBeInTheDocument();
  });

  it('fires onApprove when Approve & Run clicked', () => {
    const onApprove = vi.fn();
    render(
      <NlSqlEditor
        {...baseProps}
        sql="SELECT 1;"
        phase="reviewing"
        editedSql="SELECT 1;"
        originalSql="SELECT 1;"
        onApprove={onApprove}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /approve and run/i }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('fires onReject when Reject clicked', () => {
    const onReject = vi.fn();
    render(
      <NlSqlEditor
        {...baseProps}
        sql="SELECT 1;"
        phase="reviewing"
        editedSql="SELECT 1;"
        originalSql="SELECT 1;"
        onReject={onReject}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /reject generated sql/i }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('fires onRevealComplete after reveal timeout', async () => {
    vi.useFakeTimers();
    const onRevealComplete = vi.fn();

    render(
      <NlSqlEditor
        {...baseProps}
        sql="SELECT id FROM users;"
        phase="revealing"
        editedSql="SELECT id FROM users;"
        originalSql="SELECT id FROM users;"
        onRevealComplete={onRevealComplete}
      />
    );

    expect(onRevealComplete).not.toHaveBeenCalled();

    // Advance past the reveal duration (generous upper bound)
    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });

    expect(onRevealComplete).toHaveBeenCalledTimes(1);
  });

  it('does not fire stale onRevealComplete after unmount', async () => {
    vi.useFakeTimers();
    const onRevealComplete = vi.fn();

    const { unmount } = render(
      <NlSqlEditor
        {...baseProps}
        sql="SELECT id FROM users;"
        phase="revealing"
        editedSql="SELECT id FROM users;"
        originalSql="SELECT id FROM users;"
        onRevealComplete={onRevealComplete}
      />
    );

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });

    expect(onRevealComplete).not.toHaveBeenCalled();
  });

  it('shows query execution error warning in review phase', () => {
    render(
      <NlSqlEditor
        {...baseProps}
        sql="SELECT bad FROM missing;"
        phase="reviewing"
        editedSql="SELECT bad FROM missing;"
        originalSql="SELECT bad FROM missing;"
        queryExecutionError="relation 'missing' does not exist"
      />
    );

    expect(screen.getByText(/initial execution failed/i)).toBeInTheDocument();
    expect(screen.getByText(/relation 'missing' does not exist/i)).toBeInTheDocument();
  });
});
