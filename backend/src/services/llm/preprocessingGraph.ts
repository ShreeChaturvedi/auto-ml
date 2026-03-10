import { randomUUID } from 'node:crypto';

import { env } from '../../config.js';
import { hasDatabaseConfiguration } from '../../db.js';
import { createDatasetRepository, type DatasetRepository } from '../../repositories/datasetRepository.js';
import { getCell as getNotebookCell, updateCell as updateNotebookCell } from '../../repositories/notebookRepository.js';
import {
  createFilePreprocessingRunRepository,
  type PreprocessingRunEvent,
  type PreprocessingRunRepository,
  type PreprocessingRunState,
  type StepState
} from '../../repositories/preprocessingRunRepository.js';
import { asBoolean, asRecord, asString } from '../../utils/typeCoercion.js';

import {
  createPreprocessingLangGraphRuntime,
  type PreprocessingGraphState,
  type PreprocessingLangGraphRuntime
} from './langgraph/preprocessingRuntime.js';
import {
  appendEvent,
  buildPreprocessingCellMetadata,
  fail,
  nowIso,
  serializeStep
} from './preprocessingTools/helpers.js';
import { TOOL_HANDLERS } from './preprocessingTools/index.js';
import type {
  PreprocessingCellInspector,
  PreprocessingCellMetadataStore
} from './preprocessingTools/types.js';

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

const NON_TERMINAL_STEP_STATUSES = new Set<StepState['status']>([
  'pending',
  'running',
  'awaiting_approval',
  'diverged'
]);

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

function toPreprocessingGraphState(value: unknown): PreprocessingGraphState | undefined {
  const candidate = asRecord(value);
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
  const output = asRecord(result.output);
  const step = asRecord(output?.step);
  const stepId = asString(step?.stepId) ?? asString(args.stepId);
  const failed = Boolean(result.error);

  switch (toolName) {
    case 'set_active_dataset':
    case 'profile_active_dataset': {
      const datasetId = asString(output?.datasetId) ?? asString(args.datasetId);
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
      const executeSucceeded = !failed && (asBoolean(step?.lastExecuteSucceeded) ?? asBoolean(args.succeeded) ?? true);
      return {
        currentStage: 'execute_code',
        nextStage: 'execute_code',
        executeSucceeded,
        currentStepId: stepId
      };
    }
    case 'validate_step_result': {
      const requiresApproval = asBoolean(step?.requiresApproval) ?? asBoolean(args.requiresApproval) ?? false;
      const validationPassed = !failed && (asBoolean(step?.lastValidateSucceeded) ?? true);
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
      const approvedArg = asBoolean(args.approved);
      const reasonCode = asString(output?.reasonCode);
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
          metadata: buildPreprocessingCellMetadata(asRecord(existing.metadata), binding)
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
        metadata: asRecord(cell.metadata) ?? {}
      };
    }
  };
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
  | { output: unknown; error: string }
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

export function createPreprocessingLangGraphSynchronizer(deps: PreprocessingLangGraphSyncDependencies) {
  return async function syncPreprocessingLangGraphState(
    projectId: string,
    toolName: PreprocessingToolName,
    args: Record<string, unknown>,
    result: { output?: unknown; error?: string }
  ): Promise<{ output?: unknown; error?: string }> {
    const output = asRecord(result.output);
    if (!output) {
      return result;
    }

    const runId = asString(output.runId) ?? asString(args.runId);
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
    const explicitRunId = asString(args.runId);
    const toolCallId = asString(args.toolCallId);
    const resolvedRun = await resolveExecutionRun(deps.runRepository, projectId, explicitRunId);
    if ('error' in resolvedRun) {
      return resolvedRun;
    }
    const run = resolvedRun.run;

    try {
      const handler = TOOL_HANDLERS.get(toolName);
      if (!handler) {
        return fail(run.runId, 'INTERNAL_ERROR', `Unsupported preprocessing tool: ${toolName}`);
      }

      return await handler({
        projectId,
        toolCallId,
        run,
        args,
        datasetRepository: deps.datasetRepository,
        runRepository: deps.runRepository,
        cellMetadataStore,
        cellInspector
      });
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
