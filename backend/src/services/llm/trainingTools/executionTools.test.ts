import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowRunState, WorkflowTurnRequest } from '../../workflows/types.js';

import type { TrainingToolContext } from './types.js';

// Mock MCP adapter for cell execution
const mockExecuteMcpTool = vi.fn();
vi.mock('../../mcp/mcpAdapter.js', () => ({
  executeMcpTool: (...args: unknown[]) => mockExecuteMcpTool(...args)
}));

const { executeTraining, evaluateResults } = await import('./executionTools.js');

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
      succeeded: false,
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
      succeeded: false
    }));

    expect(result.output).toBeDefined();
    expect((result.output as Record<string, unknown>).status).toBe('failed');
  });

  it('marks as failed when run_cell returns timeout status', async () => {
    mockExecuteMcpTool.mockResolvedValue({
      output: {
        status: 'timeout',
        stdout: '',
        stderr: 'Execution timed out after 30000ms'
      }
    });

    const result = await executeTraining(buildCtx({
      experimentId: 'exp-1',
      cellIds: ['cell-1'],
      succeeded: false
    }));

    expect(result.output).toBeDefined();
    expect((result.output as Record<string, unknown>).status).toBe('failed');
  });

  it('works without cellIds (records state only)', async () => {
    const ctx = buildCtx({
      experimentId: 'exp-1',
      succeeded: true,
      metrics: { accuracy: 0.85 },
      prepSegments: ['df = pd.read_csv("data.csv")', 'X_train = df[["feat"]].copy()']
    });
    const result = await executeTraining(ctx);

    expect(mockExecuteMcpTool).not.toHaveBeenCalled();
    expect(result.output).toBeDefined();
    expect((result.output as Record<string, unknown>).status).toBe('training');
    const experiments = ctx.run.metadata?.experiments as Record<string, Record<string, unknown>>;
    expect(experiments['exp-1'].workflowPrepSegments).toEqual([
      'df = pd.read_csv("data.csv")',
      'X_train = df[["feat"]].copy()'
    ]);
  });

  it('returns error for missing experimentId', async () => {
    const result = await executeTraining(buildCtx({
      succeeded: true
    }));

    expect(result.error).toBeDefined();
  });
});

describe('evaluateResults', () => {
  it('requires non-empty numeric metrics', async () => {
    const result = await evaluateResults(buildCtx({
      experimentId: 'exp-1',
      notes: 'No metric payload provided'
    }));

    expect(result.error).toContain('requires non-empty numeric metrics');
  });

  it('accepts numeric string metrics and normalizes them', async () => {
    const result = await evaluateResults(buildCtx({
      experimentId: 'exp-1',
      metrics: { accuracy: '0.91', macro_f1: '0.52' },
      notes: 'from notebook'
    }));

    expect(result.error).toBeUndefined();
    const output = result.output as Record<string, unknown>;
    expect(output.metrics).toEqual({ accuracy: 0.91, macro_f1: 0.52 });
  });

  it('falls back to stored training metrics when the caller omits metrics', async () => {
    const ctx = buildCtx({
      experimentId: 'exp-1',
      notes: 'reuse metrics captured during execute_training'
    });
    const experiments = ctx.run.metadata?.experiments as Record<string, Record<string, unknown>>;
    experiments['exp-1'].trainingMetrics = { rmse: 0.58, mae: 0.43, r2: 0.24 };

    const result = await evaluateResults(ctx);

    expect(result.error).toBeUndefined();
    const output = result.output as Record<string, unknown>;
    expect(output.metrics).toEqual({ rmse: 0.58, mae: 0.43, r2: 0.24 });
  });
});
