import { randomUUID } from 'node:crypto';

import type { ValidationMetrics } from '../../../repositories/preprocessingRunRepository.js';
import { asBoolean, asNumber, asString } from '../../../utils/typeCoercion.js';

import {
  appendEvent,
  ensureStepExists,
  fail,
  nowIso,
  ok,
  serializeStep,
  toCellBindings
} from './helpers.js';
import type { ToolContext, ToolHandler } from './types.js';

function buildValidationMetrics(args: Record<string, unknown>): ValidationMetrics {
  return {
    rowCountBefore: asNumber(args.rowCountBefore),
    rowCountAfter: asNumber(args.rowCountAfter),
    nullCountBefore: asNumber(args.nullCountBefore),
    nullCountAfter: asNumber(args.nullCountAfter),
    schemaDrift: asBoolean(args.schemaDrift),
    notes: asString(args.notes)
  };
}

export const validateStepResult: ToolHandler = async (ctx: ToolContext) => {
  const { run, args, toolCallId, runRepository } = ctx;
  const stepId = asString(args.stepId);
  const maybeStep = ensureStepExists(run, run.runId, stepId);
  if ('error' in maybeStep) {
    return maybeStep;
  }
  const step = maybeStep;

  if (!step.lastExecuteSucceeded) {
    return fail(
      run.runId,
      'STEP_VALIDATE_REQUIRES_SUCCESSFUL_EXECUTE',
      `Step ${step.stepId} must execute successfully before validation.`,
      { stepId: step.stepId }
    );
  }

  if (step.cellIds.length === 0) {
    return fail(
      run.runId,
      'STEP_APPLIED_REQUIRES_CELL_BINDINGS',
      `Step ${step.stepId} must bind at least one cell before it can be applied.`,
      { stepId: step.stepId }
    );
  }

  const requiresApproval = asBoolean(args.requiresApproval) ?? step.requiresApproval;
  const validation = buildValidationMetrics(args);

  step.requiresApproval = requiresApproval;
  step.validation = validation;
  step.approvalDecision = requiresApproval ? 'pending' : 'approved';
  step.decisionReason = undefined;
  step.toolCallId = toolCallId ?? step.toolCallId;
  step.lastValidateSucceeded = true;
  step.status = requiresApproval ? 'awaiting_approval' : 'running';
  step.updatedAt = nowIso();
  const cellBindings = toCellBindings(run.runId, step, step.updatedAt, toolCallId);

  appendEvent(run, {
    eventId: randomUUID(),
    runId: run.runId,
    type: 'step_validated',
    stepId: step.stepId,
    payload: {
      toolCallId: step.toolCallId,
      cellBindings,
      requiresApproval,
      validation
    }
  });
  await runRepository.save(run);

  return ok(run.runId, {
    stepId: step.stepId,
    status: step.status,
    cellBindings,
    step: serializeStep(step)
  });
};
