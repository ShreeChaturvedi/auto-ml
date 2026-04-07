/**
 * Training workflow prompt builder.
 */

import type { DatasetProfile } from '../../../types/dataset.js';
import type { ToolResult } from '../../../types/llm.js';
import type { FeatureSpec } from '../../featureEngineering.js';
import { buildTemplateSummary } from '../../modelTemplates.js';
import type {
  LlmRequest,
  LlmToolDefinition,
  LlmToolCallHistory,
  LlmToolResultHistory
} from '../llmClient.js';
import type { LlmReasoningEffort } from '../modelCatalog.js';
import { LLM_ALL_TOOLS } from '../toolRegistry.js';

import { buildSystemPrompt } from './system.js';

const MAX_FEATURE_DISPLAY = 20;

function formatFeatureContext(specs: FeatureSpec[]): string {
  const display = specs.slice(0, MAX_FEATURE_DISPLAY);
  const lines = display.map((f) => {
    const args = f.secondaryColumn
      ? `("${f.sourceColumn}", "${f.secondaryColumn}")`
      : `("${f.sourceColumn}")`;
    const desc = f.description ? ` — ${f.description}` : '';
    return `- "${f.featureName}": ${f.method}${args}${desc}`;
  });
  const overflow = specs.length - display.length;
  if (overflow > 0) {
    lines.push(`  +${overflow} more`);
  }
  return `[Feature engineering pipeline (${specs.length} approved features):\n${lines.join('\n')}]`;
}

/**
 * Build a continuation directive for the training lifecycle — the training
 * equivalent of FE's `buildContinuationDirective` in featureWorkflow.ts.
 *
 * Without this, the LLM consistently prefers notebook tools (read_cell,
 * list_cells) over training-specific lifecycle tools (execute_training,
 * evaluate_results, register_model) even when the run_cell has succeeded
 * and the metrics are in stdout. The continuation directive makes the
 * next required tool call explicit and imperative, prefixed with
 * ACTION REQUIRED so the model doesn't treat it as a suggestion.
 */
