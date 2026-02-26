import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileDatasetRepository } from '../../repositories/datasetRepository.js';
import { createFilePreprocessingRunRepository } from '../../repositories/preprocessingRunRepository.js';

import { createPreprocessingToolExecutor } from './preprocessingGraph.js';

describe('preprocessingGraph', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'preprocessing-graph-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  async function createExecutor(projectId: string) {
    const datasetRepo = new FileDatasetRepository(join(tempDir, 'datasets.json'));
    const runRepo = createFilePreprocessingRunRepository(join(tempDir, 'runs.json'));

    const sourceDataset = await datasetRepo.create({
      projectId,
      filename: 'source.csv',
      fileType: 'csv',
      size: 128,
      profile: {
        nRows: 100,
        columns: [
          { name: 'age', dtype: 'integer', nullCount: 0 },
          { name: 'income', dtype: 'float', nullCount: 0 }
        ],
        sample: [{ age: 31, income: 9.5 }]
      }
    });

    const incompatibleDataset = await datasetRepo.create({
      projectId,
      filename: 'incompatible.csv',
      fileType: 'csv',
      size: 128,
      profile: {
        nRows: 100,
        columns: [
          { name: 'age', dtype: 'string', nullCount: 0 },
          { name: 'income', dtype: 'float', nullCount: 0 }
        ],
        sample: [{ age: '31', income: 9.5 }]
      }
    });

    return {
      execute: createPreprocessingToolExecutor({
        datasetRepository: datasetRepo,
        runRepository: runRepo
      }),
      sourceDataset,
      incompatibleDataset
    };
  }

  it('rejects commit unless execute and validate both succeeded', async () => {
    const projectId = 'project-1';
    const { execute } = await createExecutor(projectId);

    const proposed = await execute(projectId, 'propose_transformation_step', {
      title: 'Drop outliers',
      intentType: 'drop_rows'
    });

    const stepId = (proposed.output as { step?: { stepId: string } }).step?.stepId;
    expect(stepId).toBeTruthy();

    const committed = await execute(projectId, 'commit_transformation_step', {
      runId: (proposed.output as { runId: string }).runId,
      stepId
    });

    expect(committed.output).toMatchObject({
      isError: true,
      reasonCode: 'STEP_COMMIT_REQUIRES_EXECUTE_VALIDATE',
      stepId
    });
  });

  it('requires explicit approval=true when step is awaiting approval', async () => {
    const projectId = 'project-1';
    const { execute } = await createExecutor(projectId);

    const proposed = await execute(projectId, 'propose_transformation_step', {
      title: 'Drop outliers',
      intentType: 'drop_rows'
    });
    const runId = (proposed.output as { runId: string }).runId;
    const stepId = (proposed.output as { step?: { stepId: string } }).step?.stepId;

    await execute(projectId, 'materialize_step_code', {
      runId,
      stepId,
      code: 'df = df[df["age"] < 100]'
    });
    await execute(projectId, 'execute_transformation_step', {
      runId,
      stepId,
      succeeded: true,
      cellId: 'cell-1'
    });
    await execute(projectId, 'validate_step_result', {
      runId,
      stepId,
      requiresApproval: true
    });

    const committed = await execute(projectId, 'commit_transformation_step', {
      runId,
      stepId
    });

    expect(committed.output).toMatchObject({
      isError: true,
      reasonCode: 'STEP_APPROVAL_REQUIRED',
      stepId
    });
  });

  it('prevents applied status when no cell ids are bound', async () => {
    const projectId = 'project-1';
    const { execute } = await createExecutor(projectId);

    const proposed = await execute(projectId, 'propose_transformation_step', {
      title: 'Drop outliers',
      intentType: 'drop_rows'
    });
    const runId = (proposed.output as { runId: string }).runId;
    const stepId = (proposed.output as { step?: { stepId: string } }).step?.stepId;

    await execute(projectId, 'materialize_step_code', {
      runId,
      stepId,
      code: 'df = df[df["age"] < 100]'
    });
    await execute(projectId, 'execute_transformation_step', {
      runId,
      stepId,
      succeeded: true
    });

    const validated = await execute(projectId, 'validate_step_result', {
      runId,
      stepId,
      requiresApproval: false
    });

    expect(validated.output).toMatchObject({
      isError: true,
      reasonCode: 'STEP_APPLIED_REQUIRES_CELL_BINDINGS',
      stepId
    });
  });

  it('replay compatibility check fails on dtype mismatches', async () => {
    const projectId = 'project-1';
    const { execute, sourceDataset, incompatibleDataset } = await createExecutor(projectId);

    const active = await execute(projectId, 'set_active_dataset', {
      datasetId: sourceDataset.datasetId
    });
    const runId = (active.output as { runId: string }).runId;

    const proposed = await execute(projectId, 'propose_transformation_step', {
      runId,
      title: 'Normalize income',
      intentType: 'scale_numeric'
    });
    const stepId = (proposed.output as { step?: { stepId: string } }).step?.stepId;

    await execute(projectId, 'materialize_step_code', {
      runId,
      stepId,
      code: 'df["income"] = (df["income"] - df["income"].mean()) / df["income"].std()'
    });
    await execute(projectId, 'execute_transformation_step', {
      runId,
      stepId,
      succeeded: true,
      cellId: 'cell-1'
    });
    await execute(projectId, 'validate_step_result', {
      runId,
      stepId,
      requiresApproval: false
    });

    const committed = await execute(projectId, 'commit_transformation_step', {
      runId,
      stepId,
      datasetId: sourceDataset.datasetId
    });

    const checkpointId = (committed.output as { checkpoint?: { checkpointId: string } }).checkpoint?.checkpointId;
    expect(checkpointId).toBeTruthy();

    await execute(projectId, 'set_active_dataset', {
      runId,
      datasetId: incompatibleDataset.datasetId
    });

    const restored = await execute(projectId, 'restore_checkpoint', {
      runId,
      checkpointId,
      operation: 'replay'
    });

    expect(restored.output).toMatchObject({
      isError: true,
      reasonCode: 'REPLAY_INCOMPATIBLE_DATASET',
      runId,
      checkpointId
    });
  });

  it('persists run event log and exposes it via list_checkpoints', async () => {
    const projectId = 'project-1';
    const runPath = join(tempDir, 'runs.json');
    const datasetRepo = new FileDatasetRepository(join(tempDir, 'datasets.json'));
    const runRepo = createFilePreprocessingRunRepository(runPath);
    const sourceDataset = await datasetRepo.create({
      projectId,
      filename: 'source.csv',
      fileType: 'csv',
      size: 64,
      profile: {
        nRows: 10,
        columns: [{ name: 'age', dtype: 'integer', nullCount: 0 }],
        sample: [{ age: 10 }]
      }
    });

    const firstExecutor = createPreprocessingToolExecutor({
      datasetRepository: datasetRepo,
      runRepository: runRepo
    });

    const active = await firstExecutor(projectId, 'set_active_dataset', {
      datasetId: sourceDataset.datasetId
    });
    const runId = (active.output as { runId: string }).runId;

    await firstExecutor(projectId, 'propose_transformation_step', {
      runId,
      title: 'Cap age',
      intentType: 'clip_values'
    });

    const secondExecutor = createPreprocessingToolExecutor({
      datasetRepository: datasetRepo,
      runRepository: createFilePreprocessingRunRepository(runPath)
    });

    const checkpoints = await secondExecutor(projectId, 'list_checkpoints', { runId });

    expect(checkpoints.output).toMatchObject({
      runId,
      isError: false,
      replay: {
        eventCount: 2
      }
    });
  });
});
