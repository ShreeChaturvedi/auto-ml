import { hashCode, nowIso } from '../preprocessingTools/helpers.js';

import type { FeatureToolContext, FeatureToolHandler } from './types.js';

function requireFeatureRun(
  ctx: FeatureToolContext,
  toolName: 'propose_feature' | 'materialize_feature_code'
) {
  if (!ctx.run || !ctx.runRepository) {
    return {
      error: `${toolName} could not persist because the feature run is unavailable. Start a new feature engineering run and try again.`
    };
  }

  return {
    run: ctx.run,
    runRepository: ctx.runRepository
  };
}

/**
 * propose_feature — declare a feature intent with rationale, method, and parameters.
 * Persists the proposal as a FeatureStepRecord when a run is available.
 */
export const proposeFeature: FeatureToolHandler = async (ctx: FeatureToolContext) => {
  const { args } = ctx;
  const featureId = (args.featureId as string) ?? `feat-${Date.now()}`;
  const timestamp = nowIso();

  const output = {
    status: 'ok',
    message: 'Feature proposed',
    featureId,
    featureName: args.featureName,
    method: args.method,
    rationale: args.rationale,
    impact: args.impact ?? 'medium',
    sourceColumns: args.sourceColumns ?? [],
    runId: ctx.run?.runId
  };

  const persistence = requireFeatureRun(ctx, 'propose_feature');
  if ('error' in persistence) {
    return { error: persistence.error };
  }

  persistence.run.features[featureId] = {
    featureId,
    name: (args.featureName as string) ?? featureId,
    method: (args.method as string) ?? 'unknown',
    rationale: args.rationale as string | undefined,
    sourceColumns: (args.sourceColumns as string[]) ?? [],
    impact: (args.impact as string) ?? 'medium',
    status: 'proposed',
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await persistence.runRepository.save(persistence.run);

  return { output };
};

/**
 * materialize_feature_code — attach executable Python code to a proposed feature.
 * Persists the code and updates the feature status when a run is available.
 */
export const materializeFeatureCode: FeatureToolHandler = async (ctx: FeatureToolContext) => {
  const { args } = ctx;
  const featureId = args.featureId as string;
  const code = args.code as string;

  if (!featureId || !code) {
    return { error: 'materialize_feature_code requires featureId and code' };
  }

  const output = {
    status: 'ok',
    message: 'Feature code materialized',
    featureId,
    outputColumns: args.outputColumns ?? [],
    codeLength: code.length,
    runId: ctx.run?.runId
  };

  const persistence = requireFeatureRun(ctx, 'materialize_feature_code');
  if ('error' in persistence) {
    return { error: persistence.error };
  }

  const step = persistence.run.features[featureId];
  if (step) {
    step.code = code;
    step.codeHash = hashCode(code);
    step.outputColumns = (args.outputColumns as string[]) ?? [];
    step.status = 'code_ready';
    step.updatedAt = nowIso();
    await persistence.runRepository.save(persistence.run);
  }

  return { output };
};
