import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { env } from '../../../config.js';
import { createDatasetRepository } from '../../../repositories/datasetRepository.js';
import {
  createFilePreprocessingRunRepository
} from '../../../repositories/preprocessingRunRepository.js';
import type { DatasetFileType } from '../../../types/dataset.js';
import { ToolCallSchema } from '../../../types/llm.js';
import type { ToolResult } from '../../../types/llm.js';
import { asRecord, asString } from '../../../utils/typeCoercion.js';
import { createPreprocessingLangGraphRuntime } from '../../llm/langgraph/preprocessingRuntime.js';
import type { LlmClient } from '../../llm/llmClient.js';
import { createPreprocessingCellInspector, createPreprocessingCellMetadataStore } from '../../llm/preprocessing/cellBinding.js';
import {
  createPreprocessingLangGraphSynchronizer,
  PREPROCESSING_TOOL_NAMES,
  type PreprocessingToolName
} from '../../llm/preprocessing/stateSync.js';
import { fail } from '../../llm/preprocessingTools/helpers.js';
import { TOOL_HANDLERS } from '../../llm/preprocessingTools/index.js';
import * as notebookService from '../../notebook/notebookService.js';
import { buildPreprocessingCellContent } from '../../notebook/preprocessingExecutionContext.js';
import type { WorkflowGraphState } from '../graphState.js';
import type {
  PhaseConfig,
  PhaseContext,
  RuntimeContext,
  StageConfig,
  ToolContext
} from '../phaseConfig.js';
import { registerPhaseConfig } from '../phaseConfig.js';

import {
  extractLatestCellId,
  extractLatestRunCellContext,
  extractLatestStepNotebookContext,
  type StepNotebookContext
} from './preprocessing/context.js';
import {
  PREPROCESSING_LIFECYCLE,
  buildPreprocessingStageConfig
} from './preprocessing/stageConfig.js';
import { resolvePreprocessingNextStage } from './preprocessing/transition.js';

// ---------------------------------------------------------------------------
// Multi-cell decomposition helpers (our additions for #271)
// ---------------------------------------------------------------------------

interface RunCellResultContext {
  tool: string;
  cellId?: string;
  status?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
}

interface NotebookExecutionSnapshot {
  status?: string;
  stdout: string;
  stderr: string;
  cellId?: string;
}

const PREPROCESSING_CELL_MARKER_RE = /^\s*#\s*(?:cell\b.*|%%.*)$/i;

export function splitMaterializedStepCode(code: string): string[] {
  const trimmed = code.trim();
  if (!trimmed) {
    return [];
  }

  const lines = trimmed.split(/\r?\n/);
  const segments: string[] = [];
  let currentSegment: string[] = [];
  let sawMarker = false;

  const pushSegment = () => {
    const joined = currentSegment.join('\n').trim();
    if (joined) {
      segments.push(joined);
    }
    currentSegment = [];
  };

  for (const line of lines) {
    if (PREPROCESSING_CELL_MARKER_RE.test(line)) {
      sawMarker = true;
      pushSegment();
      continue;
    }
    currentSegment.push(line);
  }

  pushSegment();

  if (!sawMarker || segments.length === 0) {
    return [trimmed];
  }

  return segments;
}

export function buildPreprocessingCodeGenerationSystemPrompt(): string {
  return `You are a Python data preprocessing expert. Author executable Python code for the requested transformation.

RULES:
- Work on a DataFrame variable named \`df\` (already loaded in scope).
- Modify \`df\` in-place. Do NOT re-read or re-create the DataFrame.
- Use pandas/numpy idioms. Keep the code minimal and focused.
- If the step has more than one logical notebook phase, you MUST separate it with explicit comment markers like \`# Cell 1\`, \`# Cell 2\`.
- Treat audit/profile, transform, and post-transform validation as separate notebook phases whenever they are distinct.
- Do NOT collapse audit + transform + validation into one monolithic cell.
- Do NOT use asserts. Summarize validation as print() statements.
- Return ONLY raw Python code — no markdown fences, no explanation.

PANDAS COMPATIBILITY (avoid FutureWarnings):
- Before assigning float results (e.g. scaled/normalized values) to columns with integer dtype, cast first: \`df[cols] = df[cols].astype("float64")\`.
- Never use \`inplace=True\`. Write \`df[col] = df[col].fillna(...)\` instead of \`df[col].fillna(..., inplace=True)\`.
- Use \`isinstance(dtype, pd.CategoricalDtype)\` instead of \`pd.api.types.is_categorical_dtype()\`.
- When assigning transformed arrays back to DataFrame columns, ensure dtype compatibility explicitly.`;
}


