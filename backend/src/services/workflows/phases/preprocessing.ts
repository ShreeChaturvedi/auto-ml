import { randomUUID } from 'node:crypto';

import { env } from '../../../config.js';
import { createDatasetRepository } from '../../../repositories/datasetRepository.js';
import {
  createFilePreprocessingRunRepository
} from '../../../repositories/preprocessingRunRepository.js';
import { ToolCallSchema } from '../../../types/llm.js';
import type { ToolResult } from '../../../types/llm.js';
import { asRecord, asString } from '../../../utils/typeCoercion.js';
import { createPreprocessingLangGraphRuntime } from '../../llm/langgraph/preprocessingRuntime.js';
import type { LlmClient, LlmToolDefinition } from '../../llm/llmClient.js';
import { createPreprocessingCellInspector, createPreprocessingCellMetadataStore } from '../../llm/preprocessing/cellBinding.js';
import {
  createPreprocessingLangGraphSynchronizer,
  PREPROCESSING_TOOL_NAMES,
  type PreprocessingToolName
} from '../../llm/preprocessing/stateSync.js';
import { fail } from '../../llm/preprocessingTools/helpers.js';
import { TOOL_HANDLERS } from '../../llm/preprocessingTools/index.js';
import {
  CELL_TOOL_DEFINITIONS,
  PREPROCESSING_ORCHESTRATION_TOOLS
} from '../../llm/toolRegistry.js';
import { buildPreprocessingCellContent } from '../../notebook/preprocessingExecutionContext.js';
import type { WorkflowGraphState } from '../graphState.js';
import type {
  LifecycleStageDefinition,
  PhaseConfig,
  PhaseContext,
  RuntimeContext,
  StageConfig,
  ToolContext
} from '../phaseConfig.js';
import { registerPhaseConfig } from '../phaseConfig.js';

// ---------------------------------------------------------------------------
// Context extractors (inlined from preprocessingPlannerContext.ts)
// ---------------------------------------------------------------------------

interface StepNotebookContext {
  runId: string;
  stepId: string;
  title?: string;
  code?: string;
  toolCallId?: string;
  version?: number;
  codeHash?: string;
  requiresApproval?: boolean;
  cellIds: string[];
}

interface LatestRunCellContext {
  cellId?: string;
  status?: string;
  stdout?: string;
  stderr?: string;
}

function extractLatestStepNotebookContext(state: WorkflowGraphState): StepNotebookContext | null {
  const runId = state.controllerSummary?.runId;
  if (!runId) {
    return null;
  }

  for (let index = state.toolResultHistory.length - 1; index >= 0; index -= 1) {
    const output = asRecord(state.toolResultHistory[index]?.output);
    const step = asRecord(output?.step);
    const stepId = typeof output?.stepId === 'string'
      ? output.stepId
      : typeof step?.stepId === 'string'
        ? step.stepId
        : null;
    if (!stepId) {
      continue;
    }

    const cellIds = Array.isArray(step?.cellIds)
      ? step.cellIds.filter((value: unknown): value is string => typeof value === 'string')
      : [];

    return {
      runId: runId as string,
      stepId,
      title: typeof step?.title === 'string' ? step.title : undefined,
      code: typeof step?.code === 'string' ? step.code : undefined,
      toolCallId: typeof step?.toolCallId === 'string' ? step.toolCallId : undefined,
      version: typeof step?.version === 'number' ? step.version : undefined,
      codeHash: typeof step?.codeHash === 'string' ? step.codeHash : undefined,
      requiresApproval: typeof step?.requiresApproval === 'boolean' ? step.requiresApproval : undefined,
      cellIds
    };
  }

  return null;
}

function extractLatestCellId(toolResults: ToolResult[]): string | null {
  for (let index = toolResults.length - 1; index >= 0; index -= 1) {
    const result = toolResults[index];
    if (!['write_cell', 'edit_cell', 'run_cell'].includes(result.tool)) {
      continue;
    }
    const output = asRecord(result.output);
    if (typeof output?.cellId === 'string') {
      return output.cellId;
    }
    const cell = asRecord(output?.cell);
    if (typeof cell?.cellId === 'string') {
      return cell.cellId;
    }
    if (typeof cell?.id === 'string') {
      return cell.id;
    }
  }

  return null;
}

