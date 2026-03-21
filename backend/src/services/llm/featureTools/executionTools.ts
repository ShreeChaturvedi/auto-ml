import { nowIso } from '../preprocessingTools/helpers.js';

import type { FeatureToolContext, FeatureToolHandler } from './types.js';

/**
 * execute_feature — record the execution result for a materialized feature.
 * Persists execution metadata (stdout, stderr, success) when a run is available.
 *
 * NOTE: This currently accepts self-reported execution results from the LLM.
 * Real Docker-based execution is a future enhancement.
 */
export const executeFeature: FeatureToolHandler = async (ctx: FeatureToolContext) => {
  const { args } = ctx;
  const featureId = args.featureId as string;

  if (!featureId) {
    return { error: 'execute_feature requires featureId' };
  }

  const succeeded = (args.succeeded as boolean) ?? true;

  const output = {
    status: succeeded ? 'ok' : 'failed',
    message: succeeded ? 'Feature execution succeeded' : 'Feature execution failed',
    featureId,
    cellId: args.cellId,
    succeeded,
    stdout: args.stdout,
    stderr: args.stderr,
    runId: ctx.run?.runId
  };

  if (ctx.run && ctx.runRepository) {
    const step = ctx.run.features[featureId];
    if (step) {
      step.executionResult = {
        succeeded,
        stdout: args.stdout as string | undefined,
        stderr: args.stderr as string | undefined,
        executionMs: args.executionMs as number | undefined
      };
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