function extractWrittenCellIds(toolResults: ToolResult[]): string[] {
  const cellIds: string[] = [];
  for (const result of toolResults) {
    if (!['write_cell', 'edit_cell'].includes(result.tool)) {
      continue;
    }
    const cellId = extractLatestCellId([result]);
    if (cellId) {
      cellIds.push(cellId);
    }
  }
  return cellIds;
}

function extractRunCellResults(toolResults: ToolResult[]): RunCellResultContext[] {
  const results: RunCellResultContext[] = [];
  for (const result of toolResults) {
    if (result.tool !== 'run_cell') {
      continue;
    }
    const output = asRecord(result.output);
    results.push({
      tool: result.tool,
      cellId: extractLatestCellId([result]) ?? undefined,
      status: typeof output?.status === 'string' ? output.status : undefined,
      stdout: typeof output?.stdout === 'string' ? output.stdout : undefined,
      stderr: typeof output?.stderr === 'string' ? output.stderr : undefined,
      error: typeof output?.error === 'string' ? output.error : result.error
    });
  }
  return results;
}

function aggregateRunOutputs(runCells: RunCellResultContext[]): { stdout: string; stderr: string } {
  return {
    stdout: runCells.map((entry) => entry.stdout?.trim()).filter(Boolean).join('\n\n'),
    stderr: runCells.map((entry) => entry.stderr?.trim()).filter(Boolean).join('\n\n')
  };
}

function summarizeNotebookCellOutputs(outputs: Array<{ type: string; content: string }>): { stdout: string; stderr: string } {
  const stdout = outputs
    .filter((output) => output.type !== 'error')
    .map((output) => output.content?.trim())
    .filter(Boolean)
    .join('\n\n');
  const stderr = outputs
    .filter((output) => output.type === 'error')
    .map((output) => output.content?.trim())
    .filter(Boolean)
    .join('\n\n');

  return { stdout, stderr };
}

async function resolveNotebookExecutionSnapshot(cellIds: string[]): Promise<NotebookExecutionSnapshot | null> {
  const statuses: string[] = [];
  const stdoutParts: string[] = [];
  const stderrParts: string[] = [];
  let latestCellId: string | undefined;

  for (const cellId of cellIds) {
    try {
      const cell = await notebookService.readCell(cellId);
      latestCellId = cellId;
      const hasErrorOutput = (cell.output ?? []).some((output) => output?.type === 'error');
      const hasVisibleOutput = (cell.output ?? []).length > 0 || (cell.outputRefs ?? []).length > 0;
      const hasObservedExecution = Boolean(
        cell.executedAt
        || cell.executionOrder != null
        || cell.executionCount != null
        || hasVisibleOutput
      );
      if (cell.executionStatus) {
        statuses.push(cell.executionStatus);
      } else if (hasErrorOutput) {
        statuses.push('error');
      } else if (hasObservedExecution) {
        statuses.push('success');
      }
      const { stdout, stderr } = summarizeNotebookCellOutputs(
        (cell.output ?? [])
          .filter((output) =>
            Boolean(output) && typeof output.type === 'string' && typeof output.content === 'string')
      );
      if (stdout) {
        stdoutParts.push(stdout);
      }
      if (stderr) {
        stderrParts.push(stderr);
      }
    } catch {
      continue;
    }
  }

  if (!latestCellId && stdoutParts.length === 0 && stderrParts.length === 0) {
    return null;
  }

  const hasError = statuses.includes('error');
  const allSucceeded = statuses.length >= cellIds.length && statuses.every((status) => status === 'success');
  const hasPending = statuses.some((status) => status === 'running' || status === 'idle');

  return {
    cellId: latestCellId,
    status: hasError ? 'error' : allSucceeded ? 'success' : hasPending ? 'running' : undefined,
    stdout: stdoutParts.join('\n\n'),
    stderr: stderrParts.join('\n\n')
  };
}