function buildTrainingContinuationDirective(
  toolResults: ToolResult[] | undefined,
  toolCallHistory?: LlmToolCallHistory[]
): string | undefined {
  // Check if a previous turn already configured + proposed an experiment.
  // If so, this is a CONTINUATION (user approved the plan). Proceed to code.
  const priorHistory = toolCallHistory ?? [];
  const hasPriorConfigure = priorHistory.some((h) => h.name === 'configure_experiment');
  const hasPriorPropose = priorHistory.some((h) => h.name === 'propose_training_plan');

  if (!toolResults?.length && hasPriorConfigure && hasPriorPropose) {
    return 'ACTION REQUIRED: The user approved the training plan from the previous turn. Write the training code in a notebook cell using resolve_dataset_path() to load the data, then run it with run_cell. Do NOT call configure_experiment or propose_training_plan again — they were already completed.';
  }

  if (!toolResults?.length) {
    return 'ACTION REQUIRED: Start by calling configure_experiment for each model the user wants (up to 3 per turn). If the user asks for multiple models, call configure_experiment multiple times BEFORE calling propose_training_plan. Do NOT write any code cells yet.';
  }

  // Find the most relevant training lifecycle signals
  const lastRunCell = [...(toolResults ?? [])].reverse().find((r) => r.tool === 'run_cell');
  const hasSuccessfulRunCell = lastRunCell && !lastRunCell.error &&
    lastRunCell.output && typeof lastRunCell.output === 'object' && !Array.isArray(lastRunCell.output) &&
    (lastRunCell.output as Record<string, unknown>).status === 'success';

  const lastExecuteTraining = [...(toolResults ?? [])].reverse().find((r) => r.tool === 'execute_training');
  const hasSuccessfulExecute = lastExecuteTraining && !lastExecuteTraining.error &&
    lastExecuteTraining.output && typeof lastExecuteTraining.output === 'object' && !Array.isArray(lastExecuteTraining.output) &&
    (lastExecuteTraining.output as Record<string, unknown>).status === 'training';

  const lastEvalResults = [...(toolResults ?? [])].reverse().find((r) => r.tool === 'evaluate_results');
  const hasEvalResults = lastEvalResults && !lastEvalResults.error;

  const lastRegisterModel = [...(toolResults ?? [])].reverse().find((r) => r.tool === 'register_model');
  const hasRegistered = lastRegisterModel && !lastRegisterModel.error &&
    lastRegisterModel.output && typeof lastRegisterModel.output === 'object' && !Array.isArray(lastRegisterModel.output) &&
    (lastRegisterModel.output as Record<string, unknown>).modelId;

  // Find experimentId from configure_experiment results
  let experimentId: string | undefined;
  for (const r of toolResults) {
    if (r.tool === 'configure_experiment' && !r.error &&
        r.output && typeof r.output === 'object' && !Array.isArray(r.output)) {
      const id = (r.output as Record<string, unknown>).experimentId;
      if (typeof id === 'string') experimentId = id;
    }
  }

  if (hasRegistered) {
    // register_model is now detected as terminal in phaseRequestBuilder.ts,
    // so this branch is normally unreachable. Return a neutral message (no
    // render_ui instruction) as a safety net — avoids the invisible-token
    // failure mode where toolChoice='any' + render_ui directive produced
    // empty LLM output with gpt-5.4.
    return undefined;
  }

  if (hasEvalResults && experimentId) {
    // Do NOT force register_model here — the LLM needs to write a joblib.dump
    // cell and run it BEFORE calling register_model. Use a non-forced directive
    // (no "Call register_model" at sentence start) so extractForcedToolFromDirective
    // returns undefined and toolChoice stays at 'any'.
    return `ACTION REQUIRED: The model has been evaluated. Now save it: write a cell with \`import joblib; joblib.dump(model, "model.joblib")\` and run it with run_cell. After the save cell succeeds, call register_model with experimentId="${experimentId}", artifactPath="model.joblib". Do NOT call read_cell or list_cells.`;
  }

  if (hasSuccessfulExecute && experimentId) {
    return `ACTION REQUIRED: Call evaluate_results now with experimentId="${experimentId}" and the metrics from the training output. Do NOT call read_cell or list_cells — the metrics are already in the execute_training result.`;
  }

  if (hasSuccessfulRunCell && experimentId) {
    return `ACTION REQUIRED: The training code ran successfully. Call execute_training NOW with experimentId="${experimentId}", succeeded=true, and the metrics parsed from run_cell stdout. Do NOT call read_cell or list_cells — the metrics are in the run_cell result. Do NOT write more cells.`;
  }

  if (hasSuccessfulRunCell && !experimentId) {
    return 'ACTION REQUIRED: Training code ran successfully but no experiment is configured. Call configure_experiment first, then execute_training.';
  }

  const hasConfigured = toolResults.some(
    (r) => r.tool === 'configure_experiment' && !r.error
  );
  // NOTE: No directive needed after proposal. propose_training_plan returns
  // status='awaiting_approval' which triggers the existing pause mechanism
  // in toolExecutor.ts. The turn ends deterministically — no LLM call needed.
  // The user sees the proposal via StepProposalCard and sends a follow-up.

  if (hasConfigured) {
    // Return undefined so toolChoice stays at 'auto' (not 'any'). This lets
    // the LLM follow the user's intent — if they asked for 3 models, the LLM
    // can call configure_experiment multiple times before proposing. A
    // directive here would force toolChoice='any' which biases the LLM toward
    // the first tool mentioned and overrides the user's multi-model request.
    return undefined;
  }

  // Fallback: no lifecycle tools have been called yet (LLM has been
  // calling notebook tools without starting the lifecycle). Redirect it.
  const hasAnyLifecycleTool = toolResults.some(
    (r) => ['configure_experiment', 'propose_training_plan', 'execute_training', 'evaluate_results', 'register_model'].includes(r.tool)
  );
  if (!hasAnyLifecycleTool) {
    return 'ACTION REQUIRED: No training experiment is configured yet. Call configure_experiment first to set up the experiment parameters before writing any more code. Do NOT call read_cell or list_cells.';
  }

  return undefined;
}

