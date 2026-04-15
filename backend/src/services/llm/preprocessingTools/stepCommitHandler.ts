import { randomUUID } from 'node:crypto';

import { appLogger } from '../../../logging/logger.js';
import { asBoolean, asString } from '../../../utils/typeCoercion.js';

import {
  appendEvent,
  ensureStepExists,
  fail,
  nowIso,
  ok,
  resolveProjectDataset,
  serializeStep,
  toCellBindings,
  toSchemaSnapshot
} from './helpers.js';
import { persistProcessedDataset } from './processedDatasetPersistence.js';
import type { ToolContext, ToolHandler } from './types.js';

export const commitTransformationStep: ToolHandler = async (ctx: ToolContext) => {
  const { projectId, run, args, toolCallId, datasetRepository, runRepository } = ctx;
  const stepId = asString(args.stepId);
  const maybeStep = ensureStepExists(run, run.runId, stepId);
  if ('error' in maybeStep) {
    return maybeStep;
  }
  const step = maybeStep;

  if (!step.lastExecuteSucceeded || !step.lastValidateSucceeded) {
    return fail(
      run.runId,
      'STEP_COMMIT_REQUIRES_EXECUTE_VALIDATE',
      `Step ${step.stepId} cannot commit before successful execute and validate.`,
      { stepId: step.stepId }
    );
  }

  if (step.cellIds.length === 0) {
    return fail(
      run.runId,
      'STEP_APPLIED_REQUIRES_CELL_BINDINGS',
      `Step ${step.stepId} must bind at least one cell before commit.`,
      { stepId: step.stepId }
    );
  }

  const approved = asBoolean(args.approved);
  const approvalSource = asString(args.approvalSource);
  if (step.status === 'awaiting_approval' && typeof approved === 'undefined') {
    return fail(
      run.runId,
      'STEP_APPROVAL_REQUIRED',
      `Step ${step.stepId} requires explicit approval=true before commit.`,
      { stepId: step.stepId }
    );
  }
  if (step.status === 'awaiting_approval' && approvalSource !== 'user') {
    return fail(
      run.runId,
      'STEP_APPROVAL_USER_REQUIRED',
      `Step ${step.stepId} can only be approved or rejected through an explicit user decision.`,
      { stepId: step.stepId }
    );
  }

  if (approved === false) {
    const decisionReason = asString(args.rejectionReason) ?? 'Rejected by user';
    step.status = 'failed';
    step.approvalDecision = 'rejected';
    step.decisionReason = decisionReason;
    step.toolCallId = toolCallId ?? step.toolCallId;
    step.updatedAt = nowIso();
    const cellBindings = toCellBindings(run.runId, step, step.updatedAt, toolCallId);
    appendEvent(run, {
      eventId: randomUUID(),
      runId: run.runId,
      type: 'step_committed',
      stepId: step.stepId,
      payload: {
        toolCallId: step.toolCallId,
        cellBindings,
        approved,
        decisionReason,
        status: step.status
      }
    });
    await runRepository.save(run);
    return ok(run.runId, {
      stepId: step.stepId,
      status: step.status,
      cellBindings,
      step: serializeStep(step)
    });
  }

  const datasetRef = asString(args.datasetId) ?? run.activeDatasetId;
  if (!datasetRef) {
    return fail(
      run.runId,
      'MISSING_REQUIRED_ARG',
      'commit_transformation_step requires datasetId or active dataset context.',
      { stepId: step.stepId }
    );
  }

  const dataset = await resolveProjectDataset(datasetRepository, projectId, datasetRef);
  if (!dataset) {
    return fail(run.runId, 'DATASET_NOT_FOUND', 'Dataset not found in project context.', {
      stepId: step.stepId,
      datasetId: datasetRef
    });
  }

  let derivedDatasetId: string | undefined;
  try {
    derivedDatasetId = await persistProcessedDataset(run, dataset, asString(args.notebookId), datasetRepository);
  } catch (persistError) {
    appLogger.error('[commitTransformationStep] Failed to persist processed dataset', persistError);
    return fail(
      run.runId,
      'PROCESSED_DATASET_PERSIST_FAILED',
      'Commit could not persist the processed workbook dataset.',
      { stepId: step.stepId, datasetId: dataset.datasetId }
    );
  }

  if (!derivedDatasetId) {
    return fail(
      run.runId,
      'PROCESSED_DATASET_PERSIST_FAILED',
      'Commit could not persist the processed workbook dataset.',
      { stepId: step.stepId, datasetId: dataset.datasetId }
    );
  }

  const committedDataset = await resolveProjectDataset(datasetRepository, projectId, derivedDatasetId);
  if (!committedDataset) {
    return fail(
      run.runId,
      'PROCESSED_DATASET_NOT_FOUND',
      'Commit persisted a processed dataset but it could not be resolved in project context.',
      { stepId: step.stepId, datasetId: derivedDatasetId }
    );
  }

  step.status = 'applied';
  step.approvalDecision = 'approved';
  step.decisionReason = undefined;
  step.toolCallId = toolCallId ?? step.toolCallId;
  step.updatedAt = nowIso();
  run.activeDatasetId = committedDataset.datasetId;
  const cellBindings = toCellBindings(run.runId, step, step.updatedAt, toolCallId);

  appendEvent(run, {
    eventId: randomUUID(),
    runId: run.runId,
    type: 'step_committed',
    stepId: step.stepId,
    datasetId: committedDataset.datasetId,
    payload: {
      toolCallId: step.toolCallId,
      approved: approved ?? true,
      requiredInputSchema: toSchemaSnapshot(committedDataset),
      cellBindings,
      cellIds: step.cellIds,
      status: step.status,
      derivedDatasetId: committedDataset.datasetId
    }
  });

  const checkpointId = `ckpt-${randomUUID()}`;
  const checkpoint = {
    checkpointId,
    label: asString(args.label) ?? `Committed ${step.title}`,
    datasetId: committedDataset.datasetId,
    stepIds: [step.stepId],
    createdAt: nowIso(),
    replayUntilEventSequence: run.events.length
  };
  run.checkpoints.push(checkpoint);
  appendEvent(run, {
    eventId: randomUUID(),
    runId: run.runId,
    type: 'checkpoint_created',
    checkpointId,
    datasetId: checkpoint.datasetId,
    payload: {
      label: checkpoint.label,
      stepIds: checkpoint.stepIds,
      replayUntilEventSequence: checkpoint.replayUntilEventSequence
    }
  });

  await runRepository.save(run);
  return ok(run.runId, {
    stepId: step.stepId,
    checkpointId,
    status: step.status,
    checkpoint,
    cellBindings,
    step: serializeStep(step),
    ...(derivedDatasetId ? { derivedDatasetId } : {})
  });
};
