import { randomUUID } from 'node:crypto';

import { env } from '../../../config.js';
import { createDatasetRepository } from '../../../repositories/datasetRepository.js';
import {
  createFilePreprocessingRunRepository
} from '../../../repositories/preprocessingRunRepository.js';
import { ToolCallSchema } from '../../../types/llm.js';
import type { ToolResult } from '../../../types/llm.js';
import { asString } from '../../../utils/typeCoercion.js';
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
  extractLatestStepNotebookContext
} from './preprocessing/context.js';
import {
  PREPROCESSING_LIFECYCLE,
  buildPreprocessingStageConfig
} from './preprocessing/stageConfig.js';
import { resolvePreprocessingNextStage } from './preprocessing/transition.js';
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

// -- Deterministic actions (ported from plannerNotebook, plannerExecution, plannerValidation)

async function buildWriteCodeAction(state: WorkflowGraphState): Promise<import('../../../types/llm.js').ToolCall[]> {
  const step = extractLatestStepNotebookContext(state);
  if (!step) return [];
  if (!step.code) return [];

  const activeDatasetId = state.run.activeDatasetId;
  const currentTurnResults = state.toolResultHistory.slice(state.turnStartToolCallCount);
  const latestCellId = extractLatestCellId(currentTurnResults);

  // If last tool was write_cell and we have a cell, run it
  const latestTool = currentTurnResults.at(-1)?.tool;
  if (latestTool === 'write_cell' && latestCellId) {
    const parsed = ToolCallSchema.safeParse({
      id: `wf-call-${randomUUID()}`,
      tool: 'run_cell',
      args: {
        cellId: latestCellId,
        ...(activeDatasetId ? { datasetId: activeDatasetId } : {})
      },
      rationale: `Execute notebook cell for preprocessing step ${step.stepId}.`
    });
    return parsed.success ? [parsed.data] : [];
  }

  // Build visible cell content with explicit load/save calls so the user
  // sees exactly what runs in the kernel (no invisible wrapping at execution).
  let cellContent = step.code;
  if (activeDatasetId) {
    const dataset = await datasetRepository.getById(activeDatasetId);
    if (dataset && dataset.projectId === state.run.projectId) {
      cellContent = buildPreprocessingCellContent({
        filename: dataset.filename,
        datasetId: dataset.datasetId,
        fileType: dataset.fileType,
        dataframeName: 'df',
        userCode: step.code
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
      ...(latestCellId ? { cellId: latestCellId } : {}),
      title: step.title ?? `Step ${step.stepId}`,
      content: cellContent,
      cellType: 'code',
      metadata
    },
    rationale: `Create/update notebook cell for preprocessing step ${step.stepId}.`
  });
  return parsed.success ? [parsed.data] : [];
}

function buildRecordExecutionAction(state: WorkflowGraphState): import('../../../types/llm.js').ToolCall[] {
  const step = extractLatestStepNotebookContext(state);
  if (!step) return [];

  const currentTurnResults = state.toolResultHistory.slice(state.turnStartToolCallCount);
  const runCell = extractLatestRunCellContext(currentTurnResults);
  const cellId = extractLatestCellId(currentTurnResults);

  const parsed = ToolCallSchema.safeParse({
    id: `wf-call-${randomUUID()}`,
    tool: 'execute_transformation_step',
    args: {
      runId: step.runId,
      stepId: step.stepId,
      cellId: cellId ?? undefined,
      succeeded: runCell?.status === 'success',
      stdout: runCell?.stdout ?? '',
      stderr: runCell?.stderr ?? ''
    },
    rationale: 'Record the latest preprocessing notebook execution outcome.'
  });
  return parsed.success ? [parsed.data] : [];
}

function buildValidateAction(state: WorkflowGraphState): import('../../../types/llm.js').ToolCall[] {
  const step = extractLatestStepNotebookContext(state);
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

// -- Delegated action: code generation (ported from plannerCode.ts) ---------

async function buildCodeGenerationAction(
  client: LlmClient,
  state: WorkflowGraphState
): Promise<import('../../../types/llm.js').ToolCall[]> {
  const step = extractLatestStepNotebookContext(state);
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

  const systemPrompt = `You are a Python data preprocessing expert. Author executable Python code for the requested transformation.

RULES:
- Work on a DataFrame variable named \`df\` (already loaded in scope).
- Modify \`df\` in-place. Do NOT re-read or re-create the DataFrame.
- Use pandas/numpy idioms. Keep the code minimal and focused.
- Do NOT use asserts. Summarize validation as print() statements.
- Return ONLY raw Python code — no markdown fences, no explanation.

PANDAS COMPATIBILITY (avoid FutureWarnings):
- Before assigning float results (e.g. scaled/normalized values) to columns with integer dtype, cast first: \`df[cols] = df[cols].astype("float64")\`.
- Never use \`inplace=True\`. Write \`df[col] = df[col].fillna(...)\` instead of \`df[col].fillna(..., inplace=True)\`.
- Use \`isinstance(dtype, pd.CategoricalDtype)\` instead of \`pd.api.types.is_categorical_dtype()\`.
- When assigning transformed arrays back to DataFrame columns, ensure dtype compatibility explicitly.`;

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
      { role: 'system', content: systemPrompt },
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
  const toolCallId = asString(args.toolCallId);

  // Resolve run
  let run;
  if (explicitRunId) {
    const existing = await runRepository.getById(explicitRunId);
    if (!existing) {
      return fail(explicitRunId, 'RUN_NOT_FOUND', `Run ${explicitRunId} not found.`);
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
      buildValidateAction
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
