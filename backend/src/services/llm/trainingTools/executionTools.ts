import { appLogger } from '../../../logging/logger.js';
import { executeMcpTool } from '../../mcp/mcpAdapter.js';
import { nowIso } from '../preprocessingTools/helpers.js';

import { resolveExperiment } from './types.js';
import type { TrainingToolContext, TrainingToolHandler, TrainingToolResult } from './types.js';

/**
 * Run notebook cells via MCP and collect execution results.
 * Returns aggregated stdout/stderr and whether all cells succeeded.
 */
async function runCells(
  projectId: string,
  notebookId: string | undefined,
  cellIds: string[]
): Promise<{ succeeded: boolean; outputs: string[]; errors: string[] }> {
  const outputs: string[] = [];
  const errors: string[] = [];
  let allSucceeded = true;

  for (const cellId of cellIds) {
    const result = await executeMcpTool(projectId, 'run_cell', {
      cellId,
      ...(notebookId ? { notebookId } : {})
    });

    if (result.error) {
      allSucceeded = false;
      errors.push(result.error);
    } else if (result.output && typeof result.output === 'object') {
      const out = result.output as Record<string, unknown>;
      if (out.stdout) outputs.push(String(out.stdout));
      if (out.stderr) errors.push(String(out.stderr));
      if (out.status === 'error') allSucceeded = false;
    }
  }

  return { succeeded: allSucceeded, outputs, errors };
}

export const executeTraining: TrainingToolHandler = async (
  ctx: TrainingToolContext
): Promise<TrainingToolResult> => {
  const { args, run, projectId, notebookId } = ctx;

  const resolved = resolveExperiment(run, args);
  if ('error' in resolved) return resolved;
  const { experiment } = resolved;

  const cellIds = Array.isArray(args.cellIds) ? (args.cellIds as string[]) : [];

  // If cellIds are provided, execute them in the Docker container via MCP
  let succeeded = args.succeeded === true;
  let executionErrors: string[] = [];
  const startMs = Date.now();

  if (cellIds.length > 0) {
    try {
      const execResult = await runCells(projectId, notebookId, cellIds);
      succeeded = execResult.succeeded;
      executionErrors = execResult.errors;
    } catch (err) {
      appLogger.error('[executeTraining] Cell execution failed', { err });
      succeeded = false;
      executionErrors = [err instanceof Error ? err.message : 'Cell execution failed'];
    }
  }

  const durationMs = typeof args.trainingDurationMs === 'number'
    ? args.trainingDurationMs
    : Date.now() - startMs;

  experiment.status = succeeded ? 'training' : 'failed';
  experiment.trainingCellIds = cellIds;
  experiment.trainingMetrics = args.metrics;
  experiment.trainingDurationMs = durationMs;
  experiment.errorMessage = succeeded ? undefined : (args.errorMessage ?? executionErrors.join('\n'));
  experiment.updatedAt = nowIso();

  if (!succeeded) {
    return {
      output: {
        experimentId: experiment.experimentId,
        status: 'failed',
        errorMessage: experiment.errorMessage ?? 'Training failed without a specific error message.',
        message: `Training failed for experiment "${experiment.experimentName as string}".`
      }
    };
  }

  return {
    output: {
      experimentId: experiment.experimentId,
      status: 'training',
      metrics: args.metrics ?? {},
      trainingDurationMs: durationMs,
      cellIds,
      message: `Training completed for experiment "${experiment.experimentName as string}". Proceed to evaluate_results.`
    }
  };
};

export const evaluateResults: TrainingToolHandler = async (
  ctx: TrainingToolContext
): Promise<TrainingToolResult> => {
  const { args, run } = ctx;

  const resolved = resolveExperiment(run, args);
  if ('error' in resolved) return resolved;
  const { experiment } = resolved;

  experiment.status = 'evaluated';
  experiment.evaluationMetrics = args.metrics;
  experiment.learningCurve = args.learningCurve;
  experiment.featureImportance = args.featureImportance;
  experiment.evaluationNotes = args.notes;
  experiment.updatedAt = nowIso();

  return {
    output: {
      experimentId: experiment.experimentId,
      status: 'evaluated',
      metrics: args.metrics,
      learningCurve: args.learningCurve ?? null,
      featureImportance: args.featureImportance ?? [],
      notes: args.notes ?? null,
      message: `Evaluation complete for experiment "${experiment.experimentName as string}". Review results before registering.`
    }
  };
};
