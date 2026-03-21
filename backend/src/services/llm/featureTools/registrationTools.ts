import { nowIso } from '../preprocessingTools/helpers.js';

import type { FeatureToolContext, FeatureToolHandler } from './types.js';

/**
 * register_feature — commit a validated feature to the pipeline registry.
 * Persists registration status when a run is available.
 */
export const registerFeature: FeatureToolHandler = async (ctx: FeatureToolContext) => {
  const { args } = ctx;
  const featureId = args.featureId as string;

  if (!featureId) {
    return { error: 'register_feature requires featureId' };
  }

  const approved = (args.approved as boolean) ?? true;

  if (!approved) {
    if (ctx.run && ctx.runRepository) {
      const step = ctx.run.features[featureId];
      if (step) {
        step.status = 'rejected';
        step.rejectionReason = (args.rejectionReason as string) ?? 'Rejected by user';
        step.updatedAt = nowIso();
        await ctx.runRepository.save(ctx.run);
      }
    }

    return {
      output: {
        status: 'rejected',
        message: 'Feature registration rejected',
        featureId,
        rejectionReason: args.rejectionReason ?? 'Rejected by user',
        runId: ctx.run?.runId
      }
    };
  }

  if (ctx.run && ctx.runRepository) {
    const step = ctx.run.features[featureId];
    if (step) {
      const now = nowIso();
      step.status = 'registered';
      step.registeredAt = now;
      step.updatedAt = now;
      await ctx.runRepository.save(ctx.run);
    }
  }

  return {
    output: {
      status: 'ok',
      message: 'Feature registered',
      featureId,
      datasetId: args.datasetId ?? ctx.datasetId,
      runId: ctx.run?.runId
    }
  };
};

/**
 * checkpoint_feature_pipeline — snapshot the current feature set.
 * Returns checkpoint confirmation with feature IDs.
 */
export const checkpointFeaturePipeline: FeatureToolHandler = async (ctx: FeatureToolContext) => {
  const { args } = ctx;
  const checkpointId = `fe-ckpt-${Date.now()}`;

  // Collect registered feature IDs from the run if available
  const registeredFeatureIds = ctx.run
    ? Object.keys(ctx.run.features).filter(
        (id) => ctx.run!.features[id].status === 'registered'
      )
    : ((args.featureIds as string[]) ?? []);

  return {
    output: {
      status: 'ok',
      message: 'Feature pipeline checkpoint created',
      checkpointId,
      label: args.label ?? `Feature checkpoint ${checkpointId}`,
      featureIds: registeredFeatureIds,
      datasetId: args.datasetId ?? ctx.datasetId,
      runId: ctx.run?.runId
    }
  };
};
