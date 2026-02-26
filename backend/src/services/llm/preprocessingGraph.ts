import { createHash, randomUUID } from 'node:crypto';

import { env } from '../../config.js';
import { createDatasetRepository, type DatasetRepository } from '../../repositories/datasetRepository.js';
import {
  createFilePreprocessingRunRepository,
  type DatasetSchemaSnapshot,
  type PreprocessingRunEvent,
  type PreprocessingRunRepository,
  type PreprocessingRunState,
  type StepState,
  type ValidationMetrics
} from '../../repositories/preprocessingRunRepository.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const runRepository = createFilePreprocessingRunRepository(env.preprocessingRunsPath);

const PREPROCESSING_TOOL_NAMES = [
  'list_project_datasets',
  'set_active_dataset',
  'profile_active_dataset',
  'checkpoint_dataset',
  'register_derived_dataset',
  'list_checkpoints',
  'restore_checkpoint',
  'propose_transformation_step',
  'materialize_step_code',
  'execute_transformation_step',
  'validate_step_result',
  'commit_transformation_step'
] as const;

type PreprocessingToolName = (typeof PREPROCESSING_TOOL_NAMES)[number];

type ReasonCode =
  | 'MISSING_REQUIRED_ARG'
  | 'DATASET_NOT_FOUND'
  | 'CHECKPOINT_NOT_FOUND'
  | 'STEP_NOT_FOUND'
  | 'STEP_EXECUTE_REQUIRES_CODE'
  | 'STEP_VALIDATE_REQUIRES_SUCCESSFUL_EXECUTE'
  | 'STEP_APPLIED_REQUIRES_CELL_BINDINGS'
  | 'STEP_COMMIT_REQUIRES_EXECUTE_VALIDATE'
  | 'STEP_APPROVAL_REQUIRED'
  | 'REPLAY_TARGET_DATASET_REQUIRED'
  | 'REPLAY_INCOMPATIBLE_DATASET'
  | 'INVALID_OPERATION'
  | 'INTERNAL_ERROR';

interface ReplayCompatibilityIssue {
  stepId: string;
  column: string;
  expectedType?: string;
  actualType?: string;
  issue: 'missing_column' | 'dtype_mismatch';
}

interface ToolEnvelope {
  runId: string;
  isError: boolean;
  reasonCode: ReasonCode | null;
  stepId?: string;
  checkpointId?: string;
  datasetId?: string;
  [key: string]: unknown;
}

interface PreprocessingGraphDependencies {
  datasetRepository: DatasetRepository;
  runRepository: PreprocessingRunRepository;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toBooleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  return undefined;
}

function toNumberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function hashCode(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 24);
}

function mergeUniqueStrings(...groups: string[][]): string[] {
  const merged = new Set<string>();
  for (const group of groups) {
    for (const value of group) {
      if (value.trim()) {
        merged.add(value.trim());
      }
    }
  }
  return [...merged];
}

function inferRiskyIntent(intentType: string): boolean {
  const lowered = intentType.toLowerCase();
  return lowered.includes('drop') || lowered.includes('outlier') || lowered.includes('custom');
}

