import { beforeEach, describe, expect, it, vi } from 'vitest';

import { streamWorkflowTurn } from '@/lib/api/llm';
import { useNotebookStore } from '@/stores/notebookStore';
import { useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import { createTrainingAdapter } from '../TrainingAdapter';

vi.mock('@/lib/api/llm', () => ({
  streamWorkflowTurn: vi.fn(async () => undefined)
}));

describe('TrainingAdapter', () => {
  beforeEach(() => {
    useWorkflowSessionStore.setState({ sessions: {} });
    useNotebookStore.setState({
      activeNotebookId: null,
      loadCells: vi.fn(async () => undefined),
      loadCell: vi.fn(async () => null),
      updateCellLocally: vi.fn(),
      removeCellLocally: vi.fn()
    } as Partial<ReturnType<typeof useNotebookStore.getState>>);
    vi.mocked(streamWorkflowTurn).mockClear();
  });

  it('reuses the persisted workflow session when building requests', async () => {
    useWorkflowSessionStore.getState().updateSession('training-session', {
      runId: 'training-run-1',
      threadId: 'training-thread-1',
      phase: 'training',
      currentNode: 'plan_training_workflow',
      status: 'running'
    });

    const adapter = createTrainingAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: 'churn',
      featureSummary: 'Validated categorical and scaling pipeline.',
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'training-session'
    });

    await adapter.buildRequest(
      'Train a baseline model.',
      undefined,
      undefined,
      () => undefined,
      new AbortController().signal,
      {
        model: 'gpt-5.4',
        reasoningEffort: 'medium'
      }
    );

    expect(streamWorkflowTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'training',
        runId: 'training-run-1',
        threadId: 'training-thread-1'
      }),
      expect.any(Function),
      expect.any(AbortSignal)
    );
  });

  it('does not reuse completed workflow sessions for a fresh training prompt', async () => {
    useWorkflowSessionStore.getState().updateSession('training-session', {
      runId: 'training-run-completed',
      threadId: 'training-thread-completed',
      phase: 'training',
      currentNode: 'register_model',
      status: 'completed'
    });

    const adapter = createTrainingAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: 'usage_log1p',
      featureSummary: undefined,
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'training-session'
    });

    await adapter.buildRequest(
      'Train another baseline model.',
      undefined,
      undefined,
      () => undefined,
      new AbortController().signal,
      {
        model: 'gpt-5.4',
        reasoningEffort: 'medium'
      }
    );

    expect(streamWorkflowTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'training',
        runId: undefined,
        threadId: undefined
      }),
      expect.any(Function),
      expect.any(AbortSignal)
    );
    expect(useWorkflowSessionStore.getState().getSession('training-session')).toBeUndefined();
  });

  it('prefers config.getNotebookId() over useNotebookStore.activeNotebookId', async () => {
    // Simulate a stale FE notebook lingering in the global store — this is
    // what would happen when the user is coming from the Feature Engineering
    // tab. The adapter MUST use the training-scoped getter supplied by
    // TrainingPanel, NOT the global fallback.
    useNotebookStore.setState({ activeNotebookId: 'fe-leftover-notebook' });

    const adapter = createTrainingAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: 'churn',
      featureSummary: undefined,
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'training-session',
      getNotebookId: () => 'training-scoped-notebook'
    });

    await adapter.buildRequest(
      'Train the baseline.',
      undefined,
      undefined,
      () => undefined,
      new AbortController().signal,
      { model: 'gpt-5.4', reasoningEffort: 'medium' }
    );

    expect(streamWorkflowTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        notebookId: 'training-scoped-notebook'
      }),
      expect.any(Function),
      expect.any(AbortSignal)
    );
  });

  it('reads the getter at request-build time so late resolution is picked up', async () => {
    // Simulates a TrainingPanel ref-backed getter whose value is populated
    // after the adapter is constructed — e.g., because useTrainingNotebookSync
    // resolves the notebook asynchronously. The adapter identity is stable
    // while the resolved id propagates through the ref.
    let resolvedNotebookId: string | null = null;
    const adapter = createTrainingAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: undefined,
      featureSummary: undefined,
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'training-session',
      getNotebookId: () => resolvedNotebookId ?? undefined
    });

    // First call before the sync hook resolves — notebookId should be undefined.
    await adapter.buildRequest(
      'First turn.',
      undefined,
      undefined,
      () => undefined,
      new AbortController().signal,
      { model: 'gpt-5.4', reasoningEffort: 'medium' }
    );
    expect(streamWorkflowTurn).toHaveBeenLastCalledWith(
      expect.objectContaining({ notebookId: undefined }),
      expect.any(Function),
      expect.any(AbortSignal)
    );

    // Simulate sync hook landing the resolved notebookId into the ref.
    resolvedNotebookId = 'late-resolved-notebook';

    // Second call after resolution — the SAME adapter instance returns the
    // new notebookId via the getter. This is the stable-identity contract
    // that prevents useAgenticLoop churn.
    await adapter.buildRequest(
      'Second turn.',
      undefined,
      undefined,
      () => undefined,
      new AbortController().signal,
      { model: 'gpt-5.4', reasoningEffort: 'medium' }
    );
    expect(streamWorkflowTurn).toHaveBeenLastCalledWith(
      expect.objectContaining({ notebookId: 'late-resolved-notebook' }),
      expect.any(Function),
      expect.any(AbortSignal)
    );
  });

  it('falls back to the global activeNotebookId when getNotebookId is absent', async () => {
    // Backward-compatibility path. Tracks the pre-sync-hook behaviour and
    // guards bisect-safety between the adapter refactor and the Panel wire.
    useNotebookStore.setState({ activeNotebookId: 'global-notebook-1' });

    const adapter = createTrainingAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: undefined,
      featureSummary: undefined,
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'training-session'
    });

    await adapter.buildRequest(
      'Fallback turn.',
      undefined,
      undefined,
      () => undefined,
      new AbortController().signal,
      { model: 'gpt-5.4', reasoningEffort: 'medium' }
    );

    expect(streamWorkflowTurn).toHaveBeenCalledWith(
      expect.objectContaining({ notebookId: 'global-notebook-1' }),
      expect.any(Function),
      expect.any(AbortSignal)
    );
  });

  it('refreshes the full notebook after write_cell results', async () => {
    const loadCells = vi.fn(async () => undefined);
    useNotebookStore.setState({ loadCells } as Partial<ReturnType<typeof useNotebookStore.getState>>);

    const adapter = createTrainingAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: undefined,
      featureSummary: undefined,
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'training-session'
    });

    adapter.toolRegistry.write_cell.onResult?.(
      {
        id: 'tool-call-1',
        tool: 'write_cell',
        args: { content: 'print("hello")' }
      },
      {
        id: 'tool-call-1',
        tool: 'write_cell',
        output: {
          cellId: 'cell-1',
          notebookId: 'notebook-1',
          cellType: 'code',
          content: 'print("hello")',
          position: 0,
          metadata: {},
          executionCount: 0,
          executionStatus: 'idle',
          isDirty: false,
          output: [],
          outputRefs: [],
          createdAt: '2026-04-08T00:00:00.000Z',
          updatedAt: '2026-04-08T00:00:00.000Z'
        }
      }
    );

    await Promise.resolve();

    expect(loadCells).toHaveBeenCalledTimes(1);
  });

  it('refreshes the executed cell after run_cell results', async () => {
    const loadCell = vi.fn(async () => null);
    const updateCellLocally = vi.fn();
    useNotebookStore.setState({
      loadCell,
      updateCellLocally,
      cells: [{
        cellId: 'cell-9',
        notebookId: 'notebook-1',
        cellType: 'code',
        content: 'print("hi")',
        position: 0,
        metadata: {},
        executionCount: 1,
        executionOrder: 1,
        executionStatus: 'idle',
        executionDurationMs: null,
        isDirty: false,
        output: [],
        outputRefs: [],
        createdAt: '2026-04-08T00:00:00.000Z',
        updatedAt: '2026-04-08T00:00:00.000Z'
      }]
    } as Partial<ReturnType<typeof useNotebookStore.getState>>);

    const adapter = createTrainingAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: undefined,
      featureSummary: undefined,
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'training-session'
    });

    adapter.toolRegistry.run_cell.onResult?.(
      {
        id: 'tool-call-2',
        tool: 'run_cell',
        args: { cellId: 'cell-9' }
      },
      {
        id: 'tool-call-2',
        tool: 'run_cell',
        output: {
          status: 'success',
          cellId: 'cell-9',
          executionMs: 1234,
          executionOrder: 2
        }
      }
    );

    await Promise.resolve();

    expect(updateCellLocally).toHaveBeenCalledWith(expect.objectContaining({
      cellId: 'cell-9',
      executionStatus: 'success',
      executionDurationMs: 1234,
      executionOrder: 2
    }));
    expect(loadCell).toHaveBeenCalledWith('cell-9');
  });

  it('does not claim raw-column training when the selected dataset is already derived', () => {
    const adapter = createTrainingAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: undefined,
      featureSummary: undefined,
      datasetFiles: [{
        id: 'file-1',
        name: 'feature_v1.csv',
        type: 'csv',
        size: 100,
        uploadedAt: new Date(),
        projectId: 'project-1',
        metadata: {
          datasetId: 'dataset-1',
          derivedFrom: 'dataset-raw'
        }
      }],
      documentFiles: [],
      sessionKey: 'training-session'
    });

    const tips = adapter.tipsProvider?.([], false) ?? [];
    const contents = tips.map((tip) => tip.content);

    expect(contents).toContain('Using a derived dataset — features may already be materialized in the table');
    expect(contents).not.toContain('No feature pipeline — model trains on raw columns');
  });
});
