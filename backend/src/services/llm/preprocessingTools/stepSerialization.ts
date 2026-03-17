/**
 * Step serialization, lifecycle, and query helpers
 */

import { randomUUID } from 'node:crypto';

import type {
  PreprocessingCellBinding,
  PreprocessingRunEvent,
  PreprocessingRunState,
  StepState
} from '../../../repositories/preprocessingRunRepository.js';
import { asRecord, asString } from '../../../utils/typeCoercion.js';

import { hashCode, nowIso } from './helpers.js';
import { fail } from './resultBuilders.js';
import type { PreprocessingCellInspector } from './types.js';

export function serializeStep(step: StepState) {
  return {
    stepId: step.stepId,
    title: step.title,
    rationale: step.rationale,
    intentType: step.intentType,
    status: step.status,
    approvalDecision: step.approvalDecision,
    decisionReason: step.decisionReason,
    toolCallId: step.toolCallId,
    linkedFromStepId: step.linkedFromStepId,
    code: step.code,
    codeHash: step.codeHash,
    version: step.version,
    cellIds: step.cellIds,
    requiresApproval: step.requiresApproval,
    validation: step.validation,
    lastExecuteSucceeded: step.lastExecuteSucceeded,
    lastValidateSucceeded: step.lastValidateSucceeded,
    createdAt: step.createdAt,
    updatedAt: step.updatedAt
  };
}

export function appendEvent(
  run: PreprocessingRunState,
  event: Omit<PreprocessingRunEvent, 'sequence' | 'createdAt'>
): PreprocessingRunEvent {
  const sequence = run.events.length + 1;
  const created: PreprocessingRunEvent = {
    ...event,
    sequence,
    createdAt: nowIso()
  };
  run.events.push(created);
  return created;
}

export function createStep(stepId: string): StepState {
  const timestamp = nowIso();
  return {
    stepId,
    title: 'Untitled transformation',
    intentType: 'transformation',
    status: 'pending',
    approvalDecision: 'approved',
    version: 1,
    cellIds: [],
    requiresApproval: false,
    lastExecuteSucceeded: false,
    lastValidateSucceeded: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function getOrCreateStep(run: PreprocessingRunState, explicitStepId?: string): StepState {
  const stepId = explicitStepId ?? `step-${randomUUID()}`;
  const existing = run.steps[stepId];
  if (existing) {
    return existing;
  }

  const created = createStep(stepId);
  run.steps[stepId] = created;
  return created;
}

export function getStep(run: PreprocessingRunState, stepId: string | undefined): StepState | undefined {
  if (!stepId) {
    return undefined;
  }

  return run.steps[stepId];
}

export function ensureStepExists(run: PreprocessingRunState, runId: string, stepId: string | undefined) {
  if (!stepId) {
    return fail(runId, 'MISSING_REQUIRED_ARG', 'stepId is required', {});
  }
  const step = getStep(run, stepId);
  if (!step) {
    return fail(runId, 'STEP_NOT_FOUND', `Step ${stepId} not found for run ${runId}`, { stepId });
  }
  return step;
}

export function findIncompleteBlockingStep(run: PreprocessingRunState, requestedStepId?: string): StepState | undefined {
  const NON_TERMINAL_STEP_STATUSES = new Set<StepState['status']>([
    'pending',
    'running',
    'awaiting_approval',
    'diverged'
  ]);

  return Object.values(run.steps).find((step) => {
    if (!NON_TERMINAL_STEP_STATUSES.has(step.status)) {
      return false;
    }
    if (requestedStepId && step.stepId === requestedStepId) {
      return false;
    }
    return true;
  });
}

export function toCellBinding(runId: string, step: StepState, updatedAt: string, toolCallId?: string): PreprocessingCellBinding {
  return {
    runId,
    stepId: step.stepId,
    toolCallId: toolCallId ?? step.toolCallId,
    version: step.version,
    codeHash: step.codeHash,
    updatedAt
  };
}

export function toCellBindings(
  runId: string,
  step: StepState,
  updatedAt: string,
  toolCallId?: string
): Array<PreprocessingCellBinding & { cellId: string }> {
  const binding = toCellBinding(runId, step, updatedAt, toolCallId);
  return step.cellIds.map((cellId) => ({
    cellId,
    ...binding
  }));
}

export function buildPreprocessingCellMetadata(
  existing: Record<string, unknown> | undefined,
  binding: PreprocessingCellBinding
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    preprocessing: {
      source: 'preprocessing',
      runId: binding.runId,
      stepId: binding.stepId,
      toolCallId: binding.toolCallId,
      version: binding.version,
      codeHash: binding.codeHash,
      updatedAt: binding.updatedAt
    }
  };
}

export async function computeStepDivergence(
  run: PreprocessingRunState,
  step: StepState,
  inspector: PreprocessingCellInspector
): Promise<{
  isDiverged: boolean;
  details: Array<{
    stepId: string;
    cellId: string;
    issue: 'missing_cell' | 'binding_mismatch' | 'code_hash_mismatch';
    expectedCodeHash?: string;
    actualCodeHash?: string;
  }>;
  reconciledCode?: string;
  reconciledCodeHash?: string;
}> {
  const details: Array<{
    stepId: string;
    cellId: string;
    issue: 'missing_cell' | 'binding_mismatch' | 'code_hash_mismatch';
    expectedCodeHash?: string;
    actualCodeHash?: string;
  }> = [];
  let reconciledCode: string | undefined;

  for (const cellId of step.cellIds) {
    const inspected = await inspector.read(cellId);
    if (!inspected) {
      details.push({
        stepId: step.stepId,
        cellId,
        issue: 'missing_cell',
        expectedCodeHash: step.codeHash
      });
      continue;
    }

    if (!reconciledCode) {
      reconciledCode = inspected.content;
    }

    const preprocessingMetadata = asRecord(inspected.metadata.preprocessing);
    const metadataStepId = asString(preprocessingMetadata?.stepId);
    const metadataRunId = asString(preprocessingMetadata?.runId);
    if (metadataStepId !== step.stepId || metadataRunId !== run.runId) {
      details.push({
        stepId: step.stepId,
        cellId,
        issue: 'binding_mismatch',
        expectedCodeHash: step.codeHash,
        actualCodeHash: asString(preprocessingMetadata?.codeHash)
      });
      continue;
    }

    const actualCodeHash = hashCode(inspected.content);
    if (step.codeHash && step.codeHash !== actualCodeHash) {
      details.push({
        stepId: step.stepId,
        cellId,
        issue: 'code_hash_mismatch',
        expectedCodeHash: step.codeHash,
        actualCodeHash
      });
    }
  }

  return {
    isDiverged: details.length > 0,
    details,
    reconciledCode,
    reconciledCodeHash: reconciledCode ? hashCode(reconciledCode) : undefined
  };
}