async function resolveNotebookExecutionOutcome(cellIds: string[]): Promise<RunCellResultContext | null> {
  const attempts = 20;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const snapshot = await resolveNotebookExecutionSnapshot(cellIds);
    if (!snapshot) {
      if (attempt < attempts - 1) {
        await delay(250);
      }
      continue;
    }

    if (snapshot.status === 'success' || snapshot.status === 'error') {
      return {
        tool: 'run_cell',
        cellId: snapshot.cellId,
        status: snapshot.status,
        stdout: snapshot.stdout,
        stderr: snapshot.stderr
      };
    }

    if (attempt < attempts - 1) {
      await delay(250);
    }
  }

  const finalSnapshot = await resolveNotebookExecutionSnapshot(cellIds);
  if (!finalSnapshot) {
    return null;
  }

  return {
    tool: 'run_cell',
    cellId: finalSnapshot.cellId,
    status: finalSnapshot.status,
    stdout: finalSnapshot.stdout,
    stderr: finalSnapshot.stderr
  };
}

async function resolveReusableStepCellIds(cellIds: string[]): Promise<Array<string | undefined>> {
  return Promise.all(cellIds.map(async (cellId) => {
    try {
      await notebookService.readCell(cellId);
      return cellId;
    } catch {
      return undefined;
    }
  }));
}

async function resolveLatestStepNotebookContext(
  state: WorkflowGraphState
): Promise<StepNotebookContext | null> {
  const direct = extractLatestStepNotebookContext(state);
  if (direct) {
    return direct;
  }

  const controllerSummary = asRecord(state.controllerSummary);
  const runId = asString(controllerSummary?.runId);
  const stepId = asString(controllerSummary?.activeStepId) ?? asString(controllerSummary?.currentStepId);
  if (!runId || !stepId) {
    return null;
  }

  const run = await runRepository.getById(runId);
  const step = run?.steps?.[stepId];
  if (!step) {
    return null;
  }

  return {
    runId,
    stepId: step.stepId,
    title: step.title,
    code: step.code,
    toolCallId: step.toolCallId,
    version: step.version,
    codeHash: step.codeHash,
    requiresApproval: step.requiresApproval,
    cellIds: [...step.cellIds]
  };
}



export function buildSegmentedPreprocessingCellContent(params: {
  segment: string;
  segmentIndex: number;
  segmentCount: number;
  dataset?: {
    filename: string;
    datasetId: string;
    fileType: DatasetFileType;
  };
}): string {
  const trimmedSegment = params.segment.trim();
  const dataset = params.dataset;
  if (!dataset) {
    return trimmedSegment;
  }

  if (params.segmentCount <= 1) {
    return buildPreprocessingCellContent({
      filename: dataset.filename,
      datasetId: dataset.datasetId,
      fileType: dataset.fileType,
      dataframeName: 'df',
      userCode: trimmedSegment
    });
  }

  if (params.segmentIndex === 0) {
    return [
      `df = load_preprocessing_dataset(${JSON.stringify(dataset.filename)}, ${JSON.stringify(dataset.datasetId)}, ${JSON.stringify(dataset.fileType)}, "df")`,
      '',
      trimmedSegment
    ].join('\n');
  }

  if (params.segmentIndex === params.segmentCount - 1) {
    return [
      trimmedSegment,
      '',
      `save_preprocessing_dataset(${JSON.stringify(dataset.filename)}, ${JSON.stringify(dataset.datasetId)}, ${JSON.stringify(dataset.fileType)}, "df")`
    ].join('\n');
  }

  return trimmedSegment;
}

// ---------------------------------------------------------------------------
// Preprocessing PhaseConfig — replaces Systems A (preprocessingRuntime) and
// B (controller). The coordinator lives here, while stage configuration,
// routing, and notebook-context helpers live in focused modules.
// ---------------------------------------------------------------------------

// -- Module-level singletons (same as preprocessingGraph.ts) ----------------

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const runRepository = createFilePreprocessingRunRepository(env.preprocessingRunsPath);
const cellMetadataStore = createPreprocessingCellMetadataStore();
const cellInspector = createPreprocessingCellInspector();

const syncLangGraphState = createPreprocessingLangGraphSynchronizer({
  runRepository,
  runtime: createPreprocessingLangGraphRuntime()
});

function isWorkflowThreadReference(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  return /^(?:[a-z]+-)*thread[-:]/i.test(value.trim());
}


