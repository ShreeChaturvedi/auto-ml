import { env } from '../../config.js';
import { createDatasetRepository, type DatasetRepository } from '../../repositories/datasetRepository.js';
import {
  createFilePreprocessingRunRepository,
  type PreprocessingRunEvent,
  type PreprocessingRunRepository,
  type PreprocessingRunState
} from '../../repositories/preprocessingRunRepository.js';
import { asString } from '../../utils/typeCoercion.js';

import { createPreprocessingLangGraphRuntime } from './langgraph/preprocessingRuntime.js';
import {
  createPreprocessingCellInspector,
  createPreprocessingCellMetadataStore
} from './preprocessing/cellBinding.js';
import { createPreprocessingRunInterruptionMarker } from './preprocessing/interruptionHandler.js';
import {
  type PreprocessingToolName,
  PREPROCESSING_TOOL_NAMES,
  createPreprocessingLangGraphSynchronizer
} from './preprocessing/stateSync.js';
import { fail, serializeStep } from './preprocessingTools/helpers.js';
import { TOOL_HANDLERS } from './preprocessingTools/index.js';
import type {
  PreprocessingCellInspector,
  PreprocessingCellMetadataStore
} from './preprocessingTools/types.js';

/* ------------------------------------------------------------------ */
/*  Re-exports — keep every public name importable from the old path   */
/* ------------------------------------------------------------------ */

export {
  type PreprocessingToolName,
  PREPROCESSING_TOOL_NAMES,
  buildLangGraphPatch,
  summarizeLangGraphState,
  toPreprocessingGraphState,
  createPreprocessingLangGraphSynchronizer,
  type PreprocessingLangGraphSyncDependencies
} from './preprocessing/stateSync.js';

export {
  createPreprocessingRunInterruptionMarker,
  type PreprocessingRunInterruptionInput,
  type PreprocessingRunInterruptionResult,
  type PreprocessingRunInterruptionDependencies
} from './preprocessing/interruptionHandler.js';

export {
  createPreprocessingCellMetadataStore,
  createPreprocessingCellInspector
} from './preprocessing/cellBinding.js';

/* ------------------------------------------------------------------ */
/*  Module-level singletons                                            */
/* ------------------------------------------------------------------ */

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const runRepository = createFilePreprocessingRunRepository(env.preprocessingRunsPath);
const langGraphRuntime = createPreprocessingLangGraphRuntime();
const PREPROCESSING_STATE_MODEL = 'hybrid' as const;

/* ------------------------------------------------------------------ */
/*  Snapshot & summary types                                           */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Snapshot helpers                                                    */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Run resolution                                                     */
/* ------------------------------------------------------------------ */

interface PreprocessingGraphDependencies {
  datasetRepository: DatasetRepository;
  runRepository: PreprocessingRunRepository;
  cellMetadataStore?: PreprocessingCellMetadataStore;
  cellInspector?: PreprocessingCellInspector;
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

/* ------------------------------------------------------------------ */
/*  Tool executor factory                                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Public query helpers                                               */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Pre-wired singletons                                               */
/* ------------------------------------------------------------------ */

export const syncPreprocessingLangGraphState = createPreprocessingLangGraphSynchronizer({
  runRepository,
  runtime: langGraphRuntime
});

export const markPreprocessingRunsInterrupted = createPreprocessingRunInterruptionMarker({
  runRepository,
  runtime: langGraphRuntime
});

export const executePreprocessingTool = createPreprocessingToolExecutor({
  datasetRepository,
  runRepository
});
