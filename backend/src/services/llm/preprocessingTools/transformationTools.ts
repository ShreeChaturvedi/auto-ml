import { randomUUID } from 'node:crypto';

import { asBoolean, asString } from '../../../utils/typeCoercion.js';

import {
  appendEvent,
  ensureStepExists,
  findIncompleteBlockingStep,
  getOrCreateStep,
  hashCode,
  inferRiskyIntent,
  mergeUniqueStrings,
  nowIso,
  ok,
  serializeStep,
  toCellBinding,
  toCellBindings,
  toStringArray,
  fail
} from './helpers.js';
import type { ToolContext, ToolHandler } from './types.js';

export const proposeTransformationStep: ToolHandler = async (ctx: ToolContext) => {
  const { run, args, toolCallId, runRepository } = ctx;
  const requestedStepId = asString(args.stepId);
  const blockingStep = findIncompleteBlockingStep(run, requestedStepId);
  if (blockingStep) {
    return fail(
      run.runId,
      'RUN_HAS_INCOMPLETE_STEP',
      `Run ${run.runId} already has incomplete step ${blockingStep.stepId} (${blockingStep.status}). Finish it before starting a new step.`,
      {
        stepId: blockingStep.stepId,
        blockingStepId: blockingStep.stepId,
        blockingStatus: blockingStep.status
      }
    );
  }

  const step = getOrCreateStep(run, requestedStepId);
  step.title = asString(args.title) ?? step.title;
  step.rationale = asString(args.rationale) ?? step.rationale;
  step.intentType = asString(args.intentType) ?? step.intentType;
  step.toolCallId = toolCallId ?? step.toolCallId;
  step.status = 'pending';
  step.requiresApproval = asBoolean(args.requiresApproval) ?? inferRiskyIntent(step.intentType);
  step.updatedAt = nowIso();

  appendEvent(run, {
    eventId: randomUUID(),
    runId: run.runId,
    type: 'step_proposed',
    stepId: step.stepId,
    payload: {
      toolCallId: step.toolCallId,
      title: step.title,
      intentType: step.intentType,
      requiresApproval: step.requiresApproval
    }
  });
  await runRepository.save(run);

  return ok(run.runId, {
    stepId: step.stepId,
    status: step.status,
    step: serializeStep(step)
  });
};

export const materializeStepCode: ToolHandler = async (ctx: ToolContext) => {
  const { run, args, toolCallId, runRepository } = ctx;
  const stepId = asString(args.stepId);
  const code = asString(args.code);
  if (!stepId || !code) {
    return fail(run.runId, 'MISSING_REQUIRED_ARG', 'materialize_step_code requires stepId and code', {
      stepId
    });
  }

  const maybeStep = ensureStepExists(run, run.runId, stepId);
  if ('error' in maybeStep) {
    return maybeStep;
  }

  const step = maybeStep;
  step.code = code;
  step.codeHash = hashCode(code);
  step.toolCallId = toolCallId ?? step.toolCallId;
  step.version += 1;
  // Materialization prepares executable code; execution/validation must happen afterwards.
  // Reset lifecycle flags so stale success state cannot leak across code revisions.
  step.status = 'pending';
  step.lastExecuteSucceeded = false;
  step.lastValidateSucceeded = false;
  step.validation = undefined;
  step.approvalDecision = 'pending';
  step.decisionReason = undefined;
  step.updatedAt = nowIso();

  appendEvent(run, {
    eventId: randomUUID(),
    runId: run.runId,
    type: 'step_code_materialized',
    stepId: step.stepId,
    payload: {
      toolCallId: step.toolCallId,
      codeHash: step.codeHash,
      version: step.version
    }
  });
  await runRepository.save(run);

  return ok(run.runId, {
    stepId: step.stepId,
    status: step.status,
    step: serializeStep(step)
  });
};

export const executeTransformationStep: ToolHandler = async (ctx: ToolContext) => {
  const { run, args, toolCallId, runRepository, cellMetadataStore } = ctx;
  const stepId = asString(args.stepId);
  const maybeStep = ensureStepExists(run, run.runId, stepId);
  if ('error' in maybeStep) {
    return maybeStep;
  }

  const step = maybeStep;
  if (!step.code) {
    return fail(run.runId, 'STEP_EXECUTE_REQUIRES_CODE', `Step ${step.stepId} has no materialized code.`, {
      stepId: step.stepId
    });
  }

  const singleCellId = asString(args.cellId);
  const providedCells = mergeUniqueStrings(step.cellIds, toStringArray(args.cellIds), singleCellId ? [singleCellId] : []);
  const succeeded = asBoolean(args.succeeded) ?? true;
  step.cellIds = providedCells;
  step.toolCallId = toolCallId ?? step.toolCallId;
  step.lastExecuteSucceeded = succeeded;
  step.lastValidateSucceeded = false;
  step.status = succeeded ? 'running' : 'failed';
  const bindingUpdatedAt = nowIso();
  step.updatedAt = bindingUpdatedAt;

  const cellBinding = toCellBinding(run.runId, step, bindingUpdatedAt, toolCallId);
  await cellMetadataStore.apply(step.cellIds, cellBinding);
  const cellBindings = toCellBindings(run.runId, step, bindingUpdatedAt, toolCallId);

  appendEvent(run, {
    eventId: randomUUID(),
    runId: run.runId,
    type: 'step_executed',
    stepId: step.stepId,
    payload: {
      toolCallId: step.toolCallId,
      succeeded,
      cellBindings,
      cellIds: step.cellIds,
      stdout: args.stdout,
      stderr: args.stderr
    }
  });
  await runRepository.save(run);

  return ok(run.runId, {
    stepId: step.stepId,
    status: step.status,
    stdout: args.stdout,
    stderr: args.stderr,
    cellBindings,
    step: serializeStep(step)
  });
};