function extractLatestRunCellContext(toolResults: ToolResult[]): LatestRunCellContext | null {
  for (let index = toolResults.length - 1; index >= 0; index -= 1) {
    const result = toolResults[index];
    if (result.tool !== 'run_cell') {
      continue;
    }
    const output = asRecord(result.output);
    return {
      cellId: extractLatestCellId([result]) ?? undefined,
      status: typeof output?.status === 'string' ? output.status : undefined,
      stdout: typeof output?.stdout === 'string' ? output.stdout : undefined,
      stderr: typeof output?.stderr === 'string' ? output.stderr : undefined
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Preprocessing PhaseConfig — replaces Systems A (preprocessingRuntime) and
// B (controller). All classification, stage routing, and tool allowlists
// are encoded here.
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

// -- Lifecycle stages -------------------------------------------------------

const PREPROCESSING_LIFECYCLE: LifecycleStageDefinition[] = [
  { name: 'answer', label: 'Answering', order: 0 },
  { name: 'plan_step', label: 'Planning step', order: 1 },
  { name: 'generate_code', label: 'Generating code', order: 2 },
  { name: 'write_code', label: 'Writing to notebook', order: 3 },
  { name: 'record_execution', label: 'Recording execution', order: 4 },
  { name: 'validate', label: 'Validating', order: 5 },
  { name: 'await_approval', label: 'Awaiting approval', order: 6 },
  { name: 'commit', label: 'Committing', order: 7 },
  { name: 'summarize', label: 'Summarizing', order: 8 }
];

// -- Tool allowlists per stage (ported from controller.ts stageNode) --------

const ORCHESTRATION_TOOL_MAP = new Map<string, LlmToolDefinition>(
  [...PREPROCESSING_ORCHESTRATION_TOOLS, ...CELL_TOOL_DEFINITIONS]
    .map((tool) => [tool.name, tool])
);

function toolsByNames(names: string[]): LlmToolDefinition[] {
  return names
    .map((name) => ORCHESTRATION_TOOL_MAP.get(name))
    .filter((tool): tool is LlmToolDefinition => Boolean(tool));
}

const STAGE_TOOLS: Record<string, string[]> = {
  answer: [],
  plan_step: [
    'list_project_datasets', 'set_active_dataset', 'profile_active_dataset',
    'list_cells', 'read_cell', 'propose_transformation_step'
  ],
  generate_code: ['materialize_step_code'],
  write_code: ['write_cell', 'edit_cell', 'run_cell', 'list_cells', 'read_cell'],
  record_execution: ['execute_transformation_step', 'list_cells', 'read_cell'],
  validate: ['validate_step_result', 'profile_active_dataset', 'read_cell'],
  await_approval: [],
  commit: ['commit_transformation_step', 'checkpoint_dataset'],
  summarize: []
};

// -- Stage configs ----------------------------------------------------------

function buildStageConfig(stage: string, runtimeContext?: RuntimeContext): StageConfig {
  const toolNames = STAGE_TOOLS[stage] ?? [];
  const isTextStage = stage === 'answer' || stage === 'await_approval' || stage === 'summarize';
  const isDeterministic = stage === 'write_code' || stage === 'record_execution' || stage === 'validate';
  const isDelegated = stage === 'generate_code';

  // For preprocessing, the controller's classification may override defaults
  const allowTextResponse = runtimeContext?.allowTextResponse === true || isTextStage;
  const requireToolCall = runtimeContext?.requireToolCall === true || (!isTextStage && !allowTextResponse);

  const config: StageConfig = {
    name: stage,
    mode: isDeterministic ? 'deterministic'
      : isDelegated ? 'llm_delegated'
      : isTextStage ? 'text'
      : 'action',
    allowedTools: toolsByNames(toolNames),
    toolChoice: requireToolCall ? 'required' : 'auto',
    requiresApproval: stage === 'await_approval',
    allowAssistantMessage: allowTextResponse,
    allowAskUser: false,
    allowRenderUi: false,
    allowPlanExit: false,
    requireToolCall
  };

  // Attach deterministic/delegated actions per stage
  if (stage === 'generate_code') {
    config.delegatedAction = buildCodeGenerationAction;
  } else if (stage === 'write_code') {
    config.deterministicAction = buildWriteCodeAction;
  } else if (stage === 'record_execution') {
    config.deterministicAction = buildRecordExecutionAction;
  } else if (stage === 'validate') {
    config.deterministicAction = buildValidateAction;
  }

  return config;
}

// -- Turn classification (ported from controller.ts classify_turn) ----------

function inferPendingApproval(toolResults: ToolResult[]): boolean {
  const latest = toolResults.at(-1);
  if (!latest?.output || typeof latest.output !== 'object') return false;
  const output = latest.output as Record<string, unknown>;
  const step = output.step && typeof output.step === 'object' ? output.step as Record<string, unknown> : null;
  const status = typeof output.status === 'string' ? output.status
    : typeof step?.status === 'string' ? step.status : undefined;
  const reasonCode = typeof output.reasonCode === 'string' ? output.reasonCode : undefined;
  return status === 'awaiting_approval'
    || reasonCode === 'STEP_APPROVAL_REQUIRED'
    || reasonCode === 'STEP_APPROVAL_USER_REQUIRED';
}

function getLatestToolOutcome(toolResults: ToolResult[]): {
  latestToolName?: string;
  latestToolSucceeded: boolean;
} {
  const latest = toolResults.at(-1);
  if (!latest) return { latestToolSucceeded: false };
  const succeeded = !latest.error;
  return { latestToolName: latest.tool, latestToolSucceeded: succeeded };
}

// -- Action node inference (ported from controller.ts inferActionNode) ------

function inferActionNode(
  toolResults: ToolResult[],
  pendingApproval: boolean
): string {
  if (pendingApproval) return 'await_approval';

  const { latestToolName, latestToolSucceeded } = getLatestToolOutcome(toolResults);
  if (!latestToolName) return 'plan_step';

  if (!latestToolSucceeded) {
    // When validation fails, pause at await_approval for user review
    if (latestToolName === 'validate_step_result') {
      return 'await_approval';
    }
    // On failure of other tools, stay in plan_step for replanning
    return 'plan_step';
  }

  switch (latestToolName) {
    case 'propose_transformation_step': return 'generate_code';
    case 'materialize_step_code': return 'write_code';
    case 'write_cell':
    case 'edit_cell': return 'write_code';
    case 'run_cell': return 'record_execution';
    case 'execute_transformation_step': return 'validate';
    case 'validate_step_result': {
      // Check if approval is required from the tool result
      const latest = toolResults.at(-1);
      const output = latest?.output as Record<string, unknown> | undefined;
      const step = output?.step as Record<string, unknown> | undefined;
      const requiresApproval = step?.requiresApproval === true || output?.requiresApproval === true;
      return requiresApproval ? 'await_approval' : 'commit';
    }
    case 'commit_transformation_step': return 'summarize';
    case 'set_active_dataset':
    case 'profile_active_dataset':
    case 'list_project_datasets':
    case 'checkpoint_dataset':
    case 'list_cells':
    case 'read_cell':
      return 'plan_step';
    default: return 'plan_step';
  }
}

// -- Deterministic actions (ported from plannerNotebook, plannerExecution, plannerValidation)

async function buildWriteCodeAction(state: WorkflowGraphState): Promise<import('../../../types/llm.js').ToolCall[]> {
  const step = extractLatestStepNotebookContext(state);
  if (!step) return [];
  if (!step.code) return [];

  const activeDatasetId = state.run.activeDatasetId;
  const latestCellId = extractLatestCellId(state.toolResultHistory);

  // If last tool was write_cell and we have a cell, run it
  const latestTool = state.toolResultHistory.at(-1)?.tool;
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

  const runCell = extractLatestRunCellContext(state.toolResultHistory);
  const cellId = extractLatestCellId(state.toolResultHistory);

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

  const runCell = extractLatestRunCellContext(state.toolResultHistory);
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

  // Extract dataset summary from tool history
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
    return buildStageConfig(stage, runtimeContext);
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
    const pendingApproval = inferPendingApproval(toolResults);
    const nextNode = inferActionNode(toolResults, pendingApproval);
    return nextNode !== current ? nextNode : null;
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
      toolCallId: ctx.toolCallId
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
