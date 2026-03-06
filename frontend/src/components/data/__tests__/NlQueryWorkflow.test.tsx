import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NlQueryWorkflow } from '../NlQueryWorkflow';
import type { NlQueryWorkflowHandle } from '../NlQueryWorkflow';
import type { NlGenerationResult, NlQueryStreamEvent } from '@/types/nlQuery';
import { useProjectStore } from '@/stores/projectStore';
import { fetchNlSuggestions } from '@/lib/api/query';

vi.mock('@/lib/api/query', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/query')>('@/lib/api/query');
  return {
    ...actual,
    fetchNlSuggestions: vi.fn().mockResolvedValue({
      suggestions: [
        {
          id: 'suggestion-1',
          prompt: 'Compare weekly revenue and average order value over the last 8 weeks.',
          label: 'Weekly revenue trends',
          category: 'trend',
          tables: ['orders'],
          rationale: 'Uses time and revenue metrics.'
        }
      ],
      cached: false,
      schemaFingerprint: 'test-schema'
    })
  };
});

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
  provider: {
    id: 'openai',
    label: 'OpenAI',
    model: 'gpt-5.4'
  },
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function buildProps(
  overrides: Partial<{
    projectId: string | null;
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
    projectId: null,
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
    useProjectStore.setState({
      activeProjectId: null
    });
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

  it('loads dynamic placeholder suggestions when a project id is present', async () => {
    render(<NlQueryWorkflow {...buildProps({ projectId: 'project-123', englishQuery: '' })} />);

    await waitFor(() => {
      expect(fetchNlSuggestions).toHaveBeenCalledWith('project-123', 8);
    });

    expect((await screen.findAllByText(/compare weekly revenue and average order value over the last 8 weeks/i)).length).toBeGreaterThan(0);
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
    expect(screen.queryByTestId('nl-flow-connector-top')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nl-flow-connector-bottom')).not.toBeInTheDocument();
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

  it('surfaces streamed phase_failed events for stream parse failures', async () => {
    const pending = new Promise<NlGenerationResult>(() => {});
    const onGenerate = vi.fn(async (_q: string, onStreamEvent?: (event: NlQueryStreamEvent) => void) => {
      onStreamEvent?.({
        type: 'phase_failed',
        phaseId: 'done',
        summary: 'Failed to parse NL stream response.',
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

    const parseFailureMatches = await screen.findAllByText(/failed to parse nl stream response/i);
    expect(parseFailureMatches.length).toBeGreaterThan(0);
  });

  it('does not enter error state when in-flight generation is aborted via reject()', async () => {
    const onPhaseChange = vi.fn();
    const onGenerate = vi.fn(
      (_q: string, _onStreamEvent?: (event: NlQueryStreamEvent) => void, signal?: AbortSignal) =>
        new Promise<NlGenerationResult>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <WorkflowWithRef
        {...buildProps({ onGenerate, onPhaseChange })}
        handleRef={handleRef}
      />
    );

    act(() => {
      handleRef.current?.triggerGenerate();
    });

    await waitFor(() => {
      expect(onPhaseChange).toHaveBeenCalledWith('submitting');
    });

    act(() => {
      handleRef.current?.reject();
    });

    await waitFor(() => {
      expect(onPhaseChange).toHaveBeenCalledWith('idle');
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores stale aborted run results when a newer generation completes', async () => {
    const onApprove = vi.fn();
    const firstRun = createDeferred<NlGenerationResult>();
    const secondResult: NlGenerationResult = {
      ...MOCK_RESULT,
      sql: 'SELECT name FROM users ORDER BY name LIMIT 5;',
      queryId: 'test-query-456'
    };

    const onGenerate = vi.fn(async () => {
      if (onGenerate.mock.calls.length === 1) {
        return firstRun.promise;
      }
      return secondResult;
    });

    const handleRef = { current: null as NlQueryWorkflowHandle | null };
    render(
      <WorkflowWithRef
        {...buildProps({ onGenerate, onApprove })}
        handleRef={handleRef}
      />
    );

    act(() => {
      handleRef.current?.triggerGenerate();
    });

    act(() => {
      handleRef.current?.triggerGenerate();
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /approve and run this sql/i })).toBeInTheDocument();
    }, { timeout: 4000 });

    await act(async () => {
      firstRun.resolve(MOCK_RESULT);
    });

    act(() => {
      handleRef.current?.approve();
    });

    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledWith(
        expect.objectContaining({ queryId: 'test-query-456' }),
        secondResult.sql
      );
    });
  });

  it('keeps the model work panel expanded while generation is in progress on constrained height', async () => {
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

      expect(await screen.findByRole('button', { name: /collapse model work panel/i })).toBeInTheDocument();
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver;
    }
  });

  it('resets manual collapse override after reject + regenerate on constrained height', async () => {
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
      const onGenerate = vi.fn(() => new Promise<NlGenerationResult>(() => {}));
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

      fireEvent.click(await screen.findByRole('button', { name: /collapse model work panel/i }));
      expect(screen.getByRole('button', { name: /expand model work panel/i })).toBeInTheDocument();

      act(() => {
        handleRef.current?.reject();
      });

      act(() => {
        handleRef.current?.triggerGenerate();
      });

      expect(await screen.findByRole('button', { name: /collapse model work panel/i })).toBeInTheDocument();
      expect(onGenerate).toHaveBeenCalledTimes(2);
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

  it('renders streamed model work blocks while generation is in progress', async () => {
    const deferred = createDeferred<NlGenerationResult>();
    const handleRef = { current: null as NlQueryWorkflowHandle | null };
    const onGenerate = vi.fn(async (_query, onStreamEvent) => {
      onStreamEvent?.({
        type: 'model_work_block_started',
        blockId: 'plan-1',
        kind: 'plan',
        title: 'Query planning',
        phaseId: 'planning',
        timestamp: new Date().toISOString()
      });
      onStreamEvent?.({
        type: 'model_work_delta',
        blockId: 'plan-1',
        kind: 'plan',
        title: 'Query planning',
        phaseId: 'planning',
        delta: 'Selecting candidate tables.',
        timestamp: new Date().toISOString()
      });
      return deferred.promise;
    });

    render(
      <WorkflowWithRef
        {...buildProps({ onGenerate })}
        handleRef={handleRef}
      />
    );

    act(() => {
      handleRef.current?.triggerGenerate();
    });

    const block = await screen.findByTestId('nl-model-work-block-plan-1');
    await waitFor(() => {
      expect(block).toHaveTextContent(/selecting candidate tables/i);
    });

    await act(async () => {
      deferred.resolve(MOCK_RESULT);
    });
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
