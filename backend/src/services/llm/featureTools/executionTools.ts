import type { FeatureToolContext, FeatureToolHandler } from './types.js';

/**
 * execute_feature — run the materialized feature code and capture output.
 * Stub implementation: returns success with execution metadata.
 */
export const executeFeature: FeatureToolHandler = async (ctx: FeatureToolContext) => {
  const { args } = ctx;
  const featureId = args.featureId as string;

  if (!featureId) {
    return { error: 'execute_feature requires featureId' };
  }

  const succeeded = (args.succeeded as boolean) ?? true;

  return {
    output: {
      status: succeeded ? 'ok' : 'failed',
      message: succeeded ? 'Feature execution succeeded' : 'Feature execution failed',
      featureId,
      cellId: args.cellId,
      succeeded,
      stdout: args.stdout,
      stderr: args.stderr
    }
  };
};

/**
 * validate_feature — check null rate, correlation, leakage risk, and distribution.
 * Stub implementation: returns validation summary.
 */
export const validateFeature: FeatureToolHandler = async (ctx: FeatureToolContext) => {
  const { args } = ctx;
  const featureId = args.featureId as string;

  if (!featureId) {
    return { error: 'validate_feature requires featureId' };
  }

  return {
    output: {
      status: 'ok',
      message: 'Feature validated',
      featureId,
      validation: {
        nullRate: args.nullRate ?? null,
        correlationWithTarget: args.correlationWithTarget ?? null,
        leakageRisk: args.leakageRisk ?? 'none',
        distributionNotes: args.distributionNotes ?? null
      },
      requiresApproval: (args.requiresApproval as boolean) ?? false
    }
  };
};
