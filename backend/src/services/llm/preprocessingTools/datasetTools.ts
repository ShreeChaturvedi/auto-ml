import { randomUUID } from 'node:crypto';

import { asString } from '../../../utils/typeCoercion.js';

import {
  appendEvent,
  collectReplayEvents,
  compareSchemas,
  fail,
  formatDatasetSummary,
  mergeUniqueStrings,
  nowIso,
  ok,
  resolveProjectDataset,
  toStringArray
} from './helpers.js';
import type { ToolContext, ToolHandler } from './types.js';

export const listProjectDatasets: ToolHandler = async (ctx: ToolContext) => {
  const { projectId, run, datasetRepository } = ctx;
  const datasets = await datasetRepository.list();
  const projectDatasets = datasets
    .filter((dataset) => dataset.projectId === projectId)
    .map((dataset) => formatDatasetSummary(dataset));
  return ok(run.runId, {
    datasets: projectDatasets
  });
};

export const setActiveDataset: ToolHandler = async (ctx: ToolContext) => {
  const { projectId, run, args, datasetRepository, runRepository } = ctx;
  const datasetRef = asString(args.datasetId);
  if (!datasetRef) {
    return fail(run.runId, 'MISSING_REQUIRED_ARG', 'set_active_dataset requires datasetId');
  }
  const dataset = await resolveProjectDataset(datasetRepository, projectId, datasetRef);
  if (!dataset) {
    return fail(run.runId, 'DATASET_NOT_FOUND', 'Dataset not found in project context.', {
      datasetId: datasetRef
    });
  }

  run.activeDatasetId = dataset.datasetId;
  appendEvent(run, {
    eventId: randomUUID(),
    runId: run.runId,
    type: 'active_dataset_set',
    datasetId: dataset.datasetId
  });
  await runRepository.save(run);

  return ok(run.runId, {
    datasetId: dataset.datasetId,
    dataset: formatDatasetSummary(dataset)
  });
};

export const profileActiveDataset: ToolHandler = async (ctx: ToolContext) => {
  const { projectId, run, args, datasetRepository, runRepository } = ctx;
  const datasetRef = asString(args.datasetId) ?? run.activeDatasetId;
  if (!datasetRef) {
    return fail(run.runId, 'MISSING_REQUIRED_ARG', 'No active dataset set for this preprocessing run.');
  }
  const dataset = await resolveProjectDataset(datasetRepository, projectId, datasetRef);
  if (!dataset) {
    return fail(run.runId, 'DATASET_NOT_FOUND', 'Dataset not found in project context.', {
      datasetId: datasetRef
    });
  }

  run.activeDatasetId = dataset.datasetId;
  await runRepository.save(run);
  return ok(run.runId, {
    datasetId: dataset.datasetId,
    dataset: formatDatasetSummary(dataset)
  });
};

export const checkpointDataset: ToolHandler = async (ctx: ToolContext) => {
  const { projectId, run, args, datasetRepository, runRepository } = ctx;
  const datasetRef = asString(args.datasetId) ?? run.activeDatasetId;
  if (!datasetRef) {
    return fail(
      run.runId,
      'MISSING_REQUIRED_ARG',
      'checkpoint_dataset requires datasetId or active dataset context.'
    );
  }
  const dataset = await resolveProjectDataset(datasetRepository, projectId, datasetRef);
  if (!dataset) {
    return fail(run.runId, 'DATASET_NOT_FOUND', 'Dataset not found in project context.', {
      datasetId: datasetRef
    });
  }

  const checkpointId = `ckpt-${randomUUID()}`;
  const checkpoint = {
    checkpointId,
    label: asString(args.label) ?? `Checkpoint ${run.checkpoints.length + 1}`,
    datasetId: dataset.datasetId,
    stepIds: toStringArray(args.stepIds),
    createdAt: nowIso(),
    replayUntilEventSequence: run.events.length
  };

  run.checkpoints.push(checkpoint);
  appendEvent(run, {
    eventId: randomUUID(),
    runId: run.runId,
    type: 'checkpoint_created',
    checkpointId,
    datasetId: dataset.datasetId,
    payload: {
      label: checkpoint.label,
      stepIds: checkpoint.stepIds,
      replayUntilEventSequence: checkpoint.replayUntilEventSequence
    }
  });
  await runRepository.save(run);

  return ok(run.runId, {
    checkpointId,
    checkpoint
  });
};

export const registerDerivedDataset: ToolHandler = async (ctx: ToolContext) => {
  const { projectId, run, args, datasetRepository, runRepository } = ctx;
  const datasetRef = asString(args.datasetId);
  if (!datasetRef) {
    return fail(run.runId, 'MISSING_REQUIRED_ARG', 'register_derived_dataset requires datasetId');
  }
  const dataset = await resolveProjectDataset(datasetRepository, projectId, datasetRef);
  if (!dataset) {
    return fail(run.runId, 'DATASET_NOT_FOUND', 'Dataset not found in project context.', {
      datasetId: datasetRef
    });
  }
  run.derivedDatasetIds = mergeUniqueStrings(run.derivedDatasetIds, [dataset.datasetId]);
  await runRepository.save(run);
  return ok(run.runId, {
    datasetId: dataset.datasetId,
    derivedDatasetIds: run.derivedDatasetIds
  });
};

