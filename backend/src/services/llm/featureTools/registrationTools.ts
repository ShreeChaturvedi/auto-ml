import { isActionableFeatureCode } from '../../featureEngineering/codeGenerator.js';
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

  // Guard: require validated status before registration (mirrors preprocessing's
  // STEP_COMMIT_REQUIRES_EXECUTE_VALIDATE gate in stepCommitHandler.ts).
  if (approved && ctx.run) {
    const step = ctx.run.features[featureId];
    if (step && step.status !== 'validated' && step.status !== 'registered') {
      // Prescriptive recovery: if the feature already executed, the LLM just
      // needs to call validate_feature. Otherwise, point at the missing step
      // in the lifecycle so the LLM doesn't retry register blindly.
      const nextStep =
        step.status === 'executed' ? 'validate_feature'
          : step.status === 'code_ready' ? 'execute_feature'
            : step.status === 'proposed' ? 'materialize_feature_code'
              : 'materialize_feature_code';
      return {
        error: `Feature "${featureId}" cannot be registered before validation. Current status: "${step.status}". Call ${nextStep} for "${featureId}" first, then retry register_feature.`
      };
    }
    if (step?.executionResult && !step.executionResult.succeeded) {
      return {
        error: `Feature "${featureId}" execution did not succeed. Fix the code, re-execute, and re-validate before registering.`
      };
    }

    // Defense-in-depth: double-check that the persisted code is still
    // actionable and outputColumns are valid. If materialize_feature_code's
    // guard passed but the step is now in a broken state (e.g., a tool call
    // corruption, race, or bypass), catch it here before the feature goes
    // live. Uses a distinct error prefix so operator logs can distinguish
    // which layer caught the issue.
    if (step && !isActionableFeatureCode(step.code)) {
      return {
        error: `register_feature (defense-in-depth): feature "${featureId}" has empty or placeholder-only code stored in the run state. This indicates the feature was never properly materialized. Re-run materialize_feature_code with final executable code.`
      };
    }
    if (step && (!Array.isArray(step.outputColumns) || step.outputColumns.length === 0)) {
      return {
        error: `register_feature (defense-in-depth): feature "${featureId}" has empty outputColumns in the run state. Re-run materialize_feature_code with the actual column names your code produces.`
      };
    }
    if (step?.outputColumns?.some((name) => name.trim().toLowerCase() === 'placeholder' || name.trim().length === 0)) {
      return {
        error: `register_feature (defense-in-depth): feature "${featureId}" has placeholder output column names. Re-run materialize_feature_code with real column names.`
      };
    }
  }

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
        projectId: ctx.projectId,
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
      projectId: ctx.projectId,
      datasetId: args.datasetId ?? ctx.datasetId,
      runId: ctx.run?.runId
    }
  };
};

/**
 * checkpoint_feature_pipeline — snapshot the current feature set and persist it.
 */
export const checkpointFeaturePipeline: FeatureToolHandler = async (ctx: FeatureToolContext) => {
  const { args } = ctx;
  const checkpointId = `fe-ckpt-${Date.now()}`;

  const registeredFeatureIds = ctx.run
    ? Object.keys(ctx.run.features).filter(
        (id) => ctx.run!.features[id].status === 'registered'
      )
    : ((args.featureIds as string[]) ?? []);

  const label = (args.label as string) ?? `Feature checkpoint ${checkpointId}`;

  // Persist checkpoint metadata on the run
  if (ctx.run && ctx.runRepository) {
    ctx.run.lastCheckpointId = checkpointId;
    ctx.run.lastCheckpointLabel = label;
    ctx.run.lastCheckpointAt = nowIso();
    ctx.run.updatedAt = nowIso();
    await ctx.runRepository.save(ctx.run);
  }

  const warning = registeredFeatureIds.length === 0
    ? 'No features have been registered yet. Consider creating features before checkpointing.'
    : undefined;

  return {
    output: {
      status: registeredFeatureIds.length > 0 ? 'ok' : 'warning',
      message: warning ?? 'Feature pipeline checkpoint created',
      checkpointId,
      label,
      featureIds: registeredFeatureIds,
      datasetId: args.datasetId ?? ctx.datasetId,
      runId: ctx.run?.runId
    }
  };
};
