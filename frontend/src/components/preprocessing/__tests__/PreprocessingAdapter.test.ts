import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPreprocessingAdapter } from '../PreprocessingAdapter';
import { streamWorkflowTurn } from '@/lib/api/llm';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import { useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import type { ToolCall } from '@/types/llmUi';

vi.mock('@/lib/api/llm', () => ({
  streamWorkflowTurn: vi.fn(async () => undefined)
}));

describe('PreprocessingAdapter prepareToolCalls', () => {
  beforeEach(() => {
    usePreprocessingStore.setState({
      nextRunCellMode: 'continue',
      runId: null,
      controllerSummary: null
    });
    useWorkflowSessionStore.setState({ sessions: {} });
  });

  it('injects continue mode into run_cell metadata by default', () => {
    const adapter = createPreprocessingAdapter('project-1', 'dataset-1', [
      {
        datasetId: 'dataset-1',
        name: 'dataset',
        filename: 'dataset.csv',
        sizeBytes: 123,
        columns: []
      }
    ], 'prep-tab-a');

    const toolCalls: ToolCall[] = [
      {
        id: 'call-1',
        tool: 'run_cell',
        args: {
          cellId: 'cell-1'
        }
      }
    ];

    const prepared = adapter.prepareToolCalls?.(toolCalls) ?? [];
    expect(prepared[0].args?.metadata).toMatchObject({
      preprocessing: {
        datasetContinuityMode: 'continue'
      }
    });
  });

  it('consumes restart mode for first run_cell then falls back to continue', () => {
    usePreprocessingStore.getState().setNextRunCellMode('restart_from_original');
    const adapter = createPreprocessingAdapter('project-1', 'dataset-1', [
      {
        datasetId: 'dataset-1',
        name: 'dataset',
        filename: 'dataset.csv',
        sizeBytes: 123,
        columns: []
      }
    ], 'prep-tab-a');

    const firstBatch: ToolCall[] = [
      {
        id: 'call-1',
        tool: 'run_cell',
        args: {
          cellId: 'cell-1'
        }
      }
    ];
    const firstPrepared = adapter.prepareToolCalls?.(firstBatch) ?? [];
    expect(firstPrepared[0].args?.metadata).toMatchObject({
      preprocessing: {
        datasetContinuityMode: 'restart_from_original'
      }
    });

    const secondBatch: ToolCall[] = [
      {
        id: 'call-2',
        tool: 'run_cell',
        args: {
          cellId: 'cell-2'
        }
      }
    ];
    const secondPrepared = adapter.prepareToolCalls?.(secondBatch) ?? [];
    expect(secondPrepared[0].args?.metadata).toMatchObject({
      preprocessing: {
        datasetContinuityMode: 'continue'
      }
    });
  });

  it('leaves non run_cell tool calls unchanged', () => {
    usePreprocessingStore.getState().setNextRunCellMode('restart_from_original');
    const adapter = createPreprocessingAdapter('project-1', 'dataset-1', [
      {
        datasetId: 'dataset-1',
        name: 'dataset',
        filename: 'dataset.csv',
        sizeBytes: 123,
        columns: []
      }
    ], 'prep-tab-a');

    const toolCalls: ToolCall[] = [
      {
        id: 'call-1',
        tool: 'validate_step_result',
        args: {
          stepId: 'step-1'
        }
      }
    ];

    const prepared = adapter.prepareToolCalls?.(toolCalls) ?? [];
    expect(prepared).toEqual(toolCalls);
    expect(usePreprocessingStore.getState().nextRunCellMode).toBe('restart_from_original');
  });

  it('passes workflow session state through buildRequest', async () => {
    useWorkflowSessionStore.setState({
      sessions: {
        'prep-tab-a': {
          runId: 'workflow-run-1',
          threadId: 'workflow-thread-1'
        }
      }
    });

    const adapter = createPreprocessingAdapter('project-1', 'dataset-1', [
      {
        datasetId: 'dataset-1',
        name: 'dataset',
        filename: 'dataset.csv',
        sizeBytes: 123,
        columns: []
      }
    ], 'prep-tab-a');

    await adapter.buildRequest(
      'Continue preprocessing',
      undefined,
      undefined,
      () => undefined,
      new AbortController().signal,
      {
        model: 'gpt-5.4',
        reasoningEffort: 'high',
        continuation: true
      }
    );

    expect(streamWorkflowTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        phase: 'preprocessing',
        datasetId: 'dataset-1',
        runId: 'workflow-run-1',
        threadId: 'workflow-thread-1'
      }),
      expect.any(Function),
      expect.any(AbortSignal)
    );
  });

  it('uses the active preprocessing workbook notebook instead of the global active notebook', async () => {
    const adapter = createPreprocessingAdapter('project-1', 'dataset-1', [
      {
        datasetId: 'dataset-1',
        name: 'dataset',
        filename: 'dataset.csv',
        sizeBytes: 123,
        columns: []
      }
    ], 'prep-tab-a', 'prep-notebook-1');

    await adapter.buildRequest(
      'Continue preprocessing',
      undefined,
      undefined,
      () => undefined,
      new AbortController().signal,
      {
        model: 'gpt-5.4',
        reasoningEffort: 'high',
        continuation: true
      }
    );

    expect(streamWorkflowTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        phase: 'preprocessing',
        datasetId: 'dataset-1',
        notebookId: 'prep-notebook-1'
      }),
      expect.any(Function),
      expect.any(AbortSignal)
    );
  });

  it('does not fall back to a global controller thread when the workbook has no session', async () => {
    usePreprocessingStore.setState({
      runId: null,
      controllerSummary: {
        threadId: 'stale-thread-from-another-workbook',
        turnMode: 'action_required',
        currentNode: 'plan_step',
        allowedTools: ['profile_active_dataset'],
        allowTextResponse: false,
        requireToolCall: true,
        pendingApproval: false,
        updatedAt: '2026-03-21T00:00:00.000Z'
      }
    });

    const adapter = createPreprocessingAdapter('project-1', 'dataset-1', [
      {
        datasetId: 'dataset-1',
        name: 'dataset',
        filename: 'dataset.csv',
        sizeBytes: 123,
        columns: []
      }
    ], 'prep-tab-b');

    await adapter.buildRequest(
      'Start a clean workbook session',
      undefined,
      undefined,
      () => undefined,
      new AbortController().signal,
      {
        model: 'gpt-5.4',
        reasoningEffort: 'high',
        continuation: false
      }
    );

    expect(streamWorkflowTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        phase: 'preprocessing',
        datasetId: 'dataset-1',
        threadId: undefined
      }),
      expect.any(Function),
      expect.any(AbortSignal)
    );
  });

  it('drops a stale thread-shaped session run id before building the next request', async () => {
    usePreprocessingStore.setState({
      runId: 'prep-run-1'
    });
    useWorkflowSessionStore.setState({
      sessions: {
        'prep-tab-a': {
          runId: 'thread-stale',
          threadId: 'workflow-thread-1'
        }
      }
    });

    const adapter = createPreprocessingAdapter('project-1', 'dataset-1', [
      {
        datasetId: 'dataset-1',
        name: 'dataset',
        filename: 'dataset.csv',
        sizeBytes: 123,
        columns: []
      }
    ], 'prep-tab-a');

    await adapter.buildRequest(
      'Handle missing values',
      undefined,
      undefined,
      () => undefined,
      new AbortController().signal,
      {
        model: 'gpt-5.4',
        reasoningEffort: 'high',
        continuation: false
      }
    );

    expect(streamWorkflowTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        phase: 'preprocessing',
        datasetId: 'dataset-1',
        runId: undefined,
        threadId: undefined
      }),
      expect.any(Function),
      expect.any(AbortSignal)
    );
    expect(useWorkflowSessionStore.getState().sessions['prep-tab-a']).toBeUndefined();
    expect(usePreprocessingStore.getState().runId).toBeNull();
  });

  it('does not send the preprocessing snapshot run id as the workflow run id fallback', async () => {
    usePreprocessingStore.setState({
      runId: 'prep-run-1'
    });

    const adapter = createPreprocessingAdapter('project-1', 'dataset-1', [
      {
        datasetId: 'dataset-1',
        name: 'dataset',
        filename: 'dataset.csv',
        sizeBytes: 123,
        columns: []
      }
    ], 'prep-tab-a');

    await adapter.buildRequest(
      'Scale numeric columns',
      undefined,
      undefined,
      () => undefined,
      new AbortController().signal,
      {
        model: 'gpt-5.4',
        reasoningEffort: 'high',
        continuation: false
      }
    );

    expect(streamWorkflowTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        phase: 'preprocessing',
        datasetId: 'dataset-1',
        runId: undefined,
        threadId: undefined
      }),
      expect.any(Function),
      expect.any(AbortSignal)
    );
  });

  it('stores controller updates from the adapter callback', () => {
    const adapter = createPreprocessingAdapter('project-1', 'dataset-1', [
      {
        datasetId: 'dataset-1',
        name: 'dataset',
        filename: 'dataset.csv',
        sizeBytes: 123,
        columns: []
      }
    ], 'prep-thread:test');

    adapter.onControllerUpdate?.({
      threadId: 'prep-thread:test',
      turnMode: 'action_required',
      currentNode: 'generate_code',
      allowedTools: ['materialize_step_code'],
      allowTextResponse: false,
      requireToolCall: true,
      pendingApproval: false,
      updatedAt: '2026-03-13T00:00:00.000Z'
    });

    expect(usePreprocessingStore.getState().controllerSummary).toMatchObject({
      threadId: 'prep-thread:test',
      currentNode: 'generate_code'
    });
  });

  it('stores workflow state updates in both preprocessing and workflow session stores', () => {
    const adapter = createPreprocessingAdapter('project-1', 'dataset-1', [
      {
        datasetId: 'dataset-1',
        name: 'dataset',
        filename: 'dataset.csv',
        sizeBytes: 123,
        columns: []
      }
    ], 'prep-tab-a');

    adapter.onWorkflowStateUpdate?.({
      runId: 'workflow-run-1',
      threadId: 'workflow-thread-1',
      phase: 'preprocessing',
      currentNode: 'plan_step',
      status: 'running',
      phaseContext: {
        controller: {
          threadId: 'workflow-thread-1',
          runId: 'prep-run-1',
          turnMode: 'action_required',
          currentNode: 'plan_step',
          allowedTools: ['propose_transformation_step'],
          allowTextResponse: false,
          requireToolCall: true,
          pendingApproval: false,
          updatedAt: '2026-03-13T00:00:00.000Z'
        }
      }
    });

    expect(usePreprocessingStore.getState().runId).toBe('prep-run-1');
    expect(useWorkflowSessionStore.getState().sessions['prep-tab-a']).toMatchObject({
      runId: 'workflow-run-1',
      threadId: 'workflow-thread-1'
    });
  });

  it('marks pending preprocessing steps as failed on stream errors and stops', () => {
    usePreprocessingStore.setState({
      timeline: [
        {
          id: 'evt-1',
          runId: 'prep-run-1',
          stepId: 'step-1',
          toolName: 'propose_transformation_step',
          title: 'Scale numerics',
          status: 'pending',
          requiresApproval: false,
          cellIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ]
    });

    const adapter = createPreprocessingAdapter('project-1', 'dataset-1', [
      {
        datasetId: 'dataset-1',
        name: 'dataset',
        filename: 'customer_churn.csv',
        sizeBytes: 123,
        columns: []
      }
    ], 'prep-thread:test');

    adapter.onStreamError?.('Provider failed');
    expect(usePreprocessingStore.getState().timeline[0]).toMatchObject({
      status: 'failed'
    });

    usePreprocessingStore.setState({
      timeline: [
        {
          id: 'evt-2',
          runId: 'prep-run-1',
          stepId: 'step-2',
          toolName: 'materialize_step_code',
          title: 'Generate code',
          status: 'running',
          requiresApproval: false,
          cellIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ],
      error: null
    });

    adapter.onStop?.('Stopped by user.');
    expect(usePreprocessingStore.getState().timeline[0]).toMatchObject({
      status: 'failed'
    });
    expect(usePreprocessingStore.getState().error).toContain('Stopped by user');
  });

  it('clears stale workflow session state when the backend reports a missing run', () => {
    usePreprocessingStore.setState({
      runId: 'prep-run-1',
      selectedDatasetId: 'dataset-1',
      controllerSummary: {
        threadId: 'thread-stale',
        turnMode: 'action_required',
        currentNode: 'plan_step',
        allowedTools: ['profile_active_dataset'],
        allowTextResponse: false,
        requireToolCall: true,
        pendingApproval: false,
        updatedAt: '2026-03-21T00:00:00.000Z'
      }
    });
    useWorkflowSessionStore.setState({
      sessions: {
        'prep-tab-a': {
          runId: 'prep-run-1',
          threadId: 'thread-stale'
        }
      }
    });

    const adapter = createPreprocessingAdapter('project-1', 'dataset-1', [
      {
        datasetId: 'dataset-1',
        name: 'dataset',
        filename: 'customer_churn.csv',
        sizeBytes: 123,
        columns: []
      }
    ], 'prep-tab-a');

    adapter.onStreamError?.('Run thread-stale not found.');

    expect(useWorkflowSessionStore.getState().sessions['prep-tab-a']).toBeUndefined();
    expect(usePreprocessingStore.getState().runId).toBeNull();
    expect(usePreprocessingStore.getState().controllerSummary).toBeNull();
  });

  it('clears stale workflow session state when a tool result reports a missing run', () => {
    usePreprocessingStore.setState({
      runId: 'prep-run-1',
      selectedDatasetId: 'dataset-1'
    });
    useWorkflowSessionStore.setState({
      sessions: {
        'prep-tab-a': {
          runId: 'prep-run-1',
          threadId: 'thread-stale'
        }
      }
    });

    const adapter = createPreprocessingAdapter('project-1', 'dataset-1', [
      {
        datasetId: 'dataset-1',
        name: 'dataset',
        filename: 'customer_churn.csv',
        sizeBytes: 123,
        columns: []
      }
    ], 'prep-tab-a');

    adapter.toolRegistry?.propose_transformation_step?.onResult?.(
      {
        id: 'call-1',
        tool: 'propose_transformation_step',
        args: {}
      },
      {
        id: 'call-1',
        tool: 'propose_transformation_step',
        error: 'Run thread-stale not found.'
      }
    );

    expect(useWorkflowSessionStore.getState().sessions['prep-tab-a']).toBeUndefined();
    expect(usePreprocessingStore.getState().runId).toBeNull();
  });

  it('returns contextual tips with correct shape', () => {
    const adapter = createPreprocessingAdapter('project-1', 'dataset-1', [
      {
        datasetId: 'dataset-1',
        name: 'dataset',
        filename: 'customer_churn.csv',
        sizeBytes: 123,
        columns: []
      }
    ], 'prep-thread:test');

    const tips = adapter.tipsProvider?.([], false) ?? [];
    expect(tips.length).toBeGreaterThan(0);
    for (const tip of tips) {
      expect(typeof tip.id).toBe('string');
      expect(tip.icon).toBeDefined();
      expect(tip.content).toBeDefined();
    }
  });
});