function serializeStep(step: StepState) {
  return {
    stepId: step.stepId,
    title: step.title,
    rationale: step.rationale,
    intentType: step.intentType,
    status: step.status,
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

function formatDatasetSummary(dataset: {
  datasetId: string;
  filename: string;
  nRows: number;
  nCols: number;
  columns: Array<{ name: string; dtype: string }>;
  sample?: Record<string, unknown>[];
}) {
  return {
    datasetId: dataset.datasetId,
    filename: dataset.filename,
    nRows: dataset.nRows,
    nCols: dataset.nCols,
    columns: dataset.columns.map((column) => ({ name: column.name, dtype: column.dtype })),
    sample: dataset.sample?.slice(0, 5) ?? []
  };
}

function appendEvent(
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

function createStep(stepId: string): StepState {
  const timestamp = nowIso();
  return {
    stepId,
    title: 'Untitled transformation',
    intentType: 'transformation',
    status: 'pending',
    version: 1,
    cellIds: [],
    requiresApproval: false,
    lastExecuteSucceeded: false,
    lastValidateSucceeded: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function getOrCreateStep(run: PreprocessingRunState, explicitStepId?: string): StepState {
  const stepId = explicitStepId ?? `step-${randomUUID()}`;
  const existing = run.steps[stepId];
  if (existing) {
    return existing;
  }

  const created = createStep(stepId);
  run.steps[stepId] = created;
  return created;
}

function getStep(run: PreprocessingRunState, stepId: string | undefined): StepState | undefined {
  if (!stepId) {
    return undefined;
  }

  return run.steps[stepId];
}

function ok(runId: string, data: Omit<ToolEnvelope, 'runId' | 'isError' | 'reasonCode'>): {
  output: ToolEnvelope;
  error?: string;
} {
  return {
    output: {
      runId,
      isError: false,
      reasonCode: null,
      ...data
    }
  };
}

function fail(
  runId: string,
  reasonCode: ReasonCode,
  message: string,
  data: Omit<ToolEnvelope, 'runId' | 'isError' | 'reasonCode'> = {}
): {
  output: ToolEnvelope;
  error: string;
} {
  return {
    output: {
      runId,
      isError: true,
      reasonCode,
      ...data
    },
    error: message
  };
}

function toSchemaSnapshot(dataset: {
  datasetId: string;
  columns: Array<{ name: string; dtype: string }>;
}): DatasetSchemaSnapshot {
  return {
    datasetId: dataset.datasetId,
    columns: dataset.columns.map((column) => ({ name: column.name, dtype: column.dtype })),
    capturedAt: nowIso()
  };
}

function compareSchemas(
  requiredSchema: DatasetSchemaSnapshot,
  activeColumns: Array<{ name: string; dtype: string }>,
  stepId: string
): ReplayCompatibilityIssue[] {
  const actualByName = new Map(activeColumns.map((column) => [column.name, column.dtype]));
  const issues: ReplayCompatibilityIssue[] = [];

  for (const required of requiredSchema.columns) {
    const actualType = actualByName.get(required.name);
    if (!actualType) {
      issues.push({
        stepId,
        column: required.name,
        expectedType: required.dtype,
        issue: 'missing_column'
      });
      continue;
    }

    if (actualType !== required.dtype) {
      issues.push({
        stepId,
        column: required.name,
        expectedType: required.dtype,
        actualType,
        issue: 'dtype_mismatch'
      });
    }
  }

  return issues;
}

function collectReplayEvents(run: PreprocessingRunState, checkpointEventSequence: number): PreprocessingRunEvent[] {
  return run.events.filter((event) => event.sequence <= checkpointEventSequence);
}

function ensureStepExists(run: PreprocessingRunState, runId: string, stepId: string | undefined) {
  if (!stepId) {
    return fail(runId, 'MISSING_REQUIRED_ARG', 'stepId is required', {});
  }
  const step = getStep(run, stepId);
  if (!step) {
    return fail(runId, 'STEP_NOT_FOUND', `Step ${stepId} not found for run ${runId}`, { stepId });
  }
  return step;
}

export function isPreprocessingToolName(toolName: string): toolName is PreprocessingToolName {
  return PREPROCESSING_TOOL_NAMES.includes(toolName as PreprocessingToolName);
}

export function createPreprocessingToolExecutor(deps: PreprocessingGraphDependencies) {
  return async function executePreprocessingTool(
    projectId: string,
    toolName: PreprocessingToolName,
    args: Record<string, unknown>
  ): Promise<{ output?: unknown; error?: string }> {
    const explicitRunId = toStringValue(args.runId);
    const run = await deps.runRepository.getOrCreate(projectId, explicitRunId);

    try {
      switch (toolName) {
        case 'list_project_datasets': {
          const datasets = await deps.datasetRepository.list();
          const projectDatasets = datasets
            .filter((dataset) => dataset.projectId === projectId)
            .map((dataset) => formatDatasetSummary(dataset));
          return ok(run.runId, {
            datasets: projectDatasets
          });
        }

        case 'set_active_dataset': {
          const datasetId = toStringValue(args.datasetId);
          if (!datasetId) {
            return fail(run.runId, 'MISSING_REQUIRED_ARG', 'set_active_dataset requires datasetId');
          }
          const dataset = await deps.datasetRepository.getById(datasetId);
          if (!dataset || dataset.projectId !== projectId) {
            return fail(run.runId, 'DATASET_NOT_FOUND', 'Dataset not found in project context.', {
              datasetId
            });
          }

          run.activeDatasetId = datasetId;
          appendEvent(run, {
            eventId: randomUUID(),
            runId: run.runId,
            type: 'active_dataset_set',
            datasetId
          });
          await deps.runRepository.save(run);

          return ok(run.runId, {
            datasetId,
            dataset: formatDatasetSummary(dataset)
          });
        }

        case 'profile_active_dataset': {
          const datasetId = toStringValue(args.datasetId) ?? run.activeDatasetId;
          if (!datasetId) {
            return fail(run.runId, 'MISSING_REQUIRED_ARG', 'No active dataset set for this preprocessing run.');
          }
          const dataset = await deps.datasetRepository.getById(datasetId);
          if (!dataset || dataset.projectId !== projectId) {
            return fail(run.runId, 'DATASET_NOT_FOUND', 'Dataset not found in project context.', {
              datasetId
            });
          }

          run.activeDatasetId = dataset.datasetId;
          await deps.runRepository.save(run);
          return ok(run.runId, {
            datasetId,
            dataset: formatDatasetSummary(dataset)
          });
        }

        case 'checkpoint_dataset': {
          const datasetId = toStringValue(args.datasetId) ?? run.activeDatasetId;
          if (!datasetId) {
            return fail(
              run.runId,
              'MISSING_REQUIRED_ARG',
              'checkpoint_dataset requires datasetId or active dataset context.'
            );
          }

          const checkpointId = `ckpt-${randomUUID()}`;
          const checkpoint = {
            checkpointId,
            label: toStringValue(args.label) ?? `Checkpoint ${run.checkpoints.length + 1}`,
            datasetId,
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
            datasetId,
            payload: {
              label: checkpoint.label,
              stepIds: checkpoint.stepIds,
              replayUntilEventSequence: checkpoint.replayUntilEventSequence
            }
          });
          await deps.runRepository.save(run);

          return ok(run.runId, {
            checkpointId,
            checkpoint
          });
        }

        case 'register_derived_dataset': {
          const datasetId = toStringValue(args.datasetId);
          if (!datasetId) {
            return fail(run.runId, 'MISSING_REQUIRED_ARG', 'register_derived_dataset requires datasetId');
          }
          run.derivedDatasetIds = mergeUniqueStrings(run.derivedDatasetIds, [datasetId]);
          await deps.runRepository.save(run);
          return ok(run.runId, {
            datasetId,
            derivedDatasetIds: run.derivedDatasetIds
          });
        }

        case 'list_checkpoints': {
          const lastEvent = run.events.at(-1);
          return ok(run.runId, {
            checkpoints: run.checkpoints,
            replay: {
              eventCount: run.events.length,
              lastEventSequence: lastEvent?.sequence ?? 0
            }
          });
        }

        case 'restore_checkpoint': {
          const checkpointId = toStringValue(args.checkpointId);
          const operation = toStringValue(args.operation) ?? 'restore';
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
          const targetDatasetId = toStringValue(args.replayDatasetId) ?? run.activeDatasetId;
          if (operation !== 'restore' && !targetDatasetId) {
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
            await deps.runRepository.save(run);

            return ok(run.runId, {
              checkpointId,
              restoredCheckpoint: checkpoint,
              activeDatasetId: run.activeDatasetId,
              replay: {
                eventCount: replayEvents.length
              }
            });
          }

          const targetDataset = await deps.datasetRepository.getById(targetDatasetId!);
          if (!targetDataset || targetDataset.projectId !== projectId) {
            return fail(run.runId, 'DATASET_NOT_FOUND', 'Replay target dataset not found in project context.', {
              checkpointId,
              datasetId: targetDatasetId
            });
          }

          const compatibilityIssues: ReplayCompatibilityIssue[] = [];
          for (const event of replayEvents) {
            if (event.type !== 'step_committed') {
              continue;
            }

            const payloadSchema = event.payload?.requiredInputSchema as DatasetSchemaSnapshot | undefined;
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
            await deps.runRepository.save(run);
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

          await deps.runRepository.save(run);
          return ok(run.runId, {
            checkpointId,
            datasetId: targetDataset.datasetId,
            compatibilityIssues,
            replay: {
              eventCount: replayEvents.length
            },
            compatible: true
          });
        }

        case 'propose_transformation_step': {
          const step = getOrCreateStep(run, toStringValue(args.stepId));
          step.title = toStringValue(args.title) ?? step.title;
          step.rationale = toStringValue(args.rationale) ?? step.rationale;
          step.intentType = toStringValue(args.intentType) ?? step.intentType;
          step.status = 'pending';
          step.requiresApproval = toBooleanValue(args.requiresApproval) ?? inferRiskyIntent(step.intentType);
          step.updatedAt = nowIso();

          appendEvent(run, {
            eventId: randomUUID(),
            runId: run.runId,
            type: 'step_proposed',
            stepId: step.stepId,
            payload: {
              title: step.title,
              intentType: step.intentType,
              requiresApproval: step.requiresApproval
            }
          });
          await deps.runRepository.save(run);

          return ok(run.runId, {
            stepId: step.stepId,
            status: step.status,
            step: serializeStep(step)
          });
        }

        case 'materialize_step_code': {
          const stepId = toStringValue(args.stepId);
          const code = toStringValue(args.code);
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
          step.version += 1;
          step.status = 'running';
          step.updatedAt = nowIso();

          appendEvent(run, {
            eventId: randomUUID(),
            runId: run.runId,
            type: 'step_code_materialized',
            stepId: step.stepId,
            payload: {
              codeHash: step.codeHash,
              version: step.version
            }
          });
          await deps.runRepository.save(run);

          return ok(run.runId, {
            stepId: step.stepId,
            status: step.status,
            step: serializeStep(step)
          });
        }

        case 'execute_transformation_step': {
          const stepId = toStringValue(args.stepId);
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

          const singleCellId = toStringValue(args.cellId);
          const providedCells = mergeUniqueStrings(step.cellIds, toStringArray(args.cellIds), singleCellId ? [singleCellId] : []);
          const succeeded = toBooleanValue(args.succeeded) ?? true;
          step.cellIds = providedCells;
          step.lastExecuteSucceeded = succeeded;
          step.lastValidateSucceeded = false;
          step.status = succeeded ? 'running' : 'failed';
          step.updatedAt = nowIso();

          appendEvent(run, {
            eventId: randomUUID(),
            runId: run.runId,
            type: 'step_executed',
            stepId: step.stepId,
            payload: {
              succeeded,
              cellIds: step.cellIds,
              stdout: args.stdout,
              stderr: args.stderr
            }
          });
          await deps.runRepository.save(run);

          return ok(run.runId, {
            stepId: step.stepId,
            status: step.status,
            stdout: args.stdout,
            stderr: args.stderr,
            step: serializeStep(step)
          });
        }

        case 'validate_step_result': {
          const stepId = toStringValue(args.stepId);
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

          const requiresApproval = toBooleanValue(args.requiresApproval) ?? step.requiresApproval;
          const validation: ValidationMetrics = {
            rowCountBefore: toNumberValue(args.rowCountBefore),
            rowCountAfter: toNumberValue(args.rowCountAfter),
            nullCountBefore: toNumberValue(args.nullCountBefore),
            nullCountAfter: toNumberValue(args.nullCountAfter),
            schemaDrift: toBooleanValue(args.schemaDrift),
            notes: toStringValue(args.notes)
          };

          step.requiresApproval = requiresApproval;
          step.validation = validation;
          step.lastValidateSucceeded = true;
          step.status = requiresApproval ? 'awaiting_approval' : 'applied';
          step.updatedAt = nowIso();

          appendEvent(run, {
            eventId: randomUUID(),
            runId: run.runId,
            type: 'step_validated',
            stepId: step.stepId,
            payload: {
              requiresApproval,
              validation
            }
          });
          await deps.runRepository.save(run);

          return ok(run.runId, {
            stepId: step.stepId,
            status: step.status,
            step: serializeStep(step)
          });
        }

        case 'commit_transformation_step': {
          const stepId = toStringValue(args.stepId);
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

          const approved = toBooleanValue(args.approved);
          if (step.status === 'awaiting_approval' && approved !== true) {
            return fail(
              run.runId,
              'STEP_APPROVAL_REQUIRED',
              `Step ${step.stepId} requires explicit approval=true before commit.`,
              { stepId: step.stepId }
            );
          }

          if (approved === false) {
            step.status = 'failed';
            step.updatedAt = nowIso();
            appendEvent(run, {
              eventId: randomUUID(),
              runId: run.runId,
              type: 'step_committed',
              stepId: step.stepId,
              payload: {
                approved,
                status: step.status
              }
            });
            await deps.runRepository.save(run);
            return ok(run.runId, {
              stepId: step.stepId,
              status: step.status,
              step: serializeStep(step)
            });
          }

          const datasetId = toStringValue(args.datasetId) ?? run.activeDatasetId;
          if (!datasetId) {
            return fail(
              run.runId,
              'MISSING_REQUIRED_ARG',
              'commit_transformation_step requires datasetId or active dataset context.',
              { stepId: step.stepId }
            );
          }

          const dataset = await deps.datasetRepository.getById(datasetId);
          if (!dataset || dataset.projectId !== projectId) {
            return fail(run.runId, 'DATASET_NOT_FOUND', 'Dataset not found in project context.', {
              stepId: step.stepId,
              datasetId
            });
          }

          step.status = 'applied';
          step.updatedAt = nowIso();
          run.activeDatasetId = dataset.datasetId;

          appendEvent(run, {
            eventId: randomUUID(),
            runId: run.runId,
            type: 'step_committed',
            stepId: step.stepId,
            datasetId: dataset.datasetId,
            payload: {
              approved: approved ?? true,
              requiredInputSchema: toSchemaSnapshot(dataset),
              cellIds: step.cellIds,
              status: step.status
            }
          });

          const checkpointId = `ckpt-${randomUUID()}`;
          const checkpoint = {
            checkpointId,
            label: toStringValue(args.label) ?? `Committed ${step.title}`,
            datasetId: dataset.datasetId,
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

          await deps.runRepository.save(run);
          return ok(run.runId, {
            stepId: step.stepId,
            checkpointId,
            status: step.status,
            checkpoint,
            step: serializeStep(step)
          });
        }

        default:
          return fail(run.runId, 'INTERNAL_ERROR', `Unsupported preprocessing tool: ${toolName}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected preprocessing graph error';
      return fail(run.runId, 'INTERNAL_ERROR', message);
    }
  };
}

export const executePreprocessingTool = createPreprocessingToolExecutor({
  datasetRepository,
  runRepository
});
