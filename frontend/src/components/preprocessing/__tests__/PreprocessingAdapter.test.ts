import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPreprocessingAdapter } from '../PreprocessingAdapter';
import { streamPreprocessingPlan } from '@/lib/api/llm';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import type { ToolCall } from '@/types/llmUi';

vi.mock('@/lib/api/llm', () => ({
  streamPreprocessingPlan: vi.fn(async () => undefined)
}));

describe('PreprocessingAdapter prepareToolCalls', () => {
  beforeEach(() => {
    usePreprocessingStore.setState({
      nextRunCellMode: 'continue',
      controllerSummary: null
    });
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
    ], 'prep-thread:test');

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
    ], 'prep-thread:test');

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
    ], 'prep-thread:test');

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

  it('passes threadId and continuation through buildRequest', async () => {
    const adapter = createPreprocessingAdapter('project-1', 'dataset-1', [
      {
        datasetId: 'dataset-1',
        name: 'dataset',
        filename: 'dataset.csv',
        sizeBytes: 123,
        columns: []
      }
    ], 'prep-thread:test');

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

    expect(streamPreprocessingPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        datasetId: 'dataset-1',
        threadId: 'prep-thread:test',
        continuation: true
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

  it('requests dataset-scoped agent execution by default', () => {
    const adapter = createPreprocessingAdapter('project-1', 'dataset-1', [
      {
        datasetId: 'dataset-1',
        name: 'dataset',
        filename: 'dataset.csv',
        sizeBytes: 123,
        columns: []
      }
    ], 'prep-thread:test');

    const execution = adapter.resolveToolExecutionRequest?.([
      {
        id: 'call-1',
        tool: 'materialize_step_code',
        args: {
          stepId: 'step-1'
        }
      }
    ]);

    expect(execution).toEqual({
      datasetId: 'dataset-1',
      executionMode: 'agent'
    });
  });

  it('upgrades commit execution to user approval when pending approval is active', () => {
    usePreprocessingStore.getState().setControllerSummary({
      threadId: 'prep-thread:test',
      turnMode: 'action_required',
      currentNode: 'commit',
      allowedTools: ['commit_transformation_step'],
      allowTextResponse: false,
      requireToolCall: true,
      pendingApproval: true,
      updatedAt: '2026-03-13T00:00:00.000Z'
    });

    const adapter = createPreprocessingAdapter('project-1', 'dataset-1', [
      {
        datasetId: 'dataset-1',
        name: 'dataset',
        filename: 'dataset.csv',
        sizeBytes: 123,
        columns: []
      }
    ], 'prep-thread:test');

    const execution = adapter.resolveToolExecutionRequest?.([
      {
        id: 'call-1',
        tool: 'commit_transformation_step',
        args: {
          stepId: 'step-1',
          approved: true
        }
      }
    ]);

    expect(execution).toEqual({
      datasetId: 'dataset-1',
      executionMode: 'user_approval'
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

  it('uses the selected dataset filename when building suggestions', () => {
    const adapter = createPreprocessingAdapter('project-1', 'dataset-1', [
      {
        datasetId: 'dataset-1',
        name: 'dataset',
        filename: 'customer_churn.csv',
        sizeBytes: 123,
        columns: []
      }
    ], 'prep-thread:test');

    expect(adapter.suggestionProvider([], false)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'missingness',
        prompt: expect.stringContaining('customer_churn')
      })
    ]));
  });
});
