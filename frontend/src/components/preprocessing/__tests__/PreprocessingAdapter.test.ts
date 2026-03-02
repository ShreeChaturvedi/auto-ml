import { beforeEach, describe, expect, it } from 'vitest';

import { createPreprocessingAdapter } from '../PreprocessingAdapter';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import type { ToolCall } from '@/types/llmUi';

describe('PreprocessingAdapter prepareToolCalls', () => {
  beforeEach(() => {
    usePreprocessingStore.setState({
      nextRunCellMode: 'continue'
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
    ]);

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
    ]);

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
    ]);

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
});
