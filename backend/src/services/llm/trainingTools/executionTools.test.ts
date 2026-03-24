import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowRunState, WorkflowTurnRequest } from '../../workflows/types.js';

import type { TrainingToolContext } from './types.js';

// Mock MCP adapter for cell execution
const mockExecuteMcpTool = vi.fn();
vi.mock('../../mcp/mcpAdapter.js', () => ({
  executeMcpTool: (...args: unknown[]) => mockExecuteMcpTool(...args)
}));

const { executeTraining } = await import('./executionTools.js');

function buildRun(): WorkflowRunState {
  return {
    runId: 'run-1',
    threadId: 'thread-1',
    projectId: 'project-1',
    phase: 'training',
    status: 'running',
    currentNode: 'execute_training',
    revision: 1,
    retryBudget: 3,
    repairAttemptCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      experiments: {
        'exp-1': {
          experimentId: 'exp-1',
          experimentName: 'Test Experiment',
          modelType: 'random_forest',
          status: 'proposed',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
    }
  };
}

function buildTurn(): WorkflowTurnRequest {
  return {
    projectId: 'project-1',
    phase: 'training',
    datasetId: 'dataset-1',
    prompt: 'Train the model'
  };
}

function buildCtx(args: Record<string, unknown>): TrainingToolContext {
  return {
    projectId: 'project-1',
    toolCallId: 'tc-1',
    args,
    datasetId: 'dataset-1',
    notebookId: 'nb-1',
    run: buildRun(),
    turn: buildTurn()
  };
}

describe('executeTraining', () => {
  beforeEach(() => {
    mockExecuteMcpTool.mockReset();
  });

  it('executes cells via MCP when cellIds are provided', async () => {
    mockExecuteMcpTool.mockResolvedValue({
      output: { status: 'success', stdout: 'Training complete' }
    });

    const result = await executeTraining(buildCtx({
      experimentId: 'exp-1',
      cellIds: ['cell-1', 'cell-2'],
      succeeded: true,
      metrics: { accuracy: 0.9 }
    }));

    expect(mockExecuteMcpTool).toHaveBeenCalledTimes(2);
    expect(mockExecuteMcpTool).toHaveBeenCalledWith('project-1', 'run_cell', {
      cellId: 'cell-1',
      notebookId: 'nb-1'
    });
    expect(result.output).toBeDefined();
    expect((result.output as Record<string, unknown>).status).toBe('training');
  });

  it('marks as failed when cell execution returns error', async () => {
    mockExecuteMcpTool.mockResolvedValue({
      error: 'SyntaxError: invalid syntax'
    });

    const result = await executeTraining(buildCtx({
      experimentId: 'exp-1',
      cellIds: ['cell-1'],
      succeeded: true
    }));

    expect(result.output).toBeDefined();
    expect((result.output as Record<string, unknown>).status).toBe('failed');
  });

  it('works without cellIds (records state only)', async () => {
    const result = await executeTraining(buildCtx({
      experimentId: 'exp-1',
      succeeded: true,
      metrics: { accuracy: 0.85 }
    }));

    expect(mockExecuteMcpTool).not.toHaveBeenCalled();
    expect(result.output).toBeDefined();
    expect((result.output as Record<string, unknown>).status).toBe('training');
  });

  it('returns error for missing experimentId', async () => {
    const result = await executeTraining(buildCtx({
      succeeded: true
    }));

    expect(result.error).toBeDefined();
  });
});
