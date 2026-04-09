import { randomUUID } from 'node:crypto';

import { env } from '../../../config.js';
import { createDatasetRepository } from '../../../repositories/datasetRepository.js';
import { ToolCallSchema } from '../../../types/llm.js';
import { asRecord, asString } from '../../../utils/typeCoercion.js';
import type { LlmClient, LlmToolDefinition } from '../../llm/llmClient.js';
import { TRAINING_LIFECYCLE_CONTRACT } from '../../llm/prompts/trainingContract.js';
import { LLM_TRAINING_LIFECYCLE_TOOLS } from '../../llm/tools/index.js';
import { TRAINING_TOOL_NAMES } from '../../llm/tools/trainingTools.js';
import { TRAINING_TOOL_HANDLERS } from '../../llm/trainingTools/index.js';
import { toTrainingToolContext } from '../../llm/trainingTools/types.js';
import type { WorkflowGraphState } from '../graphState.js';
import type {
  LifecycleStageDefinition,
  PhaseConfig,
  RuntimeContext,
  StageConfig,
  ToolContext,
  ToolResult
} from '../phaseConfig.js';
import { registerPhaseConfig } from '../phaseConfig.js';

// ---------------------------------------------------------------------------
// Training PhaseConfig
// ---------------------------------------------------------------------------

const TRAINING_TOOL_NAME_SET: Set<string> = new Set(TRAINING_TOOL_NAMES);

const TRAINING_LIFECYCLE: LifecycleStageDefinition[] = [
  { name: 'answer', label: 'Answer', order: 0 },
  { name: 'configure_experiment', label: 'Configure Experiment', order: 1 },
  { name: 'propose_model', label: 'Propose Model', order: 2 },
  { name: 'generate_code', label: 'Generate Code', order: 3 },
  { name: 'write_code', label: 'Write Code', order: 4 },
  { name: 'execute_training', label: 'Execute Training', order: 5 },
  { name: 'evaluate_results', label: 'Evaluate Results', order: 6 },
  { name: 'await_review', label: 'Await Review', order: 7 },
  { name: 'register_model', label: 'Register Model', order: 8 },
  { name: 'summarize', label: 'Summarize', order: 9 }
];

const STAGE_ORDER = TRAINING_LIFECYCLE.map((s) => s.name);

const APPROVAL_STAGES = new Set(['propose_model', 'await_review']);
const TRAINING_EXECUTION_NOTEBOOK_TOOLS = [
  'write_cell',
  'edit_cell',
  'run_cell',
  'delete_cell',
  'insert_cell'
];
const DISCOVERY_TOOLS = [
  'list_project_files',
  'get_dataset_profile',
  'get_dataset_sample',
  'search_documents'
];
const STAGE_TOOL_ALLOWLIST: Record<string, string[]> = {
  answer: ['configure_experiment', 'propose_training_plan', ...DISCOVERY_TOOLS],
  configure_experiment: ['configure_experiment', ...DISCOVERY_TOOLS],
  propose_model: ['configure_experiment', 'propose_training_plan', ...DISCOVERY_TOOLS],
  generate_code: [...TRAINING_EXECUTION_NOTEBOOK_TOOLS],
  write_code: [...TRAINING_EXECUTION_NOTEBOOK_TOOLS],
  execute_training: ['execute_training'],
  evaluate_results: ['evaluate_results'],
  await_review: ['register_model'],
  register_model: ['register_model'],
  summarize: []
};
const TOOL_BY_NAME = new Map(
  (LLM_TRAINING_LIFECYCLE_TOOLS as LlmToolDefinition[]).map((tool) => [tool.name, tool])
);
const datasetRepository = createDatasetRepository(env.datasetMetadataPath);

interface TrainingCellDraft {
  title: string;
  content: string;
}

interface TrainingDraftMetadata {
  draftId: string;
  experimentId?: string;
  datasetId?: string;
  datasetFilename?: string;
  targetColumn?: string;
  segmentIndex: number;
  segments: TrainingCellDraft[];
}

// Training now runs in mode='text' for every stage and uses stage-specific
// allowed tool sets. This keeps the flexible streaming behavior while
// preventing late-stage regressions (e.g. re-proposing plans after failed
// registration instead of repairing/evaluating/registering).
//
// It routes to streamWorkflowText
// (the same reliable streaming path Feature Engineering uses) instead of
// mode='action' (the planner path). The planner is a low-reasoning-effort
// JSON-output LLM call that repeatedly fails with:
//  - "Response did not contain valid JSON" (can't produce JSON reliably)
//  - Missing required fields in render_ui/tool_call payloads (Zod rejection)
//  - Wrong tool args (experimentId hallucinated from threadId or omitted)
//  - Notebook tool preference over lifecycle tools (no amount of forced-stage
//    gating fixes this because the planner's context is too compressed)
//
// streamWorkflowText uses the MAIN LLM (gpt-5.4) with the full training
// contract, dataset context, tool definitions, and tool call/result history.
// The LLM calls tools directly in its streaming output — configure_experiment,
// write_cell, run_cell, execute_training, etc. — exactly like FE does with
// propose_feature, materialize_feature_code, etc. The contract guides the
// lifecycle sequence; no planner intermediary needed.

