import { createHash, randomUUID } from 'node:crypto';

import { env } from '../../config.js';
import { hasDatabaseConfiguration } from '../../db.js';
import { createDatasetRepository, type DatasetRepository } from '../../repositories/datasetRepository.js';
import { getCell as getNotebookCell, updateCell as updateNotebookCell } from '../../repositories/notebookRepository.js';
import {
  createFilePreprocessingRunRepository,
  type DatasetSchemaSnapshot,
  type PreprocessingCellBinding,
  type PreprocessingRunEvent,
  type PreprocessingRunRepository,
  type PreprocessingRunState,
  type StepState,
  type ValidationMetrics
} from '../../repositories/preprocessingRunRepository.js';

import {
  createPreprocessingLangGraphRuntime,
  type PreprocessingGraphState,
  type PreprocessingLangGraphRuntime
} from './langgraph/preprocessingRuntime.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const runRepository = createFilePreprocessingRunRepository(env.preprocessingRunsPath);
const langGraphRuntime = createPreprocessingLangGraphRuntime();
const PREPROCESSING_STATE_MODEL = 'hybrid' as const;

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
  'commit_transformation_step',
  'detect_step_divergence',
  'reconcile_diverged_step'
] as const;

type PreprocessingToolName = (typeof PREPROCESSING_TOOL_NAMES)[number];

type ReasonCode =
  | 'RUN_NOT_FOUND'
  | 'RUN_PROJECT_MISMATCH'
  | 'RUN_HAS_INCOMPLETE_STEP'
  | 'MISSING_REQUIRED_ARG'
  | 'DATASET_NOT_FOUND'
  | 'CHECKPOINT_NOT_FOUND'
  | 'STEP_NOT_FOUND'
  | 'STEP_EXECUTE_REQUIRES_CODE'
  | 'STEP_VALIDATE_REQUIRES_SUCCESSFUL_EXECUTE'
  | 'STEP_APPLIED_REQUIRES_CELL_BINDINGS'
  | 'STEP_COMMIT_REQUIRES_EXECUTE_VALIDATE'
  | 'STEP_APPROVAL_REQUIRED'
  | 'STEP_APPROVAL_USER_REQUIRED'
  | 'STEP_RECONCILE_REQUIRES_DIVERGED'
  | 'STEP_RECONCILE_REQUIRES_BOUND_CELL'
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
  cellMetadataStore?: PreprocessingCellMetadataStore;
  cellInspector?: PreprocessingCellInspector;
}

interface PreprocessingLangGraphSyncDependencies {
  runRepository: PreprocessingRunRepository;
  runtime: PreprocessingLangGraphRuntime;
}

interface PreprocessingRunInterruptionDependencies {
  runRepository: PreprocessingRunRepository;
  runtime: PreprocessingLangGraphRuntime;
}

export interface PreprocessingRunInterruptionInput {
  projectId: string;
  runIds: string[];
  reason: string;
  source?: 'provider_error' | 'stream_aborted';
}

export interface PreprocessingRunInterruptionResult {
  attempted: number;
  updated: number;
  skipped: number;
}

interface PreprocessingCellMetadataStore {
  apply(cellIds: string[], binding: PreprocessingCellBinding): Promise<void>;
}

interface PreprocessingCellInspector {
  read(cellId: string): Promise<{ cellId: string; content: string; metadata: Record<string, unknown> } | undefined>;
}

interface StepDivergenceDetail {
  stepId: string;
  cellId: string;
  issue: 'missing_cell' | 'binding_mismatch' | 'code_hash_mismatch';
  expectedCodeHash?: string;
  actualCodeHash?: string;
}

type ProjectDataset = Awaited<ReturnType<DatasetRepository['list']>>[number];

const LANGGRAPH_STAGE_TOOLS = new Set<PreprocessingToolName>([
  'set_active_dataset',
  'profile_active_dataset',
  'propose_transformation_step',
  'materialize_step_code',
  'execute_transformation_step',
  'validate_step_result',
  'commit_transformation_step',
  'detect_step_divergence',
  'reconcile_diverged_step'
]);

