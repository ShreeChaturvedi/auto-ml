import type { FeatureToolContext, FeatureToolHandler } from './types.js';

/**
 * register_feature — commit a validated feature to the pipeline registry.
 * Stub implementation: returns registration confirmation.
 */
export const registerFeature: FeatureToolHandler = async (ctx: FeatureToolContext) => {
  const { args } = ctx;
  const featureId = args.featureId as string;

  if (!featureId) {
    return { error: 'register_feature requires featureId' };
  }

  const approved = (args.approved as boolean) ?? true;

  if (!approved) {
    return {
      output: {
        status: 'rejected',
        message: 'Feature registration rejected',
        featureId,
        rejectionReason: args.rejectionReason ?? 'Rejected by user'
      }
    };
  }

  return {
    output: {
      status: 'ok',
      message: 'Feature registered',
      featureId,
      datasetId: args.datasetId ?? ctx.datasetId
    }
  };
};

/**
 * checkpoint_feature_pipeline — snapshot the current feature set.
 * Stub implementation: returns checkpoint confirmation.
 */
export const checkpointFeaturePipeline: FeatureToolHandler = async (ctx: FeatureToolContext) => {
  const { args } = ctx;
  const checkpointId = `fe-ckpt-${Date.now()}`;

  return {
    output: {
      status: 'ok',
      message: 'Feature pipeline checkpoint created',
      checkpointId,
      label: args.label ?? `Feature checkpoint ${checkpointId}`,
      featureIds: args.featureIds ?? [],
      datasetId: args.datasetId ?? ctx.datasetId
    }
  };
};
