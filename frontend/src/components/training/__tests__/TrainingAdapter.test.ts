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
    useNotebookStore.setState({ activeNotebookId: null });
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
});