function toolsForStage(stage: string): LlmToolDefinition[] {
  const names = STAGE_TOOL_ALLOWLIST[stage];
  if (!names) {
    return LLM_TRAINING_LIFECYCLE_TOOLS as LlmToolDefinition[];
  }
  return names
    .map((name) => TOOL_BY_NAME.get(name))
    .filter((tool): tool is LlmToolDefinition => Boolean(tool));
}

function buildStageConfig(stage: string): StageConfig {
  const config: StageConfig = {
    name: stage,
    mode: stage === 'generate_code'
      ? 'llm_delegated'
      : stage === 'write_code' || stage === 'execute_training' || stage === 'evaluate_results' || stage === 'register_model'
        ? 'deterministic'
        : 'text',
    allowedTools: toolsForStage(stage),
    toolChoice: 'auto',
    requiresApproval: APPROVAL_STAGES.has(stage),
    allowAssistantMessage: true,
    allowAskUser: true,
    allowRenderUi: true,
    allowPlanExit: false,
    requireToolCall: false
  };
  if (stage === 'generate_code') {
    config.delegatedAction = buildTrainingCodeGenerationAction;
  } else if (stage === 'write_code') {
    config.deterministicAction = buildTrainingWriteCodeAction;
  } else if (stage === 'execute_training') {
    config.deterministicAction = buildTrainingExecuteAction;
  } else if (stage === 'evaluate_results') {
    config.deterministicAction = buildTrainingEvaluateAction;
  } else if (stage === 'register_model') {
    config.deterministicAction = buildTrainingRegisterAction;
  }
  return config;
}

function extractLatestExperimentIdFromHistory(state: WorkflowGraphState): string | null {
  const experimentIdTools = new Set([
    'configure_experiment',
    'propose_training_plan',
    'execute_training',
    'evaluate_results',
    'register_model'
  ]);

  for (let index = state.toolResultHistory.length - 1; index >= 0; index -= 1) {
    const result = state.toolResultHistory[index];
    if (!experimentIdTools.has(result.tool) || result.error) {
      continue;
    }
    const output = asRecord(result.output);
    const experimentId = asString(output?.experimentId);
    if (experimentId) {
      return experimentId;
    }
  }

  return null;
}

function extractExperimentRecord(
  run: WorkflowGraphState['run'],
  state?: WorkflowGraphState
): Record<string, unknown> | null {
  const experiments = asRecord(run.metadata?.experiments);
  if (!experiments) {
    return null;
  }

  const activeExperimentId = state ? extractLatestExperimentIdFromHistory(state) : null;
  if (activeExperimentId) {
    const exact = asRecord(experiments[activeExperimentId]);
    if (exact) {
      return exact;
    }
  }

  const candidates = Object.values(experiments)
    .map((value) => asRecord(value))
    .filter((value): value is Record<string, unknown> => Boolean(value));
  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    const leftUpdated = asString(left.updatedAt) ?? '';
    const rightUpdated = asString(right.updatedAt) ?? '';
    return rightUpdated.localeCompare(leftUpdated);
  });
  return candidates[0];
}

const TRAINING_CELL_MARKER_RE = /^\s*#\s*Cell\s+\d+(?::\s*(.+))?\s*$/i;

function parseExplicitTrainingSegments(code: string): TrainingCellDraft[] {
  const segments: TrainingCellDraft[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];
  let sawMarker = false;

  const pushSegment = () => {
    const content = currentLines.join('\n').trim();
    if (!content) {
      currentLines = [];
      return;
    }
    segments.push({
      title: currentTitle ?? `Training Step ${segments.length + 1}`,
      content
    });
    currentLines = [];
  };

  for (const line of code.split(/\r?\n/)) {
    const match = line.match(TRAINING_CELL_MARKER_RE);
    if (match) {
      sawMarker = true;
      pushSegment();
      currentTitle = match[1]?.trim() || `Training Step ${segments.length + 1}`;
      continue;
    }
    currentLines.push(line);
  }

  pushSegment();
  return sawMarker ? segments : [];
}

function firstLineMatchIndex(lines: string[], patterns: RegExp[], start = 0): number {
  for (let index = start; index < lines.length; index += 1) {
    if (patterns.some((pattern) => pattern.test(lines[index] ?? ''))) {
      return index;
    }
  }
  return -1;
}