const NON_TERMINAL_STEP_STATUSES = new Set<StepState['status']>([
  'pending',
  'running',
  'awaiting_approval',
  'diverged'
]);

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

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function hashCode(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 24);
}

function toCellBinding(runId: string, step: StepState, updatedAt: string, toolCallId?: string): PreprocessingCellBinding {
  return {
    runId,
    stepId: step.stepId,
    toolCallId: toolCallId ?? step.toolCallId,
    version: step.version,
    codeHash: step.codeHash,
    updatedAt
  };
}

function toCellBindings(
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

export interface PreprocessingRunSnapshot {
  runId: string;
  projectId: string;
  stateModel: typeof PREPROCESSING_STATE_MODEL;
  activeDatasetId?: string;
  derivedDatasetIds: string[];
  langGraphRuntime?: 'langgraph';
  langGraphState?: Record<string, unknown>;
  steps: ReturnType<typeof serializeStep>[];
  checkpoints: PreprocessingRunState['checkpoints'];
  events: PreprocessingRunState['events'];
  createdAt: string;
  updatedAt: string;
}

export interface PreprocessingRunSummary {
  runId: string;
  projectId: string;
  activeDatasetId?: string;
  stepCount: number;
  eventCount: number;
  latestEventType?: PreprocessingRunEvent['type'];
  latestEventAt?: string;
  updatedAt: string;
  createdAt: string;
}

export function toPreprocessingRunSnapshot(run: PreprocessingRunState): PreprocessingRunSnapshot {
  return {
    runId: run.runId,
    projectId: run.projectId,
    stateModel: PREPROCESSING_STATE_MODEL,
    activeDatasetId: run.activeDatasetId,
    derivedDatasetIds: run.derivedDatasetIds,
    langGraphRuntime: run.langGraphRuntime,
    langGraphState: run.langGraphState,
    steps: Object.values(run.steps)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((step) => serializeStep(step)),
    checkpoints: run.checkpoints,
    events: run.events,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt
  };
}

function summarizeRun(run: PreprocessingRunState): PreprocessingRunSummary {
  const latestEvent = run.events.at(-1);
  return {
    runId: run.runId,
    projectId: run.projectId,
    activeDatasetId: run.activeDatasetId,
    stepCount: Object.keys(run.steps).length,
    eventCount: run.events.length,
    latestEventType: latestEvent?.type,
    latestEventAt: latestEvent?.createdAt,
    updatedAt: run.updatedAt,
    createdAt: run.createdAt
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

function normalizeDatasetRef(value: string): { raw: string; noExt: string } {
  const raw = value.trim().toLowerCase();
  const lastDot = raw.lastIndexOf('.');
  const noExt = lastDot > 0 ? raw.slice(0, lastDot) : raw;
  return { raw, noExt };
}

async function resolveProjectDataset(
  datasetRepository: DatasetRepository,
  projectId: string,
  datasetRef: string
): Promise<ProjectDataset | undefined> {
  const allDatasets = await datasetRepository.list();
  const projectDatasets = allDatasets.filter((dataset) => dataset.projectId === projectId);
  const { raw, noExt } = normalizeDatasetRef(datasetRef);

  return projectDatasets.find((dataset) => {
    if (dataset.datasetId === datasetRef) {
      return true;
    }
    const normalizedFilename = normalizeDatasetRef(dataset.filename);
    return normalizedFilename.raw === raw || normalizedFilename.noExt === noExt;
  });
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

function findIncompleteBlockingStep(run: PreprocessingRunState, requestedStepId?: string): StepState | undefined {
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

function enforceLangGraphCompletionConsistency(
  run: PreprocessingRunState,
  graphState: PreprocessingGraphState
): PreprocessingGraphState {
  const hasIncompleteStep = Object.values(run.steps).some((step) => NON_TERMINAL_STEP_STATUSES.has(step.status));
  if (!hasIncompleteStep) {
    return graphState;
  }

  return {
    ...graphState,
    currentStage: 'commit_or_revise',
    nextStage: 'commit_or_revise',
    isCompleted: false,
    updatedAt: nowIso()
  };
}

async function resolveExecutionRun(
  runRepository: PreprocessingRunRepository,
  projectId: string,
  explicitRunId?: string
): Promise<
  | { run: PreprocessingRunState }
  | { output: ToolEnvelope; error: string }
> {
  if (!explicitRunId) {
    const run = await runRepository.getOrCreate(projectId);
    return { run };
  }

  const existing = await runRepository.getById(explicitRunId);
  if (!existing) {
    return fail(
      explicitRunId,
      'RUN_NOT_FOUND',
      `Run ${explicitRunId} was not found. Start a preprocessing run without runId first.`,
      {
        runId: explicitRunId
      }
    );
  }

  if (existing.projectId !== projectId) {
    return fail(
      explicitRunId,
      'RUN_PROJECT_MISMATCH',
      `Run ${explicitRunId} belongs to another project and cannot be used here.`,
      {
        projectId,
        runProjectId: existing.projectId
      }
    );
  }

  return { run: existing };
}

function toPreprocessingGraphState(value: unknown): PreprocessingGraphState | undefined {
  const candidate = toRecord(value);
  if (!candidate) {
    return undefined;
  }
  if (
    typeof candidate.runId !== 'string'
    || typeof candidate.projectId !== 'string'
    || typeof candidate.currentStage !== 'string'
    || typeof candidate.nextStage !== 'string'
  ) {
    return undefined;
  }

  return candidate as unknown as PreprocessingGraphState;
}

function buildLangGraphPatch(
  toolName: PreprocessingToolName,
  args: Record<string, unknown>,
  result: { output?: unknown; error?: string }
): Partial<PreprocessingGraphState> | undefined {
  const output = toRecord(result.output);
  const step = toRecord(output?.step);
  const stepId = toStringValue(step?.stepId) ?? toStringValue(args.stepId);
  const failed = Boolean(result.error);

  switch (toolName) {
    case 'set_active_dataset':
    case 'profile_active_dataset': {
      const datasetId = toStringValue(output?.datasetId) ?? toStringValue(args.datasetId);
      return {
        currentStage: 'context_ready',
        nextStage: 'context_ready',
        contextReady: !failed,
        activeDatasetId: datasetId
      };
    }
    case 'propose_transformation_step':
      return {
        currentStage: 'plan_step',
        nextStage: 'plan_step',
        planReady: !failed,
        currentStepId: stepId
      };
    case 'materialize_step_code':
      return {
        currentStage: 'generate_code',
        nextStage: 'generate_code',
        codeReady: !failed,
        currentStepId: stepId
      };
    case 'execute_transformation_step': {
      const executeSucceeded = !failed && (toBooleanValue(step?.lastExecuteSucceeded) ?? toBooleanValue(args.succeeded) ?? true);
      return {
        currentStage: 'execute_code',
        nextStage: 'execute_code',
        executeSucceeded,
        currentStepId: stepId
      };
    }
    case 'validate_step_result': {
      const requiresApproval = toBooleanValue(step?.requiresApproval) ?? toBooleanValue(args.requiresApproval) ?? false;
      const validationPassed = !failed && (toBooleanValue(step?.lastValidateSucceeded) ?? true);
      return {
        currentStage: 'validate_outcome',
        nextStage: 'validate_outcome',
        validationPassed,
        requiresApproval,
        approvalDecision: requiresApproval ? 'pending' : 'approved',
        currentStepId: stepId
      };
    }
    case 'commit_transformation_step': {
      const approvedArg = toBooleanValue(args.approved);
      const reasonCode = toStringValue(output?.reasonCode);
      return {
        currentStage: 'commit_or_revise',
        nextStage: 'commit_or_revise',
        approvalDecision: reasonCode === 'STEP_APPROVAL_REQUIRED' || reasonCode === 'STEP_APPROVAL_USER_REQUIRED'
          ? 'pending'
          : approvedArg === false
            ? 'rejected'
            : 'approved',
        currentStepId: stepId
      };
    }
    case 'detect_step_divergence': {
      const divergedStepIds = Array.isArray(output?.divergedStepIds) ? output.divergedStepIds : [];
      const hasDivergence = divergedStepIds.length > 0;
      return {
        currentStage: hasDivergence ? 'commit_or_revise' : 'validate_outcome',
        nextStage: hasDivergence ? 'commit_or_revise' : 'validate_outcome',
        currentStepId: stepId
      };
    }
    case 'reconcile_diverged_step':
      return {
        currentStage: 'commit_or_revise',
        nextStage: 'generate_code',
        currentStepId: stepId
      };
    default:
      return undefined;
  }
}

function summarizeLangGraphState(state: PreprocessingGraphState) {
  return {
    runtime: 'langgraph',
    currentStage: state.currentStage,
    nextStage: state.nextStage,
    currentStepId: state.currentStepId,
    autoRepairAttempts: state.autoRepairAttempts,
    isCompleted: state.isCompleted,
    updatedAt: state.updatedAt
  };
}

function buildPreprocessingCellMetadata(
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

export function createPreprocessingRunInterruptionMarker(deps: PreprocessingRunInterruptionDependencies) {
  return async function markPreprocessingRunsInterrupted(
    input: PreprocessingRunInterruptionInput
  ): Promise<PreprocessingRunInterruptionResult> {
    const runIds = [...new Set(input.runIds.map((runId) => runId.trim()).filter(Boolean))];
    if (runIds.length === 0) {
      return { attempted: 0, updated: 0, skipped: 0 };
    }

    const reason = input.reason.trim() || 'Preprocessing stream was interrupted before completion.';
    const source = input.source ?? 'provider_error';
    let updated = 0;
    let skipped = 0;

    for (const runId of runIds) {
      const run = await deps.runRepository.getById(runId);
      if (!run || run.projectId !== input.projectId) {
        skipped += 1;
        continue;
      }

      const interruptedStepIds: string[] = [];
      const timestamp = nowIso();
      for (const step of Object.values(run.steps)) {
        if (step.status !== 'pending' && step.status !== 'running') {
          continue;
        }
        interruptedStepIds.push(step.stepId);
        step.status = 'failed';
        step.decisionReason = reason;
        if (step.approvalDecision === 'pending') {
          step.approvalDecision = 'rejected';
        }
        step.updatedAt = timestamp;
      }

      let graphState = toPreprocessingGraphState(run.langGraphState);
      if (!graphState) {
        graphState = await deps.runtime.bootstrapRun({
          runId: run.runId,
          projectId: run.projectId,
          activeDatasetId: run.activeDatasetId
        });
      }
      run.langGraphRuntime = 'langgraph';
      run.langGraphState = {
        ...graphState,
        currentStage: 'completed',
        nextStage: 'completed',
        isCompleted: true,
        lastError: reason,
        updatedAt: timestamp
      } as unknown as Record<string, unknown>;

      appendEvent(run, {
        eventId: randomUUID(),
        runId: run.runId,
        type: 'run_interrupted',
        stepId: interruptedStepIds[interruptedStepIds.length - 1],
        datasetId: run.activeDatasetId,
        payload: {
          reason,
          source,
          interruptedStepIds
        }
      });

      await deps.runRepository.save(run);
      updated += 1;
    }

    return {
      attempted: runIds.length,
      updated,
      skipped
    };
  };
}

function createPreprocessingCellMetadataStore(): PreprocessingCellMetadataStore {
  return {
    async apply(cellIds, binding) {
      if (!hasDatabaseConfiguration() || cellIds.length === 0) {
        return;
      }

      const uniqueCellIds = [...new Set(cellIds)].filter(isUuidLike);
      for (const cellId of uniqueCellIds) {
        const existing = await getNotebookCell(cellId);
        if (!existing) {
          continue;
        }

        await updateNotebookCell(cellId, {
          metadata: buildPreprocessingCellMetadata(toRecord(existing.metadata), binding)
        });
      }
    }
  };
}

function createPreprocessingCellInspector(): PreprocessingCellInspector {
  return {
    async read(cellId) {
      if (!hasDatabaseConfiguration() || !isUuidLike(cellId)) {
        return undefined;
      }
      const cell = await getNotebookCell(cellId);
      if (!cell) {
        return undefined;
      }
      return {
        cellId: cell.cellId,
        content: cell.content,
        metadata: toRecord(cell.metadata) ?? {}
      };
    }
  };
}

function detectStepTargets(run: PreprocessingRunState, stepId?: string, cellId?: string): StepState[] {
  const scopedSteps = stepId ? [run.steps[stepId]].filter(Boolean) as StepState[] : Object.values(run.steps);
  if (!cellId) {
    return scopedSteps;
  }
  return scopedSteps.filter((step) => step.cellIds.includes(cellId));
}

async function computeStepDivergence(
  run: PreprocessingRunState,
  step: StepState,
  inspector: PreprocessingCellInspector
): Promise<{
  isDiverged: boolean;
  details: StepDivergenceDetail[];
  reconciledCode?: string;
  reconciledCodeHash?: string;
}> {
  const details: StepDivergenceDetail[] = [];
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

    const preprocessingMetadata = toRecord(inspected.metadata.preprocessing);
    const metadataStepId = toStringValue(preprocessingMetadata?.stepId);
    const metadataRunId = toStringValue(preprocessingMetadata?.runId);
    if (metadataStepId !== step.stepId || metadataRunId !== run.runId) {
      details.push({
        stepId: step.stepId,
        cellId,
        issue: 'binding_mismatch',
        expectedCodeHash: step.codeHash,
        actualCodeHash: toStringValue(preprocessingMetadata?.codeHash)
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

export function createPreprocessingLangGraphSynchronizer(deps: PreprocessingLangGraphSyncDependencies) {
  return async function syncPreprocessingLangGraphState(
    projectId: string,
    toolName: PreprocessingToolName,
    args: Record<string, unknown>,
    result: { output?: unknown; error?: string }
  ): Promise<{ output?: unknown; error?: string }> {
    const output = toRecord(result.output);
    if (!output) {
      return result;
    }

    const runId = toStringValue(output.runId) ?? toStringValue(args.runId);
    if (!runId) {
      return result;
    }

    const run = await deps.runRepository.getById(runId);
    if (!run || run.projectId !== projectId) {
      return result;
    }
    let graphState = toPreprocessingGraphState(run.langGraphState);
    if (!graphState) {
      graphState = await deps.runtime.bootstrapRun({
        runId: run.runId,
        projectId,
        activeDatasetId: run.activeDatasetId
      });
    }

    if (LANGGRAPH_STAGE_TOOLS.has(toolName)) {
      const patch = buildLangGraphPatch(toolName, args, result);
      if (patch) {
        graphState = await deps.runtime.advanceRun(graphState, patch);
        graphState = enforceLangGraphCompletionConsistency(run, graphState);
        run.langGraphRuntime = 'langgraph';
        run.langGraphState = graphState as unknown as Record<string, unknown>;
        await deps.runRepository.save(run);
      }
    }

    output.langGraph = summarizeLangGraphState(graphState);
    return {
      ...result,
      output
    };
  };
}

export const syncPreprocessingLangGraphState = createPreprocessingLangGraphSynchronizer({
  runRepository,
  runtime: langGraphRuntime
});

export const markPreprocessingRunsInterrupted = createPreprocessingRunInterruptionMarker({
  runRepository,
  runtime: langGraphRuntime
});

export async function getPreprocessingRunSnapshot(runId: string): Promise<PreprocessingRunSnapshot | undefined> {
  const run = await runRepository.getById(runId);
  if (!run) {
    return undefined;
  }
  return toPreprocessingRunSnapshot(run);
}

export async function listPreprocessingRunSnapshots(
  projectId: string,
  limit?: number
): Promise<PreprocessingRunSummary[]> {
  const runs = await runRepository.listByProjectId(projectId);
  const clipped = typeof limit === 'number' && Number.isFinite(limit) ? runs.slice(0, Math.max(1, limit)) : runs;
  return clipped.map((run) => summarizeRun(run));
}

export function isPreprocessingToolName(toolName: string): toolName is PreprocessingToolName {
  return PREPROCESSING_TOOL_NAMES.includes(toolName as PreprocessingToolName);
}

export function createPreprocessingToolExecutor(deps: PreprocessingGraphDependencies) {
  const cellMetadataStore = deps.cellMetadataStore ?? createPreprocessingCellMetadataStore();
  const cellInspector = deps.cellInspector ?? createPreprocessingCellInspector();

  return async function executePreprocessingTool(
    projectId: string,
    toolName: PreprocessingToolName,
    args: Record<string, unknown>
  ): Promise<{ output?: unknown; error?: string }> {
    const explicitRunId = toStringValue(args.runId);
    const toolCallId = toStringValue(args.toolCallId);
    const resolvedRun = await resolveExecutionRun(deps.runRepository, projectId, explicitRunId);
    if ('error' in resolvedRun) {
      return resolvedRun;
    }
    const run = resolvedRun.run;

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
          const datasetRef = toStringValue(args.datasetId);
          if (!datasetRef) {
            return fail(run.runId, 'MISSING_REQUIRED_ARG', 'set_active_dataset requires datasetId');
          }
          const dataset = await resolveProjectDataset(deps.datasetRepository, projectId, datasetRef);
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
          await deps.runRepository.save(run);

          return ok(run.runId, {
            datasetId: dataset.datasetId,
            dataset: formatDatasetSummary(dataset)
          });
        }

        case 'profile_active_dataset': {
          const datasetRef = toStringValue(args.datasetId) ?? run.activeDatasetId;
          if (!datasetRef) {
            return fail(run.runId, 'MISSING_REQUIRED_ARG', 'No active dataset set for this preprocessing run.');
          }
          const dataset = await resolveProjectDataset(deps.datasetRepository, projectId, datasetRef);
          if (!dataset) {
            return fail(run.runId, 'DATASET_NOT_FOUND', 'Dataset not found in project context.', {
              datasetId: datasetRef
            });
          }

          run.activeDatasetId = dataset.datasetId;
          await deps.runRepository.save(run);
          return ok(run.runId, {
            datasetId: dataset.datasetId,
            dataset: formatDatasetSummary(dataset)
          });
        }

        case 'checkpoint_dataset': {
          const datasetRef = toStringValue(args.datasetId) ?? run.activeDatasetId;
          if (!datasetRef) {
            return fail(
              run.runId,
              'MISSING_REQUIRED_ARG',
              'checkpoint_dataset requires datasetId or active dataset context.'
            );
          }
          const dataset = await resolveProjectDataset(deps.datasetRepository, projectId, datasetRef);
          if (!dataset) {
            return fail(run.runId, 'DATASET_NOT_FOUND', 'Dataset not found in project context.', {
              datasetId: datasetRef
            });
          }

          const checkpointId = `ckpt-${randomUUID()}`;
          const checkpoint = {
            checkpointId,
            label: toStringValue(args.label) ?? `Checkpoint ${run.checkpoints.length + 1}`,
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
          await deps.runRepository.save(run);

          return ok(run.runId, {
            checkpointId,
            checkpoint
          });
        }

        case 'register_derived_dataset': {
          const datasetRef = toStringValue(args.datasetId);
          if (!datasetRef) {
            return fail(run.runId, 'MISSING_REQUIRED_ARG', 'register_derived_dataset requires datasetId');
          }
          const dataset = await resolveProjectDataset(deps.datasetRepository, projectId, datasetRef);
          if (!dataset) {
            return fail(run.runId, 'DATASET_NOT_FOUND', 'Dataset not found in project context.', {
              datasetId: datasetRef
            });
          }
          run.derivedDatasetIds = mergeUniqueStrings(run.derivedDatasetIds, [dataset.datasetId]);
          await deps.runRepository.save(run);
          return ok(run.runId, {
            datasetId: dataset.datasetId,
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
          const targetDatasetRef = toStringValue(args.replayDatasetId) ?? run.activeDatasetId;
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

          const targetDataset = await resolveProjectDataset(deps.datasetRepository, projectId, targetDatasetRef!);
          if (!targetDataset) {
            return fail(run.runId, 'DATASET_NOT_FOUND', 'Replay target dataset not found in project context.', {
              checkpointId,
              datasetId: targetDatasetRef
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
          const requestedStepId = toStringValue(args.stepId);
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
          step.title = toStringValue(args.title) ?? step.title;
          step.rationale = toStringValue(args.rationale) ?? step.rationale;
          step.intentType = toStringValue(args.intentType) ?? step.intentType;
          step.toolCallId = toolCallId ?? step.toolCallId;
          step.status = 'pending';
          step.requiresApproval = toBooleanValue(args.requiresApproval) ?? inferRiskyIntent(step.intentType);
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
          await deps.runRepository.save(run);

          return ok(run.runId, {
            stepId: step.stepId,
            status: step.status,
            stdout: args.stdout,
            stderr: args.stderr,
            cellBindings,
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
          step.approvalDecision = requiresApproval ? 'pending' : 'approved';
          step.decisionReason = undefined;
          step.toolCallId = toolCallId ?? step.toolCallId;
          step.lastValidateSucceeded = true;
          step.status = requiresApproval ? 'awaiting_approval' : 'applied';
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
          await deps.runRepository.save(run);

          return ok(run.runId, {
            stepId: step.stepId,
            status: step.status,
            cellBindings,
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
          const approvalSource = toStringValue(args.approvalSource);
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
            const decisionReason = toStringValue(args.rejectionReason) ?? 'Rejected by user';
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
            await deps.runRepository.save(run);
            return ok(run.runId, {
              stepId: step.stepId,
              status: step.status,
              cellBindings,
              step: serializeStep(step)
            });
          }

          const datasetRef = toStringValue(args.datasetId) ?? run.activeDatasetId;
          if (!datasetRef) {
            return fail(
              run.runId,
              'MISSING_REQUIRED_ARG',
              'commit_transformation_step requires datasetId or active dataset context.',
              { stepId: step.stepId }
            );
          }

          const dataset = await resolveProjectDataset(deps.datasetRepository, projectId, datasetRef);
          if (!dataset) {
            return fail(run.runId, 'DATASET_NOT_FOUND', 'Dataset not found in project context.', {
              stepId: step.stepId,
              datasetId: datasetRef
            });
          }

          step.status = 'applied';
          step.approvalDecision = 'approved';
          step.decisionReason = undefined;
          step.toolCallId = toolCallId ?? step.toolCallId;
          step.updatedAt = nowIso();
          run.activeDatasetId = dataset.datasetId;
          const cellBindings = toCellBindings(run.runId, step, step.updatedAt, toolCallId);

          appendEvent(run, {
            eventId: randomUUID(),
            runId: run.runId,
            type: 'step_committed',
            stepId: step.stepId,
            datasetId: dataset.datasetId,
            payload: {
              toolCallId: step.toolCallId,
              approved: approved ?? true,
              requiredInputSchema: toSchemaSnapshot(dataset),
              cellBindings,
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
            cellBindings,
            step: serializeStep(step)
          });
        }

        case 'detect_step_divergence': {
          const scopedStepId = toStringValue(args.stepId);
          const scopedCellId = toStringValue(args.cellId);
          if (scopedStepId && !run.steps[scopedStepId]) {
            return fail(run.runId, 'STEP_NOT_FOUND', `Step ${scopedStepId} not found for run ${run.runId}`, {
              stepId: scopedStepId
            });
          }
          const targetSteps = detectStepTargets(run, scopedStepId, scopedCellId);

          const results: Array<{
            stepId: string;
            diverged: boolean;
            status: StepState['status'];
            details: StepDivergenceDetail[];
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
            await deps.runRepository.save(run);
          }

          return ok(run.runId, {
            checkedStepIds: targetSteps.map((step) => step.stepId),
            divergedStepIds,
            results
          });
        }

        case 'reconcile_diverged_step': {
          const stepId = toStringValue(args.stepId);
          const maybeStep = ensureStepExists(run, run.runId, stepId);
          if ('error' in maybeStep) {
            return maybeStep;
          }
          const step = maybeStep;

          const divergence = await computeStepDivergence(run, step, cellInspector);
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

          const strategy = toStringValue(args.strategy) ?? 'absorb_edit';
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

            await deps.runRepository.save(run);
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
          linkedStep.title = toStringValue(args.title) ?? `${step.title} (reconciled)`;
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

          await deps.runRepository.save(run);
          return ok(run.runId, {
            stepId: linkedStep.stepId,
            strategy,
            reconciled: true,
            previousStepId: step.stepId,
            cellBindings,
            step: serializeStep(linkedStep),
            previousStep: serializeStep(step)
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
