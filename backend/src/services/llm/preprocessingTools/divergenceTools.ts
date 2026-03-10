import { randomUUID } from 'node:crypto';

import { asString } from '../../../utils/typeCoercion.js';

import {
  appendEvent,
  computeStepDivergence,
  createStep,
  ensureStepExists,
  fail,
  nowIso,
  ok,
  serializeStep,
  toCellBinding,
  toCellBindings
} from './helpers.js';
import type { StepState, ToolContext, ToolHandler } from './types.js';

export const detectStepDivergence: ToolHandler = async (ctx: ToolContext) => {
  const { run, args, toolCallId, runRepository, cellInspector } = ctx;
  const scopedStepId = asString(args.stepId);
  const scopedCellId = asString(args.cellId);
  if (scopedStepId && !run.steps[scopedStepId]) {
    return fail(run.runId, 'STEP_NOT_FOUND', `Step ${scopedStepId} not found for run ${run.runId}`, {
      stepId: scopedStepId
    });
  }

  // Determine which steps to check
  const scopedSteps = scopedStepId
    ? [run.steps[scopedStepId]].filter(Boolean) as StepState[]
    : Object.values(run.steps);
  const targetSteps = scopedCellId
    ? scopedSteps.filter((step) => step.cellIds.includes(scopedCellId))
    : scopedSteps;

  const results: Array<{
    stepId: string;
    diverged: boolean;
    status: StepState['status'];
    details: Array<{
      stepId: string;
      cellId: string;
      issue: 'missing_cell' | 'binding_mismatch' | 'code_hash_mismatch';
      expectedCodeHash?: string;
      actualCodeHash?: string;
    }>;
  }> = [];
  const divergedStepIds: string[] = [];
  let hasUpdates = false;

  for (const step of targetSteps) {
    const divergence = await computeStepDivergence(run, step, cellInspector);
    if (divergence.isDiverged) {
      divergedStepIds.push(step.stepId);
      if (step.status !== 'diverged') {
        step.status = 'diverged';
        step.updatedAt = nowIso();
        hasUpdates = true;
      }

      appendEvent(run, {
        eventId: randomUUID(),
        runId: run.runId,
        type: 'step_diverged',
        stepId: step.stepId,
        payload: {
          toolCallId,
          details: divergence.details
        }
      });
      hasUpdates = true;
    }

    results.push({
      stepId: step.stepId,
      diverged: divergence.isDiverged,
      status: step.status,
      details: divergence.details
    });
  }

  if (hasUpdates) {
    await runRepository.save(run);
  }

  return ok(run.runId, {
    checkedStepIds: targetSteps.map((step) => step.stepId),
    divergedStepIds,
    results
  });
};

export const reconcileDivergedStep: ToolHandler = async (ctx: ToolContext) => {
  const { run, args, toolCallId, runRepository, cellMetadataStore } = ctx;
  const stepId = asString(args.stepId);
  const maybeStep = ensureStepExists(run, run.runId, stepId);
  if ('error' in maybeStep) {
    return maybeStep;
  }
  const step = maybeStep;

  const divergence = await computeStepDivergence(run, step, ctx.cellInspector);
  if (!divergence.isDiverged && step.status !== 'diverged') {
    return fail(
      run.runId,
      'STEP_RECONCILE_REQUIRES_DIVERGED',
      `Step ${step.stepId} is not diverged; reconciliation is not required.`,
      { stepId: step.stepId }
    );
  }

  if (!divergence.reconciledCode || !divergence.reconciledCodeHash) {
    return fail(
      run.runId,
      'STEP_RECONCILE_REQUIRES_BOUND_CELL',
      `Step ${step.stepId} has no readable bound cell content to reconcile.`,
      { stepId: step.stepId }
    );
  }

  const strategy = asString(args.strategy) ?? 'absorb_edit';
  if (!['absorb_edit', 'create_linked_step'].includes(strategy)) {
    return fail(
      run.runId,
      'INVALID_OPERATION',
      `Unsupported reconcile_diverged_step strategy: ${strategy}`,
      { stepId: step.stepId }
    );
  }

  const previousCodeHash = step.codeHash;
  const timestamp = nowIso();

  if (strategy === 'absorb_edit') {
    step.code = divergence.reconciledCode;
    step.codeHash = divergence.reconciledCodeHash;
    step.version += 1;
    step.toolCallId = toolCallId ?? step.toolCallId;
    step.lastExecuteSucceeded = false;
    step.lastValidateSucceeded = false;
    step.status = 'pending';
    step.updatedAt = timestamp;

    await cellMetadataStore.apply(step.cellIds, toCellBinding(run.runId, step, timestamp, toolCallId));
    const cellBindings = toCellBindings(run.runId, step, timestamp, toolCallId);

    appendEvent(run, {
      eventId: randomUUID(),
      runId: run.runId,
      type: 'step_reconciled',
      stepId: step.stepId,
      payload: {
        toolCallId,
        strategy,
        fromStepId: step.stepId,
        toStepId: step.stepId,
        previousCodeHash,
        nextCodeHash: step.codeHash,
        version: step.version,
        cellBindings
      }
    });

    await runRepository.save(run);
    return ok(run.runId, {
      stepId: step.stepId,
      strategy,
      reconciled: true,
      cellBindings,
      step: serializeStep(step)
    });
  }

  const linkedStepId = `step-${randomUUID()}`;
  const linkedStep = createStep(linkedStepId);
  linkedStep.linkedFromStepId = step.stepId;
  linkedStep.title = asString(args.title) ?? `${step.title} (reconciled)`;
  linkedStep.rationale = step.rationale;
  linkedStep.intentType = step.intentType;
  linkedStep.requiresApproval = step.requiresApproval;
  linkedStep.code = divergence.reconciledCode;
  linkedStep.codeHash = divergence.reconciledCodeHash;
  linkedStep.version = 1;
  linkedStep.cellIds = [...step.cellIds];
  linkedStep.toolCallId = toolCallId;
  linkedStep.lastExecuteSucceeded = false;
  linkedStep.lastValidateSucceeded = false;
  linkedStep.status = 'pending';
  linkedStep.updatedAt = timestamp;

  step.status = 'diverged';
  step.updatedAt = timestamp;
  run.steps[linkedStep.stepId] = linkedStep;

  await cellMetadataStore.apply(linkedStep.cellIds, toCellBinding(run.runId, linkedStep, timestamp, toolCallId));
  const cellBindings = toCellBindings(run.runId, linkedStep, timestamp, toolCallId);

  appendEvent(run, {
    eventId: randomUUID(),
    runId: run.runId,
    type: 'step_reconciled',
    stepId: step.stepId,
    payload: {
      toolCallId,
      strategy,
      fromStepId: step.stepId,
      toStepId: linkedStep.stepId,
      previousCodeHash,
      nextCodeHash: linkedStep.codeHash,
      version: linkedStep.version,
      cellBindings
    }
  });

  await runRepository.save(run);
  return ok(run.runId, {
    stepId: linkedStep.stepId,
    strategy,
    reconciled: true,
    previousStepId: step.stepId,
    cellBindings,
    step: serializeStep(linkedStep),
    previousStep: serializeStep(step)
  });
};