function buildHeuristicTrainingSegments(code: string): TrainingCellDraft[] {
  const lines = code.split(/\r?\n/);
  const importsEnd = (() => {
    let index = 0;
    while (index < lines.length) {
      const line = lines[index]?.trim() ?? '';
      if (!line || line.startsWith('import ') || line.startsWith('from ')) {
        index += 1;
        continue;
      }
      break;
    }
    return Math.max(index, 1);
  })();

  const dataStart = firstLineMatchIndex(lines, [
    /resolve_dataset_path\s*\(/,
    /pd\.read_(csv|parquet|json)\s*\(/,
    /\bdataset_path\s*=/,
    /\bdf\s*=\s*pd\./
  ], importsEnd);
  const fitStart = firstLineMatchIndex(lines, [
    /\.fit\s*\(/,
    /\bGridSearchCV\s*\(/,
    /\bRandomizedSearchCV\s*\(/,
    /\btrain_test_split\s*\(/,
    /\bcross_val_score\s*\(/,
    /\bcross_validate\s*\(/
  ], Math.max(dataStart, importsEnd));
  const artifactStart = firstLineMatchIndex(lines, [
    /joblib\.dump\s*\(/,
    /__TRAIN_COMPLETE__\|/,
    /\bfinal_metrics\b/,
    /\bresults\s*=\s*\{/
  ], Math.max(fitStart, dataStart, importsEnd));

  const boundaries = Array.from(new Set([
    0,
    importsEnd,
    dataStart,
    fitStart,
    artifactStart,
    lines.length
  ].filter((value) => Number.isInteger(value) && value > 0 && value < lines.length))).sort((a, b) => a - b);

  const titledBoundaries = [
    { start: 0, end: boundaries[0] ?? lines.length, title: 'Imports and Config' },
    { start: boundaries[0] ?? lines.length, end: boundaries[1] ?? lines.length, title: 'Dataset Prep' },
    { start: boundaries[1] ?? lines.length, end: boundaries[2] ?? lines.length, title: 'Model Fit and Evaluation' },
    { start: boundaries[2] ?? lines.length, end: lines.length, title: 'Artifact Save and Final Metrics' }
  ];

  return titledBoundaries
    .map(({ start, end, title }) => ({
      title,
      content: lines.slice(start, end).join('\n').trim()
    }))
    .filter((segment) => segment.content.length > 0);
}

function splitTrainingGeneratedCode(code: string): TrainingCellDraft[] {
  const trimmed = code.trim();
  if (!trimmed) {
    return [];
  }

  const explicit = parseExplicitTrainingSegments(trimmed);
  if (explicit.length >= 2) {
    return explicit;
  }

  const heuristic = buildHeuristicTrainingSegments(trimmed);
  if (heuristic.length >= 2) {
    return heuristic;
  }

  return [
    {
      title: 'Training Step 1',
      content: trimmed
    }
  ];
}

function buildTrainingCodeGenerationSystemPrompt(): string {
  return `You are authoring notebook code for the training workflow.

Return ONLY raw Python code. No markdown fences. No prose.

HARD RULES:
- Use the selected dataset and selected target from the request context. Do NOT invent or switch to a different dataset or target.
- Write code as 2-4 SMALL executable notebook cells separated with explicit markers:
  # Cell 1: Imports and Config
  # Cell 2: Dataset Prep
  # Cell 3: Model Fit and Evaluation
  # Cell 4: Artifact Save and Final Metrics
- Every cell must be independently runnable after previous cells.
- Use resolve_dataset_path(filename, datasetId) for loading the dataset.
- If experiment featureColumns are provided, train on exactly that subset.
- If you use stratified splitting or stratified CV for classification, guard it: when any class has fewer than 2 rows, fall back to an unstratified split/CV instead of failing.
- If you parse a column with pd.to_datetime() or otherwise create a datetime64 column, do NOT pass that raw datetime column into numeric imputation/scaling/model input. Convert it to numeric/ordinal first, derive date parts, or drop the raw datetime column before building numeric_features.
- If date-derived numeric columns already exist (for example date_month/date_year), prefer those and exclude the raw DATE column from numeric preprocessing.
- Do NOT write markdown cells, notebook narration, or plan summaries.
- The FINAL executable cell must print:
  print("__TRAIN_COMPLETE__|" + json.dumps(final_metrics))
- Keep runtime lean. Prefer train/test split or light CV unless the request explicitly requires heavier evaluation.
- Save the trained pipeline/model with joblib.dump(..., "model.joblib") before final completion.
`;
}

function buildTrainingRepairSystemPrompt(): string {
  return `You are repairing ONE failed Python notebook cell for the training workflow.

Return ONLY raw Python code for the replacement cell body. No markdown fences. No prose.

HARD RULES:
- Repair only the failing cell. Assume prior successful cells already ran and their variables/imports remain available.
- Use the selected dataset and selected target from the request context. Do NOT switch dataset or target.
- Do NOT emit cell markers like "# Cell 1".
- Do NOT emit markdown or notebook narration.
- Keep the cell focused on the failed stage and preserve the training workflow contract.
- If the failure mentions datetime64, DTypePromotionError, or numeric imputation/scaling with dates, repair it by converting the raw datetime column to numeric/ordinal values, deriving date parts, or dropping the raw datetime column before numeric preprocessing. Do NOT send raw datetime columns into numeric_features.
- If this is the final training/evaluation cell, it must still print:
  print("__TRAIN_COMPLETE__|" + json.dumps(final_metrics))
`;
}

async function buildTrainingCodeGenerationAction(
  client: LlmClient,
  state: WorkflowGraphState
): Promise<import('../../../types/llm.js').ToolCall[]> {
  const experiment = extractExperimentRecord(state.run, state);
  if (!experiment || !state.turn.datasetId) {
    return [];
  }

  const dataset = await datasetRepository.getById(state.turn.datasetId);
  if (!dataset || dataset.projectId !== state.turn.projectId) {
    return [];
  }

  const featureColumns = Array.isArray(experiment.featureColumns)
    ? experiment.featureColumns.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
  const currentTurnResults = state.toolResultHistory.slice(state.turnStartToolCallCount);
  const currentTurnCalls = state.toolCallHistory.slice(state.turnStartToolCallCount);
  const lastRunCell = getLastToolResult(currentTurnResults, 'run_cell');
  const lastRunOutput = getOutputRecord(lastRunCell);
  const stderr = asString(lastRunOutput?.stderr) ?? asString(lastRunOutput?.error) ?? '';
  const stdout = asString(lastRunOutput?.stdout) ?? '';
  const latestDraft = extractLatestTrainingDraftMetadata(state);

  if (isFailedToolResult(lastRunCell) && latestDraft) {
    const failingSegmentIndex = Math.max(0, Math.min(
      latestDraft.segmentIndex,
      Math.max(0, latestDraft.segments.length - 1)
    ));
    const failingSegment = latestDraft.segments[failingSegmentIndex];
    const lastRunCall = [...currentTurnCalls].reverse().find((call) => call.tool === 'run_cell') ?? null;
    const failingCellId = asString(lastRunOutput?.cellId)
      ?? asString(lastRunCall?.args?.cellId);
    if (!failingCellId || !failingSegment) {
      return [];
    }

    const repairPrompt = [
      `Selected dataset (authoritative): ${dataset.filename} [${dataset.datasetId}]`,
      state.turn.targetColumn ? `Selected target column (authoritative): ${state.turn.targetColumn}` : null,
      `User request: ${state.turn.prompt ?? 'Continue the training workflow.'}`,
      `Configured experiment: ${asString(experiment.experimentName) ?? 'Unnamed experiment'}`,
      `Failed segment title: ${failingSegment.title}`,
      `Failed segment index: ${failingSegmentIndex + 1} of ${latestDraft.segments.length}`,
      featureColumns.length > 0
        ? `Feature columns: ${featureColumns.join(', ')}`
        : 'Feature columns: use the selected dataset columns, excluding the target column.',
      `Dataset columns: ${dataset.columns.map((column) => `${column.name} (${column.dtype})`).join(', ')}`,
      `Previous failing code:\n${failingSegment.content}`,
      stderr ? `Execution error to repair:\n${stderr}` : null
    ].filter(Boolean).join('\n');

    const repairedCode = await client.complete({
      messages: [
        { role: 'system', content: buildTrainingRepairSystemPrompt() },
        { role: 'user', content: repairPrompt }
      ],
      temperature: 0.2,
      maxOutputTokens: 3000,
      reasoningEffort: 'low'
    });

    const cleanedRepair = repairedCode
      .replace(/^```(?:python)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
    if (!cleanedRepair) {
      return [];
    }

    const parsedRepair = ToolCallSchema.safeParse({
      id: `wf-call-auto-rewrite-training-${latestDraft.draftId}-${failingSegmentIndex}`,
      tool: 'write_cell',
      args: {
        cellId: failingCellId,
        title: failingSegment.title,
        cellType: 'code',
        content: cleanedRepair,
        metadata: {
          phase: 'training',
          source: 'training-lifecycle',
          trainingDraft: {
            ...latestDraft,
            segmentIndex: failingSegmentIndex
          }
        }
      },
      rationale: 'Replace the failed training notebook cell with repaired code before continuing.'
    });
    return parsedRepair.success ? [parsedRepair.data] : [];
  }

  const prompt = [
    `Selected dataset (authoritative): ${dataset.filename} [${dataset.datasetId}]`,
    state.turn.targetColumn ? `Selected target column (authoritative): ${state.turn.targetColumn}` : null,
    `User request: ${state.turn.prompt ?? 'Continue the training workflow.'}`,
    `Configured experiment: ${asString(experiment.experimentName) ?? 'Unnamed experiment'}`,
    `Model type: ${asString(experiment.modelType) ?? 'unknown'}`,
    `Split strategy: ${asString(experiment.splitStrategy) ?? 'train_test'}`,
    featureColumns.length > 0
      ? `Feature columns: ${featureColumns.join(', ')}`
      : 'Feature columns: use the selected dataset columns, excluding the target column.',
    `Dataset columns: ${dataset.columns.map((column) => `${column.name} (${column.dtype})`).join(', ')}`,
    stderr ? `Previous execution error to repair:\n${stderr}` : null,
    !stderr && stdout ? `Previous execution stdout:\n${stdout.slice(0, 2000)}` : null
  ].filter(Boolean).join('\n');

  const rawCode = await client.complete({
    messages: [
      { role: 'system', content: buildTrainingCodeGenerationSystemPrompt() },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    maxOutputTokens: 5000,
    reasoningEffort: 'low'
  });

  const cleaned = rawCode
    .replace(/^```(?:python)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
  const segments = splitTrainingGeneratedCode(cleaned).slice(0, 4);
  if (segments.length === 0) {
    return [];
  }

  const draftMetadata: TrainingDraftMetadata = {
    draftId: `training-draft-${randomUUID()}`,
    experimentId: asString(experiment.experimentId),
    datasetId: dataset.datasetId,
    datasetFilename: dataset.filename,
    targetColumn: state.turn.targetColumn,
    segmentIndex: 0,
    segments
  };
  const firstSegment = segments[0];

  const parsed = ToolCallSchema.safeParse({
    id: `wf-call-auto-write-training-${draftMetadata.draftId}-0`,
    tool: 'write_cell',
    args: {
      title: firstSegment.title,
      cellType: 'code',
      content: firstSegment.content,
      metadata: {
        phase: 'training',
        source: 'training-lifecycle',
        trainingDraft: draftMetadata
      }
    },
    rationale: 'Write the first generated training code cell.'
  });
  return parsed.success ? [parsed.data] : [];
}

function extractLatestTrainingDraftMetadata(
  state: WorkflowGraphState
): TrainingDraftMetadata | null {
  const currentTurnCalls = state.toolCallHistory.slice(state.turnStartToolCallCount);
  for (let index = currentTurnCalls.length - 1; index >= 0; index -= 1) {
    const call = currentTurnCalls[index];
    if (!['write_cell', 'edit_cell', 'insert_cell'].includes(call.tool)) {
      continue;
    }
    const metadata = asRecord(call.args?.metadata);
    const trainingDraft = asRecord(metadata?.trainingDraft);
    const rawSegments = Array.isArray(trainingDraft?.segments) ? trainingDraft.segments : null;
    if (!trainingDraft || !rawSegments || rawSegments.length === 0) {
      continue;
    }

    const segments = rawSegments
      .map((value) => asRecord(value))
      .filter((value): value is Record<string, unknown> => Boolean(value))
      .map((segment, segmentIndex) => ({
        title: asString(segment.title) ?? `Training Step ${segmentIndex + 1}`,
        content: asString(segment.content) ?? ''
      }))
      .filter((segment) => segment.content.trim().length > 0);
    if (segments.length === 0) {
      continue;
    }

    return {
      draftId: asString(trainingDraft.draftId) ?? `training-draft-${randomUUID()}`,
      experimentId: asString(trainingDraft.experimentId) ?? undefined,
      datasetId: asString(trainingDraft.datasetId) ?? undefined,
      datasetFilename: asString(trainingDraft.datasetFilename) ?? undefined,
      targetColumn: asString(trainingDraft.targetColumn) ?? undefined,
      segmentIndex: typeof trainingDraft.segmentIndex === 'number' ? trainingDraft.segmentIndex : 0,
      segments
    };
  }
  return null;
}

function extractCurrentTurnWriteCellIds(state: WorkflowGraphState): string[] {
  const cellIds: string[] = [];
  const seen = new Set<string>();
  const currentTurnResults = state.toolResultHistory.slice(state.turnStartToolCallCount);
  for (const result of currentTurnResults) {
    if (!['write_cell', 'edit_cell'].includes(result.tool) || result.error) {
      continue;
    }
    const output = getOutputRecord(result);
    if (!output) {
      continue;
    }
    if (typeof output.cellId === 'string') {
      if (!seen.has(output.cellId)) {
        seen.add(output.cellId);
        cellIds.push(output.cellId);
      }
      continue;
    }
    const cell = asRecord(output.cell);
    if (typeof cell?.cellId === 'string') {
      if (!seen.has(cell.cellId)) {
        seen.add(cell.cellId);
        cellIds.push(cell.cellId);
      }
    }
  }
  return cellIds;
}

function extractCurrentTurnRunStatuses(state: WorkflowGraphState): Array<{ status?: string }> {
  return state.toolResultHistory
    .slice(state.turnStartToolCallCount)
    .filter((result) => result.tool === 'run_cell')
    .map((result) => {
      const output = getOutputRecord(result);
      return {
        status: typeof output?.status === 'string' ? output.status : undefined
      };
    });
}

async function buildTrainingWriteCodeAction(
  state: WorkflowGraphState
): Promise<import('../../../types/llm.js').ToolCall[]> {
  const draft = extractLatestTrainingDraftMetadata(state);
  if (!draft || draft.segments.length === 0) {
    return [];
  }

  const currentTurnResults = state.toolResultHistory.slice(state.turnStartToolCallCount);
  const lastNotebookResult = [...currentTurnResults].reverse().find((result) =>
    ['write_cell', 'edit_cell', 'insert_cell', 'run_cell'].includes(result.tool)
  ) ?? null;
  if (isFailedToolResult(lastNotebookResult)) {
    return [];
  }
  if (currentTurnResults.some(isCompletedTrainingRunCell)) {
    return [];
  }
  if (isFailedToolResult(getLastToolResult(currentTurnResults, 'run_cell'))) {
    return [];
  }

  const writtenCellIds = extractCurrentTurnWriteCellIds(state);
  const runStatuses = extractCurrentTurnRunStatuses(state);
  if (writtenCellIds.length > runStatuses.length) {
    const nextCellId = writtenCellIds[runStatuses.length];
    const parsedRun = ToolCallSchema.safeParse({
      id: `wf-call-auto-run-training-${draft.draftId}-${runStatuses.length}`,
      tool: 'run_cell',
      args: { cellId: nextCellId },
      rationale: 'Execute the next generated training code cell.'
    });
    return parsedRun.success ? [parsedRun.data] : [];
  }

  if (writtenCellIds.length >= draft.segments.length) {
    return [];
  }

  const nextIndex = writtenCellIds.length;
  const nextSegment = draft.segments[nextIndex];
  const parsedWrite = ToolCallSchema.safeParse({
    id: `wf-call-auto-write-training-${draft.draftId}-${nextIndex}`,
    tool: 'write_cell',
    args: {
      title: nextSegment.title,
      cellType: 'code',
      content: nextSegment.content,
      metadata: {
        phase: 'training',
        source: 'training-lifecycle',
        trainingDraft: {
          ...draft,
          segmentIndex: nextIndex
        }
      }
    },
    rationale: 'Write the next generated training code cell.'
  });
  return parsedWrite.success ? [parsedWrite.data] : [];
}

function isSuccessfulRunCell(result: import('../../../types/llm.js').ToolResult): boolean {
  if (result.tool !== 'run_cell' || result.error) return false;
  if (!result.output || typeof result.output !== 'object' || Array.isArray(result.output)) return false;
  return (result.output as Record<string, unknown>).status === 'success';
}

function isCompletedTrainingRunCell(result: import('../../../types/llm.js').ToolResult): boolean {
  if (!isSuccessfulRunCell(result)) {
    return false;
  }
  const output = result.output as Record<string, unknown>;
  const stdout = typeof output.stdout === 'string' ? output.stdout : '';
  return stdout.includes('__TRAIN_COMPLETE__|');
}

function parseTrainCompleteMetrics(stdout: string): Record<string, unknown> | null {
  const marker = '__TRAIN_COMPLETE__|';
  const index = stdout.lastIndexOf(marker);
  if (index === -1) {
    return null;
  }
  const candidate = stdout.slice(index + marker.length).split(/\r?\n/, 1)[0]?.trim();
  if (!candidate) {
    return null;
  }
  try {
    const parsed = JSON.parse(candidate) as unknown;
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function getLatestCompletedTrainingRunCell(
  toolResults: import('../../../types/llm.js').ToolResult[]
): import('../../../types/llm.js').ToolResult | null {
  for (let index = toolResults.length - 1; index >= 0; index -= 1) {
    const result = toolResults[index];
    if (isCompletedTrainingRunCell(result)) {
      return result;
    }
  }
  return null;
}

function getLastToolResult(
  toolResults: import('../../../types/llm.js').ToolResult[],
  toolName: string
): import('../../../types/llm.js').ToolResult | null {
  for (let index = toolResults.length - 1; index >= 0; index -= 1) {
    if (toolResults[index]?.tool === toolName) {
      return toolResults[index];
    }
  }
  return null;
}

function getOutputRecord(result: import('../../../types/llm.js').ToolResult | null): Record<string, unknown> | null {
  if (!result?.output || typeof result.output !== 'object' || Array.isArray(result.output)) {
    return null;
  }
  return result.output as Record<string, unknown>;
}

function getToolErrorMessage(result: import('../../../types/llm.js').ToolResult | null): string {
  if (!result) {
    return '';
  }
  if (typeof result.error === 'string' && result.error.trim()) {
    return result.error;
  }
  const output = getOutputRecord(result);
  if (!output) {
    return '';
  }
  if (typeof output.error === 'string' && output.error.trim()) {
    return output.error;
  }
  if (typeof output.errorMessage === 'string' && output.errorMessage.trim()) {
    return output.errorMessage;
  }
  return '';
}

function isFailedToolResult(result: import('../../../types/llm.js').ToolResult | null): boolean {
  if (!result) {
    return false;
  }
  if (result.error) {
    return true;
  }
  const output = getOutputRecord(result);
  if (!output) {
    return false;
  }
  const status = typeof output.status === 'string' ? output.status.toLowerCase() : '';
  return status === 'failed' || status === 'error' || status === 'timeout';
}

async function buildTrainingExecuteAction(
  state: WorkflowGraphState
): Promise<import('../../../types/llm.js').ToolCall[]> {
  const experiment = extractExperimentRecord(state.run, state);
  const experimentId = asString(experiment?.experimentId);
  if (!experimentId) {
    return [];
  }

  const currentTurnResults = state.toolResultHistory.slice(state.turnStartToolCallCount);
  const existingExecute = getLastToolResult(currentTurnResults, 'execute_training');
  if (existingExecute) {
    return [];
  }

  const completedRun = getLatestCompletedTrainingRunCell(currentTurnResults);
  if (!completedRun) {
    return [];
  }

  const output = getOutputRecord(completedRun);
  const stdout = asString(output?.stdout) ?? '';
  const parsedMetrics = parseTrainCompleteMetrics(stdout);
  if (!parsedMetrics) {
    return [];
  }

  const cellIds = extractCurrentTurnWriteCellIds(state);
  const parsed = ToolCallSchema.safeParse({
    id: `wf-call-auto-execute-training-${experimentId}`,
    tool: 'execute_training',
    args: {
      experimentId,
      succeeded: true,
      metrics: parsedMetrics,
      cellIds
    },
    rationale: 'Record successful training execution from the completed notebook run.'
  });
  return parsed.success ? [parsed.data] : [];
}

async function buildTrainingEvaluateAction(
  state: WorkflowGraphState
): Promise<import('../../../types/llm.js').ToolCall[]> {
  const experiment = extractExperimentRecord(state.run, state);
  const experimentId = asString(experiment?.experimentId);
  if (!experimentId) {
    return [];
  }

  const currentTurnResults = state.toolResultHistory.slice(state.turnStartToolCallCount);
  const existingEvaluate = getLastToolResult(currentTurnResults, 'evaluate_results');
  if (existingEvaluate) {
    return [];
  }

  const executeResult = getLastToolResult(currentTurnResults, 'execute_training');
  if (!executeResult || isFailedToolResult(executeResult)) {
    return [];
  }
  const executeOutput = getOutputRecord(executeResult);
  const metrics = asRecord(executeOutput?.metrics) ?? asRecord(experiment?.trainingMetrics);
  if (!metrics || Object.keys(metrics).length === 0) {
    return [];
  }

  const parsed = ToolCallSchema.safeParse({
    id: `wf-call-auto-evaluate-training-${experimentId}`,
    tool: 'evaluate_results',
    args: {
      experimentId,
      metrics
    },
    rationale: 'Promote the recorded training metrics into the evaluation stage.'
  });
  return parsed.success ? [parsed.data] : [];
}

async function buildTrainingRegisterAction(
  state: WorkflowGraphState
): Promise<import('../../../types/llm.js').ToolCall[]> {
  const experiment = extractExperimentRecord(state.run, state);
  const experimentId = asString(experiment?.experimentId);
  if (!experimentId) {
    return [];
  }

  const currentTurnResults = state.toolResultHistory.slice(state.turnStartToolCallCount);
  const existingRegister = getLastToolResult(currentTurnResults, 'register_model');
  if (existingRegister) {
    return [];
  }

  const metrics = asRecord(experiment?.evaluationMetrics) ?? asRecord(experiment?.trainingMetrics);
  if (!metrics || Object.keys(metrics).length === 0) {
    return [];
  }

  const parsed = ToolCallSchema.safeParse({
    id: `wf-call-auto-register-training-${experimentId}`,
    tool: 'register_model',
    args: {
      experimentId,
      modelName: asString(experiment?.experimentName) ?? `model-${experimentId}`,
      modelType: asString(experiment?.modelType) ?? 'unknown',
      metrics,
      hyperparameters: asRecord(experiment?.hyperparameters) ?? {},
      artifactPath: asString(experiment?.artifactPath) ?? 'model.joblib',
      tags: [
        'baseline',
        asString(experiment?.splitStrategy) ?? 'train-test',
        String(asString(experiment?.modelType) ?? 'model').replace(/_/g, '-')
      ]
    },
    rationale: 'Register the successfully evaluated training artifact and metrics.'
  });
  return parsed.success ? [parsed.data] : [];
}

function resolveNextTrainingStage(
  current: string,
  toolResults: import('../../../types/llm.js').ToolResult[]
): string | null {
  if (current === 'execute_training') {
    const lastExecute = getLastToolResult(toolResults, 'execute_training');
    if (!lastExecute) {
      return current;
    }
    if (isFailedToolResult(lastExecute)) {
      return 'generate_code';
    }
    const output = getOutputRecord(lastExecute);
    const status = typeof output?.status === 'string' ? output.status.toLowerCase() : '';
    if (status === 'training' || status === 'success') {
      return 'evaluate_results';
    }
    return current;
  }

  if (current === 'write_code') {
    const lastNotebookFailure = [...toolResults].reverse().find((result) =>
      ['write_cell', 'edit_cell', 'insert_cell', 'run_cell'].includes(result.tool)
      && isFailedToolResult(result)
    ) ?? null;
    if (lastNotebookFailure) {
      return 'generate_code';
    }
    const lastRunCell = getLastToolResult(toolResults, 'run_cell');
    if (isFailedToolResult(lastRunCell)) {
      return 'generate_code';
    }
    const hasCompletedTrainingRun = toolResults.some(isCompletedTrainingRunCell);
    if (!hasCompletedTrainingRun) {
      return current;
    }
  }

  if (current === 'evaluate_results') {
    const lastEvaluate = getLastToolResult(toolResults, 'evaluate_results');
    if (!lastEvaluate || isFailedToolResult(lastEvaluate)) {
      return current;
    }
    return 'register_model';
  }

  if (current === 'register_model') {
    const lastRegister = getLastToolResult(toolResults, 'register_model');
    if (!lastRegister) {
      return current;
    }
    if (isFailedToolResult(lastRegister)) {
      const failure = getToolErrorMessage(lastRegister).toLowerCase();
      if (failure.includes('metric')) {
        return 'evaluate_results';
      }
      if (failure.includes('artifact')) {
        return 'write_code';
      }
      return current;
    }
    const output = getOutputRecord(lastRegister);
    if (typeof output?.modelId === 'string' && output.modelId.trim().length > 0) {
      return 'summarize';
    }
    return current;
  }

  const currentIndex = STAGE_ORDER.indexOf(current);
  if (currentIndex === -1 || currentIndex >= STAGE_ORDER.length - 1) {
    return null;
  }
  return STAGE_ORDER[currentIndex + 1];
}

export const trainingPhaseConfig: PhaseConfig = {
  phase: 'training',
  lifecycle: TRAINING_LIFECYCLE,

  async classifyTurn(): Promise<'answer' | 'action'> {
    return 'action';
  },

  getStageConfig(stage: string, _runtimeContext?: RuntimeContext): StageConfig {
    void _runtimeContext;
    return buildStageConfig(stage);
  },

  buildSystemPrompt(): string {
    return TRAINING_LIFECYCLE_CONTRACT;
  },

  buildUserContext(): Array<{ type: string; text: string }> {
    return [];
  },

  resolveNextStage(
    current: string,
    toolResults: import('../../../types/llm.js').ToolResult[]
  ): string | null {
    return resolveNextTrainingStage(current, toolResults);
  },

  isPhaseSpecificTool(toolName: string): boolean {
    return TRAINING_TOOL_NAME_SET.has(toolName);
  },

  async executePhaseSpecificTool(
    name: string,
    args: unknown,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const handler = TRAINING_TOOL_HANDLERS.get(name);
    if (!handler) {
      return { error: `Unknown training tool: ${name}` };
    }

    return handler(toTrainingToolContext({
      ...ctx,
      args: asRecord(args) ?? {}
    }));
  }
};

registerPhaseConfig(trainingPhaseConfig);