export const listCheckpoints: ToolHandler = async (ctx: ToolContext) => {
  const { run } = ctx;
  const lastEvent = run.events.at(-1);
  return ok(run.runId, {
    checkpoints: run.checkpoints,
    replay: {
      eventCount: run.events.length,
      lastEventSequence: lastEvent?.sequence ?? 0
    }
  });
};

export const restoreCheckpoint: ToolHandler = async (ctx: ToolContext) => {
  const { projectId, run, args, datasetRepository, runRepository } = ctx;
  const checkpointId = asString(args.checkpointId);
  const operation = asString(args.operation) ?? 'restore';
  if (!checkpointId) {
    return fail(run.runId, 'MISSING_REQUIRED_ARG', 'restore_checkpoint requires checkpointId');
  }
  if (!['restore', 'replay', 'compatibility_check'].includes(operation)) {
    return fail(run.runId, 'INVALID_OPERATION', `Unsupported restore_checkpoint operation: ${operation}`, {
      checkpointId
    });
  }

  const checkpoint = run.checkpoints.find((entry) => entry.checkpointId === checkpointId);
  if (!checkpoint) {
    return fail(run.runId, 'CHECKPOINT_NOT_FOUND', `Checkpoint ${checkpointId} not found for run ${run.runId}`, {
      checkpointId
    });
  }

  const replayEvents = collectReplayEvents(run, checkpoint.replayUntilEventSequence);
  const targetDatasetRef = asString(args.replayDatasetId) ?? run.activeDatasetId;
  if (operation !== 'restore' && !targetDatasetRef) {
    return fail(
      run.runId,
      'REPLAY_TARGET_DATASET_REQUIRED',
      'Replay compatibility check requires an active dataset or replayDatasetId.',
      { checkpointId }
    );
  }

  if (operation === 'restore') {
    run.activeDatasetId = checkpoint.datasetId;
    appendEvent(run, {
      eventId: randomUUID(),
      runId: run.runId,
      type: 'checkpoint_restored',
      checkpointId,
      datasetId: checkpoint.datasetId,
      payload: { operation }
    });
    await runRepository.save(run);

    return ok(run.runId, {
      checkpointId,
      restoredCheckpoint: checkpoint,
      activeDatasetId: run.activeDatasetId,
      replay: {
        eventCount: replayEvents.length
      }
    });
  }

  const targetDataset = await resolveProjectDataset(datasetRepository, projectId, targetDatasetRef!);
  if (!targetDataset) {
    return fail(run.runId, 'DATASET_NOT_FOUND', 'Replay target dataset not found in project context.', {
      checkpointId,
      datasetId: targetDatasetRef
    });
  }

  const compatibilityIssues: ReturnType<typeof compareSchemas> = [];
  for (const event of replayEvents) {
    if (event.type !== 'step_committed') {
      continue;
    }

    const payloadSchema = event.payload?.requiredInputSchema as { datasetId: string; columns: Array<{ name: string; dtype: string }>; capturedAt: string } | undefined;
    if (!payloadSchema || !event.stepId) {
      continue;
    }

    compatibilityIssues.push(...compareSchemas(payloadSchema, targetDataset.columns, event.stepId));
  }

  appendEvent(run, {
    eventId: randomUUID(),
    runId: run.runId,
    type: 'replay_compatibility_checked',
    checkpointId,
    datasetId: targetDataset.datasetId,
    payload: {
      operation,
      issueCount: compatibilityIssues.length
    }
  });

  if (compatibilityIssues.length > 0) {
    await runRepository.save(run);
    return fail(
      run.runId,
      'REPLAY_INCOMPATIBLE_DATASET',
      'Replay compatibility check failed against active dataset schema.',
      {
        checkpointId,
        datasetId: targetDataset.datasetId,
        compatibilityIssues,
        replay: {
          eventCount: replayEvents.length
        }
      }
    );
  }

  if (operation === 'replay') {
    run.activeDatasetId = targetDataset.datasetId;
    appendEvent(run, {
      eventId: randomUUID(),
      runId: run.runId,
      type: 'checkpoint_restored',
      checkpointId,
      datasetId: targetDataset.datasetId,
      payload: {
        operation,
        replayEventCount: replayEvents.length
      }
    });
  }

  await runRepository.save(run);
  return ok(run.runId, {
    checkpointId,
    datasetId: targetDataset.datasetId,
    compatibilityIssues,
    replay: {
      eventCount: replayEvents.length
    },
    compatible: true
  });
};
