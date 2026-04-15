import { describe, expect, it, vi } from 'vitest';

import type { PreprocessingRunState } from '../../../repositories/preprocessingRunRepository.js';

import { executeTransformationStep } from './transformationTools.js';

function createRun(): PreprocessingRunState {
  return {
    runId: 'prep-run-1',
    projectId: 'project-1',
    activeDatasetId: 'dataset-1',
    derivedDatasetIds: [],
    steps: {
      'step-1': {
        stepId: 'step-1',
        title: 'Clean data',
        intentType: 'data_cleaning',
        status: 'pending',
        version: 1,
        code: 'print("hi")',
        codeHash: 'hash-1',
        cellIds: [],
        requiresApproval: false,
        lastExecuteSucceeded: false,
        lastValidateSucceeded: false,
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T00:00:00.000Z'
      }
    },
    checkpoints: [],
    events: [],
    createdAt: '2026-04-10T00:00:00.000Z',
    updatedAt: '2026-04-10T00:00:00.000Z'
  };
}

describe('executeTransformationStep', () => {
  it('returns a success status for successful execution while keeping the step in running state', async () => {
    const run = createRun();
    const result = await executeTransformationStep({
      projectId: 'project-1',
      toolCallId: 'tool-call-1',
      run,
      args: {
        stepId: 'step-1',
        cellIds: ['cell-1'],
        succeeded: true,
        stdout: 'done',
        stderr: 'warning only'
      },
      datasetRepository: {} as never,
      runRepository: { save: vi.fn() } as never,
      cellMetadataStore: { apply: vi.fn() },
      cellInspector: { read: vi.fn() }
    });

    expect(result.error).toBeUndefined();
    expect(result.output).toMatchObject({
      stepId: 'step-1',
      status: 'success',
      succeeded: true,
      stdout: 'done',
      stderr: 'warning only',
      step: {
        stepId: 'step-1',
        status: 'running',
        lastExecuteSucceeded: true
      }
    });
  });
});
