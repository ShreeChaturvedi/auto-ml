import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { env } from '../../config.js';
import { FileDatasetRepository } from '../../repositories/datasetRepository.js';
import {
  createFilePreprocessingRunRepository,
  type PreprocessingCellBinding
} from '../../repositories/preprocessingRunRepository.js';

import { createPreprocessingLangGraphRuntime } from './langgraph/preprocessingRuntime.js';
import {
  createPreprocessingLangGraphSynchronizer,
  createPreprocessingRunInterruptionMarker,
  createPreprocessingToolExecutor
} from './preprocessingGraph.js';

describe('preprocessingGraph', () => {
  let tempDir = '';
  const originalExecutionWorkspaceDir = env.executionWorkspaceDir;
  const originalDatasetStorageDir = env.datasetStorageDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'preprocessing-graph-'));
    env.executionWorkspaceDir = join(tempDir, 'workspaces');
    env.datasetStorageDir = join(tempDir, 'dataset-files');
  });

  afterEach(async () => {
    env.executionWorkspaceDir = originalExecutionWorkspaceDir;
    env.datasetStorageDir = originalDatasetStorageDir;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  async function createExecutor(
    projectId: string,
    options?: {
      cellMetadataStore?: { apply: (cellIds: string[], binding: PreprocessingCellBinding) => Promise<void> };
      cellInspector?: {
        read: (cellId: string) => Promise<{
          cellId: string;
          notebookId?: string;
          content: string;
          metadata: Record<string, unknown>;
        } | undefined>;
      };
    }
  ) {
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

    const workspaceProjectDir = join(env.executionWorkspaceDir, projectId, 'datasets');
    const sourceWorkspaceDir = join(workspaceProjectDir, sourceDataset.datasetId);
    const incompatibleWorkspaceDir = join(workspaceProjectDir, incompatibleDataset.datasetId);
    await mkdir(sourceWorkspaceDir, { recursive: true });
    await mkdir(incompatibleWorkspaceDir, { recursive: true });
    await writeFile(join(sourceWorkspaceDir, sourceDataset.filename), 'age,income\n31,9.5\n42,11.2\n');
    await writeFile(join(incompatibleWorkspaceDir, incompatibleDataset.filename), 'age,income\nthirty-one,9.5\nforty-two,11.2\n');

    return {
      execute: createPreprocessingToolExecutor({
        datasetRepository: datasetRepo,
        runRepository: runRepo,
        cellMetadataStore: options?.cellMetadataStore,
        cellInspector: options?.cellInspector
      }),
      runRepo,
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

  it('rejects non-user approvals while step is awaiting approval', async () => {
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
      stepId,
      approved: true,
      approvalSource: 'agent'
    });

    expect(committed.output).toMatchObject({
      isError: true,
      reasonCode: 'STEP_APPROVAL_USER_REQUIRED',
      stepId
    });
  });

  it('rejects unknown explicit runId instead of creating a new run', async () => {
    const projectId = 'project-1';
    const { execute } = await createExecutor(projectId);

    const listed = await execute(projectId, 'list_project_datasets', {
      runId: 'run_001'
    });

    expect(listed.output).toMatchObject({
      isError: true,
      runId: 'run_001',
      reasonCode: 'RUN_NOT_FOUND'
    });
  });

  it('rejects explicit runId that belongs to another project', async () => {
    const projectId = 'project-1';
    const { execute } = await createExecutor(projectId);

    const created = await execute(projectId, 'list_project_datasets', {});
    const runId = (created.output as { runId: string }).runId;

    const reused = await execute('project-2', 'list_project_datasets', {
      runId
    });

    expect(reused.output).toMatchObject({
      isError: true,
      runId,
      reasonCode: 'RUN_PROJECT_MISMATCH',
      projectId: 'project-2',
      runProjectId: projectId
    });
  });

  it('marks in-flight run steps as failed when provider stream is interrupted', async () => {
    const projectId = 'project-1';
    const { execute, runRepo } = await createExecutor(projectId);
    const markInterrupted = createPreprocessingRunInterruptionMarker({
      runRepository: runRepo,
      runtime: createPreprocessingLangGraphRuntime()
    });

    const proposed = await execute(projectId, 'propose_transformation_step', {
      title: 'Scale usage count',
      intentType: 'numeric_scaling',
      stepId: 'step_numeric_scaling'
    });
    const runId = (proposed.output as { runId: string }).runId;
    await execute(projectId, 'materialize_step_code', {
      runId,
      stepId: 'step_numeric_scaling',
      code: 'df["Usage Count"] = df["Usage Count"] / df["Usage Count"].max()'
    });
    await execute(projectId, 'execute_transformation_step', {
      runId,
      stepId: 'step_numeric_scaling',
      cellId: 'cell-1',
      succeeded: true
    });

    const interruptionResult = await markInterrupted({
      projectId,
      runIds: [runId],
      reason: 'OpenAI rate limit or quota reached (429).',
      source: 'provider_error'
    });

    expect(interruptionResult).toMatchObject({
      attempted: 1,
      updated: 1,
      skipped: 0
    });
    const storedRun = await runRepo.getById(runId);
    expect(storedRun?.steps.step_numeric_scaling).toMatchObject({
      status: 'failed',
      decisionReason: 'OpenAI rate limit or quota reached (429).'
    });
    expect(storedRun?.langGraphState).toMatchObject({
      currentStage: 'completed',
      nextStage: 'completed',
      isCompleted: true,
      lastError: 'OpenAI rate limit or quota reached (429).'
    });
    expect(storedRun?.events.at(-1)).toMatchObject({
      type: 'run_interrupted',
      payload: expect.objectContaining({
        source: 'provider_error',
        interruptedStepIds: ['step_numeric_scaling']
      })
    });
  });

  it('blocks proposing a new step when another step in the run is incomplete', async () => {
    const projectId = 'project-1';
    const { execute } = await createExecutor(projectId);

    const first = await execute(projectId, 'propose_transformation_step', {
      title: 'Parse source file',
      intentType: 'parse'
    });
    const runId = (first.output as { runId: string }).runId;
    const firstStepId = (first.output as { step?: { stepId: string } }).step?.stepId;
    expect(firstStepId).toBeTruthy();

    const second = await execute(projectId, 'propose_transformation_step', {
      runId,
      stepId: 'step_categorical_encoding',
      title: 'Encode categories',
      intentType: 'categorical_encoding'
    });

    expect(second.output).toMatchObject({
      isError: true,
      reasonCode: 'RUN_HAS_INCOMPLETE_STEP',
      blockingStepId: firstStepId
    });
  });

  it('allows re-proposing the same stepId while that step is still incomplete', async () => {
    const projectId = 'project-1';
    const { execute } = await createExecutor(projectId);

    const first = await execute(projectId, 'propose_transformation_step', {
      stepId: 'step_parse_csv',
      title: 'Parse source file',
      intentType: 'parse'
    });
    const runId = (first.output as { runId: string }).runId;

    const second = await execute(projectId, 'propose_transformation_step', {
      runId,
      stepId: 'step_parse_csv',
      title: 'Parse source file (updated)',
      intentType: 'parse'
    });

    expect(second.output).toMatchObject({
      isError: false,
      stepId: 'step_parse_csv',
      step: {
        stepId: 'step_parse_csv',
        status: 'pending'
      }
    });
  });

  it('recovers a stale pending step with no live bound cells before proposing a new step', async () => {
    const projectId = 'project-1';
    const { execute, runRepo } = await createExecutor(projectId, {
      cellInspector: {
        read: async () => undefined
      }
    });

    const first = await execute(projectId, 'propose_transformation_step', {
      stepId: 'encode_subject_area_and_repository_name',
      title: 'Encode SUBJECT_AREA_NAME and REPOSITORY_NAME',
      intentType: 'encoding'
    });
    const runId = (first.output as { runId: string }).runId;

    const run = await runRepo.getById(runId);
    expect(run).toBeDefined();
    const blockingStep = run?.steps.encode_subject_area_and_repository_name;
    expect(blockingStep).toBeDefined();
    blockingStep!.cellIds = ['missing-cell-1', 'missing-cell-2'];
    blockingStep!.status = 'pending';
    blockingStep!.approvalDecision = 'pending';
    await runRepo.save(run!);

    const second = await execute(projectId, 'propose_transformation_step', {
      runId,
      stepId: 'impute_total_compile_time_sec',
      title: 'Impute missing TOTAL_TIME_SEC and COMPILE_TIME_SEC',
      intentType: 'impute_missing_values'
    });

    expect(second.output).toMatchObject({
      isError: false,
      stepId: 'impute_total_compile_time_sec',
      step: {
        stepId: 'impute_total_compile_time_sec',
        status: 'pending'
      }
    });

    const updatedRun = await runRepo.getById(runId);
    expect(updatedRun?.steps.encode_subject_area_and_repository_name).toMatchObject({
      status: 'failed',
      approvalDecision: 'rejected',
      decisionReason: 'Recovered stale pending preprocessing step with no live notebook cells.'
    });
  });

  it('recovers a stale pending step whose bound cells belong to another notebook before proposing a new step', async () => {
    const projectId = 'project-1';
    const { execute, runRepo } = await createExecutor(projectId, {
      cellInspector: {
        async read(cellId) {
          if (cellId !== 'foreign-cell-1') {
            return undefined;
          }
          return {
            cellId,
            notebookId: 'notebook-other',
            content: 'df["repo"] = df["repo"]',
            metadata: {}
          };
        }
      }
    });

    const first = await execute(projectId, 'propose_transformation_step', {
      stepId: 'encode_subject_area_and_repository_name',
      title: 'Encode SUBJECT_AREA_NAME and REPOSITORY_NAME',
      intentType: 'encoding',
      notebookId: 'notebook-current'
    });
    const runId = (first.output as { runId: string }).runId;

    const run = await runRepo.getById(runId);
    expect(run).toBeDefined();
    const blockingStep = run?.steps.encode_subject_area_and_repository_name;
    expect(blockingStep).toBeDefined();
    blockingStep!.cellIds = ['foreign-cell-1'];
    blockingStep!.status = 'pending';
    blockingStep!.approvalDecision = 'pending';
    await runRepo.save(run!);

    const second = await execute(projectId, 'propose_transformation_step', {
      runId,
      stepId: 'impute_total_compile_time_sec',
      title: 'Impute missing TOTAL_TIME_SEC and COMPILE_TIME_SEC',
      intentType: 'impute_missing_values',
      notebookId: 'notebook-current'
    });

    expect(second.output).toMatchObject({
      isError: false,
      stepId: 'impute_total_compile_time_sec',
      step: {
        stepId: 'impute_total_compile_time_sec',
        status: 'pending'
      }
    });

    const updatedRun = await runRepo.getById(runId);
    expect(updatedRun?.steps.encode_subject_area_and_repository_name).toMatchObject({
      status: 'failed',
      approvalDecision: 'rejected',
      decisionReason: 'Recovered stale pending preprocessing step whose bound notebook cells no longer belong to the active workbook.'
    });
  });

  it('persists rejection decision and reason when approval is denied', async () => {
    const projectId = 'project-1';
    const { execute, runRepo } = await createExecutor(projectId);

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

    const rejected = await execute(projectId, 'commit_transformation_step', {
      runId,
      stepId,
      approved: false,
      approvalSource: 'user',
      rejectionReason: 'Column drop would remove critical records'
    });

    expect(rejected.output).toMatchObject({
      isError: false,
      stepId,
      status: 'failed',
      step: {
        approvalDecision: 'rejected',
        decisionReason: 'Column drop would remove critical records'
      }
    });

    const persistedRun = await runRepo.getById(runId);
    expect(persistedRun?.steps[stepId ?? '']).toMatchObject({
      status: 'failed',
      approvalDecision: 'rejected',
      decisionReason: 'Column drop would remove critical records'
    });

    const committedEvent = persistedRun?.events.find(
      (event) => event.type === 'step_committed' && event.stepId === stepId
    );
    expect(committedEvent?.payload).toMatchObject({
      approved: false,
      decisionReason: 'Column drop would remove critical records',
      status: 'failed'
    });
  });

  it('resets execute/validate lifecycle when step code is re-materialized', async () => {
    const projectId = 'project-1';
    const { execute, sourceDataset } = await createExecutor(projectId);

    const proposed = await execute(projectId, 'propose_transformation_step', {
      title: 'Normalize income',
      intentType: 'scale_numeric'
    });
    const runId = (proposed.output as { runId: string }).runId;
    const stepId = (proposed.output as { step?: { stepId: string } }).step?.stepId;
    expect(stepId).toBeTruthy();

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
    await execute(projectId, 'commit_transformation_step', {
      runId,
      stepId,
      datasetId: sourceDataset.datasetId
    });

    const rematerialized = await execute(projectId, 'materialize_step_code', {
      runId,
      stepId,
      code: 'df["income"] = (df["income"] - df["income"].median()) / (df["income"].std() + 1e-6)'
    });

    expect(rematerialized.output).toMatchObject({
      isError: false,
      stepId,
      status: 'pending',
      step: {
        stepId,
        status: 'pending',
        lastExecuteSucceeded: false,
        lastValidateSucceeded: false
      }
    });

    const committedWithoutRerun = await execute(projectId, 'commit_transformation_step', {
      runId,
      stepId,
      datasetId: sourceDataset.datasetId
    });

    expect(committedWithoutRerun.output).toMatchObject({
      isError: true,
      stepId,
      reasonCode: 'STEP_COMMIT_REQUIRES_EXECUTE_VALIDATE'
    });
  });

  it('resolves dataset references by filename for active dataset and commit', async () => {
    const projectId = 'project-1';
    const { execute, sourceDataset } = await createExecutor(projectId);

    const active = await execute(projectId, 'set_active_dataset', {
      datasetId: sourceDataset.filename
    });
    const runId = (active.output as { runId: string }).runId;

    expect(active.output).toMatchObject({
      isError: false,
      datasetId: sourceDataset.datasetId
    });

    const proposed = await execute(projectId, 'propose_transformation_step', {
      runId,
      title: 'Impute missing values',
      intentType: 'impute_missing'
    });
    const stepId = (proposed.output as { step?: { stepId: string } }).step?.stepId;

    await execute(projectId, 'materialize_step_code', {
      runId,
      stepId,
      code: 'df["income"] = df["income"].fillna(df["income"].median())'
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
      datasetId: sourceDataset.filename
    });

    expect(committed.output).toMatchObject({
      isError: false,
      status: 'applied'
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

  it('replaces stale persisted cell ids when execution reports newly written cells', async () => {
    const projectId = 'project-1';
    const { execute, runRepo } = await createExecutor(projectId);

    const proposed = await execute(projectId, 'propose_transformation_step', {
      stepId: 'encode_subject_area_and_repository_name',
      title: 'Encode SUBJECT_AREA_NAME and REPOSITORY_NAME',
      intentType: 'encoding'
    });
    const runId = (proposed.output as { runId: string }).runId;
    const stepId = (proposed.output as { step?: { stepId: string } }).step?.stepId;

    const run = await runRepo.getById(runId);
    if (!run || !stepId) {
      throw new Error('Failed to initialize preprocessing run for stale-cell test.');
    }
    run.steps[stepId].cellIds = ['stale-cell-a', 'stale-cell-b'];
    await runRepo.save(run);

    await execute(projectId, 'materialize_step_code', {
      runId,
      stepId,
      code: 'print("encode")'
    });

    await execute(projectId, 'execute_transformation_step', {
      runId,
      stepId,
      succeeded: true,
      cellIds: ['new-cell-1']
    });

    const updated = await runRepo.getById(runId);
    expect(updated?.steps[stepId]?.cellIds).toEqual(['new-cell-1']);
  });

  it('persists canonical step-cell bindings in run events and metadata store', async () => {
    const projectId = 'project-1';
    const appliedBindings: Array<{ cellIds: string[]; binding: PreprocessingCellBinding }> = [];
    const { execute, runRepo, sourceDataset } = await createExecutor(projectId, {
      cellMetadataStore: {
        async apply(cellIds, binding) {
          appliedBindings.push({
            cellIds: [...cellIds],
            binding: { ...binding }
          });
        }
      }
    });

    const active = await execute(projectId, 'set_active_dataset', {
      datasetId: sourceDataset.datasetId
    });
    const runId = (active.output as { runId: string }).runId;

    const proposed = await execute(projectId, 'propose_transformation_step', {
      runId,
      title: 'Normalize income',
      intentType: 'scale_numeric',
      toolCallId: 'tc-propose-1'
    });
    const stepId = (proposed.output as { step?: { stepId: string } }).step?.stepId;

    await execute(projectId, 'materialize_step_code', {
      runId,
      stepId,
      code: 'df["income"] = (df["income"] - df["income"].mean()) / df["income"].std()',
      toolCallId: 'tc-materialize-1'
    });
    await execute(projectId, 'execute_transformation_step', {
      runId,
      stepId,
      succeeded: true,
      cellIds: ['cell-a', 'cell-b'],
      toolCallId: 'tc-execute-1'
    });
    await execute(projectId, 'validate_step_result', {
      runId,
      stepId,
      requiresApproval: false,
      toolCallId: 'tc-validate-1'
    });
    await execute(projectId, 'commit_transformation_step', {
      runId,
      stepId,
      datasetId: sourceDataset.datasetId,
      toolCallId: 'tc-commit-1'
    });

    expect(appliedBindings).toHaveLength(1);
    expect(appliedBindings[0]).toMatchObject({
      cellIds: ['cell-a', 'cell-b'],
      binding: {
        runId,
        stepId,
        toolCallId: 'tc-execute-1',
        version: 2,
        codeHash: expect.any(String)
      }
    });

    const run = await runRepo.getById(runId);
    const executedEvent = run?.events.find((event) => event.type === 'step_executed' && event.stepId === stepId);
    const committedEvent = run?.events.find((event) => event.type === 'step_committed' && event.stepId === stepId);

    expect(executedEvent?.payload).toMatchObject({
      toolCallId: 'tc-execute-1',
      cellBindings: [
        {
          cellId: 'cell-a',
          runId,
          stepId,
          toolCallId: 'tc-execute-1',
          version: 2,
          codeHash: expect.any(String)
        },
        {
          cellId: 'cell-b',
          runId,
          stepId,
          toolCallId: 'tc-execute-1',
          version: 2,
          codeHash: expect.any(String)
        }
      ]
    });

    expect(committedEvent?.payload).toMatchObject({
      toolCallId: 'tc-commit-1',
      cellBindings: [
        {
          cellId: 'cell-a',
          runId,
          stepId,
          toolCallId: 'tc-commit-1',
          version: 2,
          codeHash: expect.any(String)
        },
        {
          cellId: 'cell-b',
          runId,
          stepId,
          toolCallId: 'tc-commit-1',
          version: 2,
          codeHash: expect.any(String)
        }
      ]
    });
  });

  it('detects divergence after manual cell edit and reconciles deterministically', async () => {
    const projectId = 'project-1';
    const cellState = new Map<string, { content: string; metadata: Record<string, unknown> }>();
    const { execute, runRepo, sourceDataset } = await createExecutor(projectId, {
      cellMetadataStore: {
        async apply(cellIds, binding) {
          for (const cellId of cellIds) {
            const existing = cellState.get(cellId) ?? { content: '', metadata: {} };
            existing.metadata = {
              ...existing.metadata,
              preprocessing: {
                runId: binding.runId,
                stepId: binding.stepId,
                toolCallId: binding.toolCallId,
                version: binding.version,
                codeHash: binding.codeHash,
                updatedAt: binding.updatedAt
              }
            };
            cellState.set(cellId, existing);
          }
        }
      },
      cellInspector: {
        async read(cellId) {
          const cell = cellState.get(cellId);
          if (!cell) {
            return undefined;
          }
          return {
            cellId,
            content: cell.content,
            metadata: cell.metadata
          };
        }
      }
    });

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

    const originalCode = 'df["income"] = (df["income"] - df["income"].mean()) / df["income"].std()';
    await execute(projectId, 'materialize_step_code', {
      runId,
      stepId,
      code: originalCode
    });
    cellState.set('cell-1', { content: originalCode, metadata: {} });

    await execute(projectId, 'execute_transformation_step', {
      runId,
      stepId,
      succeeded: true,
      cellId: 'cell-1',
      toolCallId: 'tc-execute-1'
    });
    await execute(projectId, 'validate_step_result', {
      runId,
      stepId,
      requiresApproval: false
    });
    await execute(projectId, 'commit_transformation_step', {
      runId,
      stepId,
      datasetId: sourceDataset.datasetId
    });

    const editedCode = 'df["income"] = (df["income"] - df["income"].median()) / (df["income"].std() + 1e-6)';
    cellState.set('cell-1', {
      content: editedCode,
      metadata: cellState.get('cell-1')?.metadata ?? {}
    });

    const divergence = await execute(projectId, 'detect_step_divergence', {
      runId,
      stepId,
      toolCallId: 'tc-divergence-1'
    });
    expect(divergence.output).toMatchObject({
      isError: false,
      divergedStepIds: [stepId]
    });

    const reconciled = await execute(projectId, 'reconcile_diverged_step', {
      runId,
      stepId,
      strategy: 'absorb_edit',
      toolCallId: 'tc-reconcile-1'
    });
    expect(reconciled.output).toMatchObject({
      isError: false,
      reconciled: true,
      strategy: 'absorb_edit',
      stepId
    });

    const storedRun = await runRepo.getById(runId);
    const storedStep = storedRun?.steps[stepId!];
    expect(storedStep?.status).toBe('pending');
    expect(storedStep?.version).toBe(3);
    expect(storedStep?.lastExecuteSucceeded).toBe(false);
    expect(storedStep?.lastValidateSucceeded).toBe(false);

    const divergedEvent = storedRun?.events.find((event) => event.type === 'step_diverged' && event.stepId === stepId);
    const reconciledEvent = storedRun?.events.find((event) => event.type === 'step_reconciled' && event.stepId === stepId);
    expect(divergedEvent?.payload).toMatchObject({
      toolCallId: 'tc-divergence-1'
    });
    expect(reconciledEvent?.payload).toMatchObject({
      toolCallId: 'tc-reconcile-1',
      strategy: 'absorb_edit',
      fromStepId: stepId,
      toStepId: stepId
    });
  });

  it('can reconcile divergence by creating a linked new step', async () => {
    const projectId = 'project-1';
    const cellState = new Map<string, { content: string; metadata: Record<string, unknown> }>();
    const { execute, runRepo, sourceDataset } = await createExecutor(projectId, {
      cellMetadataStore: {
        async apply(cellIds, binding) {
          for (const cellId of cellIds) {
            const existing = cellState.get(cellId) ?? { content: '', metadata: {} };
            existing.metadata = {
              ...existing.metadata,
              preprocessing: {
                runId: binding.runId,
                stepId: binding.stepId,
                toolCallId: binding.toolCallId,
                version: binding.version,
                codeHash: binding.codeHash,
                updatedAt: binding.updatedAt
              }
            };
            cellState.set(cellId, existing);
          }
        }
      },
      cellInspector: {
        async read(cellId) {
          const cell = cellState.get(cellId);
          if (!cell) {
            return undefined;
          }
          return {
            cellId,
            content: cell.content,
            metadata: cell.metadata
          };
        }
      }
    });

    const active = await execute(projectId, 'set_active_dataset', {
      datasetId: sourceDataset.datasetId
    });
    const runId = (active.output as { runId: string }).runId;

    const proposed = await execute(projectId, 'propose_transformation_step', {
      runId,
      title: 'Normalize income',
      intentType: 'scale_numeric'
    });
    const originalStepId = (proposed.output as { step?: { stepId: string } }).step?.stepId;
    const originalCode = 'df["income"] = (df["income"] - df["income"].mean()) / df["income"].std()';

    await execute(projectId, 'materialize_step_code', {
      runId,
      stepId: originalStepId,
      code: originalCode
    });
    cellState.set('cell-2', { content: originalCode, metadata: {} });
    await execute(projectId, 'execute_transformation_step', {
      runId,
      stepId: originalStepId,
      succeeded: true,
      cellId: 'cell-2'
    });
    await execute(projectId, 'validate_step_result', {
      runId,
      stepId: originalStepId,
      requiresApproval: false
    });
    await execute(projectId, 'commit_transformation_step', {
      runId,
      stepId: originalStepId,
      datasetId: sourceDataset.datasetId
    });

    cellState.set('cell-2', {
      content: 'df["income"] = df["income"].clip(lower=0)',
      metadata: cellState.get('cell-2')?.metadata ?? {}
    });

    await execute(projectId, 'detect_step_divergence', {
      runId,
      stepId: originalStepId
    });
    const reconciled = await execute(projectId, 'reconcile_diverged_step', {
      runId,
      stepId: originalStepId,
      strategy: 'create_linked_step',
      toolCallId: 'tc-reconcile-linked-1'
    });

    const newStepId = (reconciled.output as { step?: { stepId: string } }).step?.stepId;
    expect(reconciled.output).toMatchObject({
      isError: false,
      reconciled: true,
      strategy: 'create_linked_step',
      previousStepId: originalStepId
    });
    expect(newStepId).toBeTruthy();
    expect(newStepId).not.toBe(originalStepId);

    const storedRun = await runRepo.getById(runId);
    const previousStep = storedRun?.steps[originalStepId!];
    const newStep = storedRun?.steps[newStepId!];
    expect(previousStep?.status).toBe('diverged');
    expect(newStep?.linkedFromStepId).toBe(originalStepId);
    expect(newStep?.status).toBe('pending');
    expect(newStep?.version).toBe(1);

    const reconciledEvent = storedRun?.events.find((event) => event.type === 'step_reconciled' && event.stepId === originalStepId);
    expect(reconciledEvent?.payload).toMatchObject({
      toolCallId: 'tc-reconcile-linked-1',
      strategy: 'create_linked_step',
      fromStepId: originalStepId,
      toStepId: newStepId
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

  it('syncs lifecycle tools through LangGraph path without changing commit behavior', async () => {
    const projectId = 'project-1';
    const { execute, runRepo, sourceDataset } = await createExecutor(projectId);
    const sync = createPreprocessingLangGraphSynchronizer({
      runRepository: runRepo,
      runtime: createPreprocessingLangGraphRuntime()
    });

    const activeRaw = await execute(projectId, 'set_active_dataset', {
      datasetId: sourceDataset.datasetId
    });
    const active = await sync(projectId, 'set_active_dataset', { datasetId: sourceDataset.datasetId }, activeRaw);
    const runId = (active.output as { runId: string }).runId;

    expect(active.output).toMatchObject({
      isError: false,
      langGraph: {
        runtime: 'langgraph'
      }
    });

    const proposedRaw = await execute(projectId, 'propose_transformation_step', {
      runId,
      title: 'Normalize income',
      intentType: 'scale_numeric'
    });
    const proposed = await sync(projectId, 'propose_transformation_step', {
      runId,
      title: 'Normalize income',
      intentType: 'scale_numeric'
    }, proposedRaw);
    const stepId = (proposed.output as { step?: { stepId: string } }).step?.stepId;

    const codeRaw = await execute(projectId, 'materialize_step_code', {
      runId,
      stepId,
      code: 'df["income"] = (df["income"] - df["income"].mean()) / df["income"].std()'
    });
    await sync(projectId, 'materialize_step_code', {
      runId,
      stepId,
      code: 'df["income"] = (df["income"] - df["income"].mean()) / df["income"].std()'
    }, codeRaw);

    const executedRaw = await execute(projectId, 'execute_transformation_step', {
      runId,
      stepId,
      succeeded: true,
      cellId: 'cell-1'
    });
    await sync(projectId, 'execute_transformation_step', {
      runId,
      stepId,
      succeeded: true,
      cellId: 'cell-1'
    }, executedRaw);

    const validatedRaw = await execute(projectId, 'validate_step_result', {
      runId,
      stepId,
      requiresApproval: false
    });
    const validated = await sync(projectId, 'validate_step_result', {
      runId,
      stepId,
      requiresApproval: false
    }, validatedRaw);
    expect(validated.output).toMatchObject({
      isError: false,
      langGraph: {
        runtime: 'langgraph'
      }
    });

    const committedRaw = await execute(projectId, 'commit_transformation_step', {
      runId,
      stepId,
      datasetId: sourceDataset.datasetId
    });
    const committed = await sync(projectId, 'commit_transformation_step', {
      runId,
      stepId,
      datasetId: sourceDataset.datasetId
    }, committedRaw);

    expect(committed.output).toMatchObject({
      isError: false,
      status: 'applied',
      checkpointId: expect.any(String),
      langGraph: {
        runtime: 'langgraph'
      }
    });

    const storedRun = await runRepo.getById(runId);
    expect(storedRun?.langGraphRuntime).toBe('langgraph');
    expect(storedRun?.langGraphState).toBeTruthy();
  });

  it('preserves replay compatibility failure semantics with LangGraph sync wrapper', async () => {
    const projectId = 'project-1';
    const { execute, runRepo, sourceDataset, incompatibleDataset } = await createExecutor(projectId);
    const sync = createPreprocessingLangGraphSynchronizer({
      runRepository: runRepo,
      runtime: createPreprocessingLangGraphRuntime()
    });

    const activeRaw = await execute(projectId, 'set_active_dataset', {
      datasetId: sourceDataset.datasetId
    });
    const active = await sync(projectId, 'set_active_dataset', {
      datasetId: sourceDataset.datasetId
    }, activeRaw);
    const runId = (active.output as { runId: string }).runId;

    const proposedRaw = await execute(projectId, 'propose_transformation_step', {
      runId,
      title: 'Normalize income',
      intentType: 'scale_numeric'
    });
    const proposed = await sync(projectId, 'propose_transformation_step', {
      runId,
      title: 'Normalize income',
      intentType: 'scale_numeric'
    }, proposedRaw);
    const stepId = (proposed.output as { step?: { stepId: string } }).step?.stepId;

    await sync(projectId, 'materialize_step_code', {
      runId,
      stepId,
      code: 'df["income"] = (df["income"] - df["income"].mean()) / df["income"].std()'
    }, await execute(projectId, 'materialize_step_code', {
      runId,
      stepId,
      code: 'df["income"] = (df["income"] - df["income"].mean()) / df["income"].std()'
    }));

    await sync(projectId, 'execute_transformation_step', {
      runId,
      stepId,
      succeeded: true,
      cellId: 'cell-1'
    }, await execute(projectId, 'execute_transformation_step', {
      runId,
      stepId,
      succeeded: true,
      cellId: 'cell-1'
    }));

    await sync(projectId, 'validate_step_result', {
      runId,
      stepId,
      requiresApproval: false
    }, await execute(projectId, 'validate_step_result', {
      runId,
      stepId,
      requiresApproval: false
    }));

    const committed = await execute(projectId, 'commit_transformation_step', {
      runId,
      stepId,
      datasetId: sourceDataset.datasetId
    });
    const checkpointId = (committed.output as { checkpoint?: { checkpointId: string } }).checkpoint?.checkpointId;

    await sync(projectId, 'set_active_dataset', {
      runId,
      datasetId: incompatibleDataset.datasetId
    }, await execute(projectId, 'set_active_dataset', {
      runId,
      datasetId: incompatibleDataset.datasetId
    }));

    const restoredRaw = await execute(projectId, 'restore_checkpoint', {
      runId,
      checkpointId,
      operation: 'replay'
    });
    const restored = await sync(projectId, 'restore_checkpoint', {
      runId,
      checkpointId,
      operation: 'replay'
    }, restoredRaw);

    expect(restored.output).toMatchObject({
      isError: true,
      reasonCode: 'REPLAY_INCOMPATIBLE_DATASET',
      checkpointId,
      langGraph: {
        runtime: 'langgraph'
      }
    });
  });

  it('does not create LangGraph run state when explicit runId is invalid', async () => {
    const projectId = 'project-1';
    const { runRepo } = await createExecutor(projectId);
    const sync = createPreprocessingLangGraphSynchronizer({
      runRepository: runRepo,
      runtime: createPreprocessingLangGraphRuntime()
    });

    const synced = await sync(projectId, 'list_project_datasets', {
      runId: 'run_001'
    }, {
      output: {
        runId: 'run_001',
        isError: true,
        reasonCode: 'RUN_NOT_FOUND'
      }
    });

    expect(synced.output).toMatchObject({
      runId: 'run_001',
      isError: true,
      reasonCode: 'RUN_NOT_FOUND'
    });
    expect(await runRepo.getById('run_001')).toBeUndefined();
  });

  it('keeps LangGraph state non-completed when run has unresolved steps', async () => {
    const projectId = 'project-1';
    const { execute, runRepo, sourceDataset } = await createExecutor(projectId);
    const sync = createPreprocessingLangGraphSynchronizer({
      runRepository: runRepo,
      runtime: createPreprocessingLangGraphRuntime()
    });

    const active = await execute(projectId, 'set_active_dataset', {
      datasetId: sourceDataset.datasetId
    });
    const runId = (active.output as { runId: string }).runId;

    await execute(projectId, 'propose_transformation_step', {
      runId,
      stepId: 'step_parse_csv',
      title: 'Parse source file',
      intentType: 'parse'
    });

    const synced = await sync(projectId, 'commit_transformation_step', {
      runId,
      stepId: 'step_parse_csv',
      approved: true
    }, {
      output: {
        runId,
        isError: false,
        reasonCode: null,
        stepId: 'step_parse_csv',
        status: 'applied'
      }
    });

    expect((synced.output as { langGraph?: { isCompleted?: boolean; currentStage?: string } }).langGraph).toMatchObject({
      isCompleted: false,
      currentStage: 'commit_or_revise'
    });
  });
});
