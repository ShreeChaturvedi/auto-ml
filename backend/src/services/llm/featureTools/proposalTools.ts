import type { FeatureToolContext, FeatureToolHandler } from './types.js';

/**
 * propose_feature — declare a feature intent with rationale, method, and parameters.
 * Stub implementation: returns success with the proposed feature metadata.
 */
export const proposeFeature: FeatureToolHandler = async (ctx: FeatureToolContext) => {
  const { args } = ctx;
  const featureId = (args.featureId as string) ?? `feat-${Date.now()}`;

  return {
    output: {
      status: 'ok',
      message: 'Feature proposed',
      featureId,
      featureName: args.featureName,
      method: args.method,
      rationale: args.rationale,
      impact: args.impact ?? 'medium',
      sourceColumns: args.sourceColumns ?? []
    }
  };
};

/**
 * materialize_feature_code — attach executable Python code to a proposed feature.
 * Stub implementation: returns success with code metadata.
 */
export const materializeFeatureCode: FeatureToolHandler = async (ctx: FeatureToolContext) => {
  const { args } = ctx;
  const featureId = args.featureId as string;
  const code = args.code as string;

  if (!featureId || !code) {
    return { error: 'materialize_feature_code requires featureId and code' };
  }

  return {
    output: {
      status: 'ok',
      message: 'Feature code materialized',
      featureId,
      outputColumns: args.outputColumns ?? [],
      codeLength: code.length
    }
  };
};
