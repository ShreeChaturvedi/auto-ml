import { appLogger } from '../../../logging/logger.js';
import { executeMcpTool } from '../../mcp/mcpAdapter.js';
import { nowIso } from '../preprocessingTools/helpers.js';

import { resolveExperiment } from './types.js';
import type { TrainingToolContext, TrainingToolHandler, TrainingToolResult } from './types.js';
import { normalizeWorkflowPrepSegments } from './workflowPrepSegments.js';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function normalizeTargetColumn(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeMetricsRecord(metrics: unknown): Record<string, number> {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    return {};
  }

  const normalized: Record<string, number> = {};
  for (const [key, value] of Object.entries(metrics as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      normalized[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        normalized[key] = parsed;
      }
    }
  }
  return normalized;
}

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
      const status = typeof out.status === 'string' ? out.status.toLowerCase() : null;
      if (status && status !== 'success') {
        allSucceeded = false;
      }
      if (typeof out.error === 'string' && out.error.trim().length > 0) {
        errors.push(out.error);
      }
      if (typeof out.errorMessage === 'string' && out.errorMessage.trim().length > 0) {
        errors.push(out.errorMessage);
      }
      if (out.stderr) errors.push(String(out.stderr));
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

  let succeeded = args.succeeded === true;
  let executionErrors: string[] = [];
  const startMs = Date.now();

  if (cellIds.length > 0 && !succeeded) {
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
  const metricPayload = asRecord(args.metrics);
  const metrics = normalizeMetricsRecord(args.metrics);
  const workflowPrepSegments = normalizeWorkflowPrepSegments(args.prepSegments);
  const targetColumn = normalizeTargetColumn(
    args.targetColumn
    ?? metricPayload?.targetColumn
    ?? metricPayload?.target_column
    ?? experiment.targetColumn
  );

  experiment.status = succeeded ? 'training' : 'failed';
  experiment.trainingCellIds = cellIds;
  experiment.trainingMetrics = metrics;
  experiment.trainingDurationMs = durationMs;
  if (targetColumn) {
    experiment.targetColumn = targetColumn;
  }
  if (workflowPrepSegments.length > 0) {
    experiment.workflowPrepSegments = workflowPrepSegments;
  }
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
      metrics,
      ...(targetColumn ? { targetColumn } : {}),
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
  const metrics = normalizeMetricsRecord(args.metrics);
  const fallbackMetrics = Object.keys(metrics).length > 0
    ? metrics
    : normalizeMetricsRecord(experiment.trainingMetrics);
  const effectiveMetrics = fallbackMetrics;
  if (Object.keys(effectiveMetrics).length === 0) {
    return {
      error: 'evaluate_results requires non-empty numeric metrics (accuracy/F1/precision/recall or RMSE/MAE/R2).'
    };
  }

  experiment.status = 'evaluated';
  experiment.evaluationMetrics = effectiveMetrics;
  experiment.learningCurve = args.learningCurve;
  experiment.featureImportance = args.featureImportance;
  experiment.evaluationNotes = args.notes;
  experiment.updatedAt = nowIso();

  return {
    output: {
      experimentId: experiment.experimentId,
      status: 'evaluated',
      metrics: effectiveMetrics,
      learningCurve: args.learningCurve ?? null,
      featureImportance: args.featureImportance ?? [],
      notes: args.notes ?? null,
      message: `Evaluation complete for experiment "${experiment.experimentName as string}". Review results before registering.`
    }
  };
};