export function buildTrainingRequest(params: {
  dataset: DatasetProfile;
  targetColumn?: string;
  prompt?: string;
  projectPlan?: string;
  ragSnippets?: Array<{ filename: string; snippet: string }>;
  toolResults?: ToolResult[];
  featureSummary?: string;
  featureSpecs?: FeatureSpec[];
  toolCallHistory?: LlmToolCallHistory[];
  toolResultHistory?: LlmToolResultHistory[];
  toolDefinitions?: LlmToolDefinition[];
  reasoningEffort?: LlmReasoningEffort;
}): LlmRequest {
  const {
    dataset,
    targetColumn,
    prompt,
    projectPlan,
    ragSnippets,
    toolResults,
    featureSummary,
    featureSpecs,
    toolCallHistory,
    toolResultHistory,
    toolDefinitions,
    reasoningEffort
  } = params;
  const tools = toolDefinitions ?? LLM_ALL_TOOLS;
  const systemPrompt = projectPlan?.trim()
    ? `${buildSystemPrompt()}\n\n## Project Plan (approved by user)\n${projectPlan}\n\nFollow this plan closely. It represents the user's approved approach.`
    : buildSystemPrompt();

  // Build context block that is INFORMATIONAL, not instructional
  const contextParts = [
    `[Context - Available dataset: "${dataset.filename}" (${dataset.nRows} rows, ${dataset.nCols} columns)]`,
    targetColumn ? `[Target column: ${targetColumn}]` : null,
    `[Columns: ${dataset.columns.map((column) => `${column.name} (${column.dtype})`).join(', ')}]`,
    `[Dataset access: use resolve_dataset_path("${dataset.filename}", "${dataset.datasetId}") when writing Python code. This returns the correct filesystem path inside the execution sandbox. Do NOT use pd.read_csv with a guessed path — the sandbox path is not /mnt/data or /workspace.]`,
    featureSpecs?.length
      ? formatFeatureContext(featureSpecs)
      : featureSummary ? `[Feature engineering applied: ${featureSummary}]` : null,
    ragSnippets?.length
      ? `[Relevant docs:\n${ragSnippets.map((doc) => `- ${doc.filename}: ${doc.snippet.slice(0, 200)}`).join('\n')}]`
      : null,
    toolResults?.length
      ? `[Previous tool results: ${toolResults.map((r) => `${r.tool}: ${r.error ?? 'success'}`).join(', ')}]`
      : null,
    buildTemplateSummary()
  ].filter(Boolean);

  // Build continuation directive from tool result history (same pattern
  // as FE's buildContinuationDirective in featureWorkflow.ts). This tells
  // the LLM explicitly which lifecycle tool to call next, preventing it
  // from defaulting to read_cell/list_cells loops.
  const continuationDirective = buildTrainingContinuationDirective(toolResults, toolCallHistory);

  // User prompt is the PRIMARY content
  const userContent = [
    prompt ?? 'Continue the training workflow.',
    '',
    contextParts.join('\n'),
    continuationDirective ? `\nCONTINUATION: ${continuationDirective}` : null
  ].filter(Boolean).join('\n');

  // Match FE's pattern exactly (featureWorkflow.ts:335):
  // - 'any' when directive exists: forces the LLM to call SOME tool (can't
  //   exit with text only), but the directive text guides which tool.
  // - 'auto' otherwise: LLM is free to respond with text or tool calls.
  //
  // NEVER use { function: 'specific_tool' }. FE doesn't, and it works
  // reliably. The previous extractForcedToolFromDirective approach caused
  // configure_experiment loops, register_model loops, and render_ui loops
  // because the regex-based extraction was fragile and matched negative
  // contexts like "Do NOT call X".
  const effectiveToolChoice = continuationDirective ? 'any' as const : 'auto' as const;

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    temperature: 0.4,
    // Reasoning models need output budget for thinking + rich JSON responses.
    // 4096 is too small when the model generates code cells + evaluation tables.
    maxOutputTokens: 12000,
    tools,
    toolChoice: effectiveToolChoice,
    toolCallHistory,
    toolResultHistory,
    reasoningEffort,
    contextId: dataset.projectId ?? dataset.datasetId
  };
}
