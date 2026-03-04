import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NlQueryWorkflow } from '../NlQueryWorkflow';
import type { NlQueryWorkflowHandle } from '../NlQueryWorkflow';
import type { NlGenerationResult, NlQueryStreamEvent } from '@/types/nlQuery';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const MOCK_RESULT: NlGenerationResult = {
  sql: 'SELECT id, name FROM users LIMIT 10;',
  rationale: 'Returns the first 10 users by primary key.',
  explanation: {
    intentSummary: 'Return first users by primary key.',
    selectedTables: ['users'],
    joinPlan: [],
    filters: [],
    aggregations: [],
    assumptions: [],
    validationNotes: [],
    confidence: 0.91,
    warningLevel: 'none',
    confidenceMode: 'model',
    reliabilityTier: 'high',
  },
  queryId: 'test-query-123',
  cached: false,
  queryResult: {
    queryId: 'test-query-123',
    sql: 'SELECT id, name FROM users LIMIT 10;',
    columns: [
      { name: 'id', dataTypeID: 23 },
      { name: 'name', dataTypeID: 25 },
    ],
    rows: [{ id: 1, name: 'Alice' }],
    rowCount: 1,
    executionMs: 42,
    cached: false,
  },
};

function buildProps(
  overrides: Partial<{
    englishQuery: string;
    onQueryChange: (v: string) => void;
    onGenerate: (
      q: string,
      onStreamEvent?: (event: NlQueryStreamEvent) => void,
      signal?: AbortSignal
    ) => Promise<NlGenerationResult>;
    onApprove: (r: NlGenerationResult, sql: string) => void;
    onPhaseChange: (phase: string) => void;
  }> = {}
) {
  return {
    englishQuery: 'Show me the first 10 users',
    onQueryChange: vi.fn(),
    onGenerate: vi.fn().mockResolvedValue(MOCK_RESULT),
    onApprove: vi.fn(),
    onPhaseChange: vi.fn(),
    ...overrides,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * A wrapper component that exposes the workflow's imperative handle so tests
 * can drive state transitions without simulating keystrokes on the footer button.
 */
function WorkflowWithRef({
  handleRef,
  ...props
}: ReturnType<typeof buildProps> & {
  handleRef: React.RefObject<NlQueryWorkflowHandle | null>;
}) {
  return <NlQueryWorkflow {...props} ref={handleRef} />;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NlQueryWorkflow', () => {
  beforeEach(() => {
    // Silence matchMedia warnings in jsdom
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  // ── Idle state ──────────────────────────────────────────────────────────────

  it('renders the english textarea in idle state', () => {
    render(<NlQueryWorkflow {...buildProps()} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('calls onQueryChange when user types in the textarea', () => {
    const onQueryChange = vi.fn();
    render(<NlQueryWorkflow {...buildProps({ onQueryChange })} />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'List all orders' },
    });
    expect(onQueryChange).toHaveBeenCalledWith('List all orders');
  });

  it('keeps both NlFlowConnector wrappers collapsed in idle state', () => {
    render(<NlQueryWorkflow {...buildProps()} />);
    const topConnector = screen.getByTestId('nl-flow-connector-top');
    const bottomConnector = screen.getByTestId('nl-flow-connector-bottom');
    expect(topConnector).toHaveClass('h-0');
    expect(topConnector).toHaveClass('opacity-0');
    expect(bottomConnector).toHaveClass('h-0');
    expect(bottomConnector).toHaveClass('opacity-0');
  });

  // ── triggerGenerate via imperative handle ────────────────────────────────────

  it('transitions to submitting when triggerGenerate is called', async () => {
    const onPhaseChange = vi.fn();
    // Use a never-resolving promise so we stay in 'submitting' long enough to
    // assert, without scheduling an extra state update after the assertion.
    const pending = new Promise<NlGenerationResult>(() => {});
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <WorkflowWithRef
        {...buildProps({ onGenerate: () => pending, onPhaseChange })}
        handleRef={handleRef}
      />
    );

    act(() => {
      handleRef.current?.triggerGenerate();
    });

    await waitFor(() => {
      expect(onPhaseChange).toHaveBeenCalledWith('submitting');
    });
  });

  it('calls onGenerate with the current englishQuery text', async () => {
    const onGenerate = vi.fn().mockResolvedValue(MOCK_RESULT);
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <WorkflowWithRef
        {...buildProps({ onGenerate })}
        handleRef={handleRef}
      />
    );

    await act(async () => {
      handleRef.current?.triggerGenerate();
    });

    expect(onGenerate).toHaveBeenCalledWith(
      'Show me the first 10 users',
      expect.any(Function),
      expect.any(AbortSignal)
    );
  });

  // ── Error handling ───────────────────────────────────────────────────────────

  it('shows an error message when onGenerate rejects', async () => {
    const onGenerate = vi.fn().mockRejectedValue(new Error('Network error'));
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <WorkflowWithRef
        {...buildProps({ onGenerate })}
        handleRef={handleRef}
      />
    );

    await act(async () => {
      handleRef.current?.triggerGenerate();
    });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
  });

  it('calls onPhaseChange with "error" when generation fails', async () => {
    const onPhaseChange = vi.fn();
    const onGenerate = vi.fn().mockRejectedValue(new Error('Server down'));
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <WorkflowWithRef
        {...buildProps({ onGenerate, onPhaseChange })}
        handleRef={handleRef}
      />
    );

    await act(async () => {
      handleRef.current?.triggerGenerate();
    });

    await waitFor(() => {
      expect(onPhaseChange).toHaveBeenCalledWith('error');
    });
  });

  // ── Reject ───────────────────────────────────────────────────────────────────

  it('resets to idle when reject() is called', async () => {
    const onPhaseChange = vi.fn();
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <WorkflowWithRef
        {...buildProps({ onPhaseChange })}
        handleRef={handleRef}
      />
    );

    await act(async () => {
      handleRef.current?.triggerGenerate();
    });

    await waitFor(() => {
      expect(onPhaseChange).toHaveBeenCalledWith('revealing');
    });

    act(() => {
      handleRef.current?.reject();
    });

    await waitFor(() => {
      expect(onPhaseChange).toHaveBeenCalledWith('idle');
    });
  });

  // ── Approve ──────────────────────────────────────────────────────────────────

  it('calls onApprove and resets to idle when approve() is called after generation', async () => {
    const onApprove = vi.fn();
    const onPhaseChange = vi.fn();
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <WorkflowWithRef
        {...buildProps({ onApprove, onPhaseChange })}
        handleRef={handleRef}
      />
    );

    // Advance through the full reveal → review flow
    await act(async () => {
      handleRef.current?.triggerGenerate();
    });

    // Wait for reviewing phase (typewriter completes quickly in test env)
    await waitFor(() => {
      expect(onPhaseChange).toHaveBeenCalledWith('reviewing');
    }, { timeout: 3000 });

    act(() => {
      handleRef.current?.approve();
    });

    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledWith(
        MOCK_RESULT,
        MOCK_RESULT.sql
      );
    });

    await waitFor(() => {
      expect(onPhaseChange).toHaveBeenCalledWith('idle');
    });
  });

  it('renders the model work panel during review', async () => {
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <WorkflowWithRef
        {...buildProps()}
        handleRef={handleRef}
      />
    );

    await act(async () => {
      handleRef.current?.triggerGenerate();
    });

    await waitFor(() => {
      expect(screen.getByTestId('nl-work-plan-panel')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('consumes streamed phase events while generation is in progress', async () => {
    const pending = new Promise<NlGenerationResult>(() => {});
    const onGenerate = vi.fn(async (_q: string, onStreamEvent?: (event: NlQueryStreamEvent) => void) => {
      onStreamEvent?.({
        type: 'phase_started',
        phaseId: 'planning',
        summary: 'Planning started',
        timestamp: new Date().toISOString()
      });
      onStreamEvent?.({
        type: 'phase_progress',
        phaseId: 'planning',
        summary: 'Choosing candidate tables',
        timestamp: new Date().toISOString()
      });
      return pending;
    });
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <WorkflowWithRef
        {...buildProps({ onGenerate })}
        handleRef={handleRef}
      />
    );

    act(() => {
      handleRef.current?.triggerGenerate();
    });

    const planningMatches = await screen.findAllByText(/choosing candidate tables/i);
    expect(planningMatches.length).toBeGreaterThan(0);
  });

  it('auto-collapses the model work panel on constrained height', async () => {
    const OriginalResizeObserver = globalThis.ResizeObserver;
    class ResizeObserverMock {
      private callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe() {
        this.callback(
          [{ contentRect: { height: 640 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver
        );
      }
      disconnect() {}
      unobserve() {}
    }
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

    try {
      const pending = new Promise<NlGenerationResult>(() => {});
      const handleRef = { current: null as NlQueryWorkflowHandle | null };
      render(
        <WorkflowWithRef
          {...buildProps({ onGenerate: () => pending })}
          handleRef={handleRef}
        />
      );

      act(() => {
        handleRef.current?.triggerGenerate();
      });

      expect(await screen.findByRole('button', { name: /expand model work panel/i })).toBeInTheDocument();
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver;
    }
  });

  // ── onPhaseChange propagation ────────────────────────────────────────────────

  it('reports at least revealing and reviewing phases through onPhaseChange', async () => {
    const phases: string[] = [];
    const onPhaseChange = vi.fn((p) => phases.push(p));
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <WorkflowWithRef
        {...buildProps({ onPhaseChange })}
        handleRef={handleRef}
      />
    );

    await act(async () => {
      handleRef.current?.triggerGenerate();
    });

    // Wait until the reveal+review cycle has completed.  The 'submitting'
    // phase may be flushed synchronously with 'revealing' within the same
    // React batch, so we only assert on observable phases.
    await waitFor(() => {
      expect(phases).toContain('revealing');
    }, { timeout: 3000 });

    await waitFor(() => {
      expect(phases).toContain('reviewing');
    }, { timeout: 3000 });
  });

  // ── Does not call onGenerate when query is empty ─────────────────────────────

  it('does not call onGenerate when englishQuery is empty', async () => {
    const onGenerate = vi.fn().mockResolvedValue(MOCK_RESULT);
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <WorkflowWithRef
        {...buildProps({ englishQuery: '   ', onGenerate })}
        handleRef={handleRef}
      />
    );

    await act(async () => {
      handleRef.current?.triggerGenerate();
    });

    expect(onGenerate).not.toHaveBeenCalled();
  });
});
