import { join } from 'node:path';

import { env } from '../../../config.js';
import { appLogger } from '../../../logging/logger.js';
import { getOrCreateContainer, isDockerAvailable } from '../../containerManager.js';
import * as kernelManager from '../../kernelManager.js';
import { nowIso } from '../preprocessingTools/helpers.js';

import type { FeatureToolContext, FeatureToolHandler } from './types.js';

/**
 * execute_feature — run the materialized feature code in Docker and persist
 * actual execution results. Falls back to LLM-reported results only when
 * Docker is unavailable.
 */
export const executeFeature: FeatureToolHandler = async (ctx: FeatureToolContext) => {
  const { args } = ctx;
  const featureId = args.featureId as string;

  if (!featureId) {
    return { error: 'execute_feature requires featureId' };
  }

  // Resolve code from the run state (materialized earlier) or from args
  const code = (ctx.run?.features[featureId]?.code as string) ?? (args.code as string);

  if (!code) {
    return { error: `No code found for feature ${featureId}. Call materialize_feature_code first.` };
  }

  let succeeded: boolean;
  let stdout: string | undefined;
  let stderr: string | undefined;
  let executionMs: number | undefined;

  const useNotebookExecutionResult = typeof args.cellId === 'string' || args.executionSource === 'notebook';
  const dockerReady = useNotebookExecutionResult ? false : await isDockerAvailable();

  if (useNotebookExecutionResult) {
    succeeded = (args.succeeded as boolean) ?? false;
    stdout = args.stdout as string | undefined;
    stderr = args.stderr as string | undefined;
    executionMs = args.executionMs as number | undefined;
  } else if (dockerReady) {
    const startMs = Date.now();
    try {
      const container = await getOrCreateContainer({
        projectId: ctx.projectId,
        pythonVersion: '3.11',
        workspacePath: join(env.executionWorkspaceDir, ctx.projectId)
      });

      const result = await kernelManager.execute(container, code, env.executionTimeoutMs);
      executionMs = Date.now() - startMs;
      succeeded = result.status === 'success';
      stdout = result.stdout || undefined;
      stderr = result.stderr || undefined;
    } catch (error) {
      executionMs = Date.now() - startMs;
      succeeded = false;
      stderr = error instanceof Error ? error.message : 'Docker execution failed';
      appLogger.error('[execute_feature] Docker execution error', { featureId, error });
    }
  } else {
    // Docker unavailable — accept LLM-reported result as fallback
    succeeded = (args.succeeded as boolean) ?? true;
    stdout = args.stdout as string | undefined;
    stderr = args.stderr as string | undefined;
    executionMs = args.executionMs as number | undefined;
  }

  const output = {
    status: succeeded ? 'ok' : 'failed',
    message: succeeded ? 'Feature execution succeeded' : 'Feature execution failed',
    featureId,
    succeeded,
    stdout,
    stderr,
    executionMs,
    dockerExecution: dockerReady,
    executionSource: useNotebookExecutionResult ? 'notebook' : 'docker',
    runId: ctx.run?.runId
  };

  if (ctx.run && ctx.runRepository) {
    const step = ctx.run.features[featureId];
    if (step) {
      step.executionResult = { succeeded, stdout, stderr, executionMs };
      step.status = succeeded ? 'executed' : 'failed';
      step.updatedAt = nowIso();
      await ctx.runRepository.save(ctx.run);
    }
  }

  return { output };
};

/**
 * validate_feature — check null rate, correlation, leakage risk, and distribution.
 * Persists validation metrics when a run is available.
 */
export const validateFeature: FeatureToolHandler = async (ctx: FeatureToolContext) => {
  const { args } = ctx;
  const featureId = args.featureId as string;

  if (!featureId) {
    return { error: 'validate_feature requires featureId' };
  }

  // Guard: require successful execution before validation (mirrors preprocessing's
  // STEP_VALIDATE_REQUIRES_SUCCESSFUL_EXECUTE gate in stepValidationHandler.ts).
  if (ctx.run) {
    const step = ctx.run.features[featureId];
    if (step && step.status !== 'executed') {
      return {
        error: `Feature "${featureId}" must be successfully executed before validation. Current status: ${step.status}. If you edited the cell, re-run it first.`
      };
    }
    if (step?.executionResult && !step.executionResult.succeeded) {
      return {
        error: `Feature "${featureId}" execution failed. Fix the code, re-execute, and then validate.`
      };
    }
  }

  const validation = {
    nullRate: (args.nullRate as number) ?? null,
    correlationWithTarget: (args.correlationWithTarget as number) ?? null,
    leakageRisk: (args.leakageRisk as string) ?? 'none',
    distributionNotes: (args.distributionNotes as string) ?? null
  };

  const output = {
    status: 'ok',
    message: 'Feature validated',
    featureId,
    validation,
    requiresApproval: (args.requiresApproval as boolean) ?? false,
    runId: ctx.run?.runId
  };

  if (ctx.run && ctx.runRepository) {
    const step = ctx.run.features[featureId];
    if (step) {
      step.validation = {
        nullRate: validation.nullRate ?? undefined,
        correlationWithTarget: validation.correlationWithTarget ?? undefined,
        leakageRisk: validation.leakageRisk ?? undefined,
        distributionNotes: validation.distributionNotes ?? undefined
      };
      step.status = 'validated';
      step.updatedAt = nowIso();
      await ctx.runRepository.save(ctx.run);
    }
  }

  return { output };
};