// -- Deterministic actions (ported from plannerNotebook, plannerExecution, plannerValidation)

async function buildWriteCodeAction(state: WorkflowGraphState): Promise<import('../../../types/llm.js').ToolCall[]> {
  const step = await resolveLatestStepNotebookContext(state);
  if (!step) return [];
  if (!step.code) return [];
  const codeSegments = splitMaterializedStepCode(step.code);
  if (codeSegments.length === 0) {
    return [];
  }

  const activeDatasetId = state.run.activeDatasetId;
  const currentTurnResults = state.toolResultHistory.slice(state.turnStartToolCallCount);
  const writtenCellIds = extractWrittenCellIds(currentTurnResults);
  const runCells = extractRunCellResults(currentTurnResults);
  const reusableStepCellIds = await resolveReusableStepCellIds(step.cellIds);

  if (writtenCellIds.length > runCells.length) {
    const nextCellId = writtenCellIds[runCells.length];
    const parsed = ToolCallSchema.safeParse({
      id: `wf-call-${randomUUID()}`,
      tool: 'run_cell',
      args: {
        cellId: nextCellId,
        ...(activeDatasetId ? { datasetId: activeDatasetId } : {})
      },
      rationale: `Execute notebook cell for preprocessing step ${step.stepId}.`
    });
    return parsed.success ? [parsed.data] : [];
  }

  if (writtenCellIds.length >= codeSegments.length) {
    return [];
  }

  const nextSegmentIndex = writtenCellIds.length;
  const nextSegment = codeSegments[nextSegmentIndex];

  // Build visible cell content with explicit load/save calls so the user
  // sees exactly what runs in the kernel (no invisible wrapping at execution).
  let cellContent = nextSegment;
  if (activeDatasetId) {
    const dataset = await datasetRepository.getById(activeDatasetId);
    if (dataset && dataset.projectId === state.run.projectId) {
      cellContent = buildSegmentedPreprocessingCellContent({
        segment: nextSegment,
        segmentIndex: nextSegmentIndex,
        segmentCount: codeSegments.length,
        dataset: {
          filename: dataset.filename,
          datasetId: dataset.datasetId,
          fileType: dataset.fileType
        }
      });
    }
  }

  const metadata = {
    preprocessing: {
      runId: step.runId,
      stepId: step.stepId,
      toolCallId: step.toolCallId,
      version: step.version,
      codeHash: step.codeHash,
      datasetId: activeDatasetId,
      dataframeName: 'df'
    }
  };

  const parsed = ToolCallSchema.safeParse({
    id: `wf-call-${randomUUID()}`,
    tool: 'write_cell',
    args: {
      ...(reusableStepCellIds[nextSegmentIndex] ? { cellId: reusableStepCellIds[nextSegmentIndex] } : {}),
      title: codeSegments.length > 1
        ? `${step.title ?? `Step ${step.stepId}`} (${nextSegmentIndex + 1}/${codeSegments.length})`
        : step.title ?? `Step ${step.stepId}`,
      content: cellContent,
      cellType: 'code',
      metadata
    },
    rationale: `Create/update notebook cell for preprocessing step ${step.stepId}.`
  });
  return parsed.success ? [parsed.data] : [];
}

async function buildRecordExecutionAction(state: WorkflowGraphState): Promise<import('../../../types/llm.js').ToolCall[]> {
  const step = await resolveLatestStepNotebookContext(state);
  if (!step) return [];

  const currentTurnResults = state.toolResultHistory.slice(state.turnStartToolCallCount);
  const runCells = extractRunCellResults(currentTurnResults);
  const writtenCellIds = extractWrittenCellIds(currentTurnResults);
  let latestRunCell = runCells.at(-1) ?? null;
  let { stdout, stderr } = aggregateRunOutputs(runCells);

  if (writtenCellIds.length > 0 && (latestRunCell == null || latestRunCell.status !== 'success')) {
    const notebookOutcome = await resolveNotebookExecutionOutcome(writtenCellIds);
    if (notebookOutcome) {
      latestRunCell = notebookOutcome;
      if (!stdout) {
        stdout = notebookOutcome.stdout ?? '';
      }
      if (!stderr) {
        stderr = notebookOutcome.stderr ?? '';
      }
    }
  }

  const succeeded = latestRunCell?.status === 'success'
    || (
      latestRunCell != null
      && latestRunCell.status == null
      && !latestRunCell.error
      && !stderr.trim()
    );

  const parsed = ToolCallSchema.safeParse({
    id: `wf-call-${randomUUID()}`,
    tool: 'execute_transformation_step',
    args: {
      runId: step.runId,
      stepId: step.stepId,
      cellId: latestRunCell?.cellId ?? undefined,
      cellIds: writtenCellIds.length > 0 ? writtenCellIds : undefined,
      succeeded,
      stdout,
      stderr
    },
    rationale: 'Record the latest preprocessing notebook execution outcome.'
  });
  return parsed.success ? [parsed.data] : [];
}

async function buildValidateAction(state: WorkflowGraphState): Promise<import('../../../types/llm.js').ToolCall[]> {
  const step = await resolveLatestStepNotebookContext(state);
  if (!step) return [];

  const currentTurnResults = state.toolResultHistory.slice(state.turnStartToolCallCount);
  const runCell = extractLatestRunCellContext(currentTurnResults);
  const notes = runCell?.stderr?.trim()
    ? `Notebook execution stderr: ${runCell.stderr.slice(0, 500)}`
    : undefined;

  // When validation passes, auto-approve and proceed directly to commit.
  // Setting requiresApproval to false bypasses the await_approval stage.
  const parsed = ToolCallSchema.safeParse({
    id: `wf-call-${randomUUID()}`,
    tool: 'validate_step_result',
    args: {
      runId: step.runId,
      stepId: step.stepId,
      requiresApproval: false,
      ...(notes ? { notes } : {})
    },
    rationale: 'Validate the latest preprocessing step outcome.'
  });
  return parsed.success ? [parsed.data] : [];
}

async function buildCommitAction(state: WorkflowGraphState): Promise<import('../../../types/llm.js').ToolCall[]> {
  const step = await resolveLatestStepNotebookContext(state);
  if (!step) return [];

  const datasetId = state.run.activeDatasetId ?? state.turn.datasetId;
  if (!datasetId) {
    return [];
  }

  const parsed = ToolCallSchema.safeParse({
    id: `wf-call-${randomUUID()}`,
    tool: 'commit_transformation_step',
    args: {
      runId: step.runId,
      stepId: step.stepId,
      datasetId,
      ...(state.turn.notebookId ? { notebookId: state.turn.notebookId } : {})
    },
    rationale: 'Commit the validated preprocessing step and persist the current workbook dataset.'
  });
  return parsed.success ? [parsed.data] : [];
}

// -- Delegated action: code generation (ported from plannerCode.ts) ---------

async function buildCodeGenerationAction(
  client: LlmClient,
  state: WorkflowGraphState
): Promise<import('../../../types/llm.js').ToolCall[]> {
  const step = await resolveLatestStepNotebookContext(state);
  if (!step) return [];

  // Extract dataset summary from tool history (search full history — dataset
  // profiles from previous turns are still valid context for code generation)
  let datasetSummary = '';
  for (let i = state.toolResultHistory.length - 1; i >= 0; i--) {
    const result = state.toolResultHistory[i];
    const output = result?.output as Record<string, unknown> | undefined;
    const dataset = output?.dataset as Record<string, unknown> | undefined;
    if (dataset) {
      const filename = typeof dataset.filename === 'string' ? dataset.filename : 'unknown';
      const nRows = typeof dataset.nRows === 'number' ? dataset.nRows : '?';
      const columns = Array.isArray(dataset.columns)
        ? (dataset.columns as Array<Record<string, unknown>>)
            .map((c) => `${c.name} (${c.dtype})`)
            .join(', ')
        : '';
      datasetSummary = `Dataset: ${filename}\nRows: ${nRows}\nColumns: ${columns}`;
      break;
    }
  }

  const userContent = [
    state.turn.prompt ? `User request: ${state.turn.prompt}` : '',
    `Run ID: ${step.runId}`,
    `Step ID: ${step.stepId}`,
    step.title ? `Step: ${step.title}` : '',
    step.code ? `Previous code (revise):\n${step.code}` : '',
    datasetSummary ? `\n${datasetSummary}` : ''
  ].filter(Boolean).join('\n');

  const rawCode = await client.complete({
    messages: [
      { role: 'system', content: buildPreprocessingCodeGenerationSystemPrompt() },
      { role: 'user', content: userContent }
    ],
    temperature: 0.2,
    maxOutputTokens: 2600,
    reasoningEffort: 'low'
  });

  // Strip code fences
  const code = rawCode
    .replace(/^```(?:python)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();

  if (!code) return [];

  const parsed = ToolCallSchema.safeParse({
    id: `wf-call-${randomUUID()}`,
    tool: 'materialize_step_code',
    args: {
      runId: step.runId,
      stepId: step.stepId,
      code
    },
    rationale: `Materialize executable code for preprocessing step ${step.stepId}.`
  });
  return parsed.success ? [parsed.data] : [];
}

// -- Tool execution (reuses existing handlers) ------------------------------

async function executePreprocessingToolCall(
  projectId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ output?: unknown; error?: string }> {
  const explicitRunId = asString(args.runId);
  const sanitizedRunId = explicitRunId && !isWorkflowThreadReference(explicitRunId)
    ? explicitRunId
    : undefined;
  const toolCallId = asString(args.toolCallId);

  // Resolve run
  let run;
  if (sanitizedRunId) {
    const existing = await runRepository.getById(sanitizedRunId);
    if (!existing) {
      return fail(sanitizedRunId, 'RUN_NOT_FOUND', `Run ${sanitizedRunId} not found.`);
    }
    run = existing;
  } else {
    run = await runRepository.getOrCreate(projectId);
  }

  const handler = TOOL_HANDLERS.get(toolName);
  if (!handler) {
    return fail(run.runId, 'INTERNAL_ERROR', `Unsupported tool: ${toolName}`);
  }

  try {
    return await handler({
      projectId,
      toolCallId,
      run,
      args,
      datasetRepository,
      runRepository,
      cellMetadataStore,
      cellInspector
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return fail(run.runId, 'INTERNAL_ERROR', message);
  }
}

// -- PhaseConfig implementation ---------------------------------------------

const PREPROCESSING_TOOL_NAME_SET: Set<string> = new Set(PREPROCESSING_TOOL_NAMES);

export const preprocessingPhaseConfig: PhaseConfig = {
  phase: 'preprocessing',
  lifecycle: PREPROCESSING_LIFECYCLE,

  async classifyTurn(
    _messages: unknown[],
    context: PhaseContext
  ): Promise<'answer' | 'action'> {
    void _messages;
    // For continuation turns with tool history, always action
    if (context.turn.prompt === undefined && context.run.status === 'running') {
      return 'action';
    }
    // Default to action — the controller's LLM classification will refine this
    return 'action';
  },

  getStageConfig(stage: string, runtimeContext?: RuntimeContext): StageConfig {
    return buildPreprocessingStageConfig(stage, {
    buildCodeGenerationAction,
    buildWriteCodeAction,
    buildRecordExecutionAction,
    buildValidateAction,
    buildCommitAction
  }, runtimeContext);
  },

  buildSystemPrompt(): string {
    return '';
  },

  buildUserContext(): Array<{ type: string; text: string }> {
    return [];
  },

  resolveNextStage(
    current: string,
    toolResults: ToolResult[]
  ): string | null {
    return resolvePreprocessingNextStage(current, toolResults);
  },

  isPhaseSpecificTool(toolName: string): boolean {
    return PREPROCESSING_TOOL_NAME_SET.has(toolName);
  },

  async executePhaseSpecificTool(
    name: string,
    args: unknown,
    ctx: ToolContext
  ): Promise<{ output?: unknown; error?: string }> {
    const toolName = name as PreprocessingToolName;
    const toolArgs = {
      ...(args as Record<string, unknown>),
      toolCallId: ctx.toolCallId,
      ...(ctx.turn.notebookId ? { notebookId: ctx.turn.notebookId } : {})
    };

    // Execute the tool
    const rawResult = await executePreprocessingToolCall(
      ctx.projectId,
      name,
      toolArgs
    );

    // Sync LangGraph state (same as the old syncPreprocessingLangGraphState)
    const synced = await syncLangGraphState(
      ctx.projectId,
      toolName,
      toolArgs,
      rawResult
    );

    return synced;
  }
};

// Register
registerPhaseConfig(preprocessingPhaseConfig);
