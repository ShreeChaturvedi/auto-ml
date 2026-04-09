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
  currentNode?: string,
  toolCallHistory?: LlmToolCallHistory[],
  toolResultHistory?: LlmToolResultHistory[]
): string | undefined {
  const currentTurnResults = toolResults ?? [];
  const priorCalls = toolCallHistory ?? [];
  const priorResults = toolResultHistory ?? [];
  const fullHistoryToolNames = new Set([
    ...priorCalls.map((call) => call.name),
    ...priorResults.map((result) => result.name)
  ]);

  // Check if a previous turn already configured + proposed an experiment.
  // If so, this is a CONTINUATION (user approved the plan). Proceed to code.
  const hasPriorConfigure = fullHistoryToolNames.has('configure_experiment');
  const hasPriorPropose = fullHistoryToolNames.has('propose_training_plan');

  const isApprovedContinuationStage = currentNode === 'generate_code'
    || currentNode === 'write_code'
    || currentNode === 'execute_training'
    || currentNode === 'evaluate_results'
    || currentNode === 'register_model';

  if (!currentTurnResults.length && hasPriorConfigure && hasPriorPropose && isApprovedContinuationStage) {
    return 'ACTION REQUIRED: The user approved the training plan from the previous turn. Write the executable training code as 2-4 SMALL notebook cells with `cellType: "code"` using resolve_dataset_path() to load the data. Keep cells separated by purpose: imports/config, dataset prep, model fit/evaluation, artifact save. Run each code cell after writing it. The FINAL training/evaluation cell must print `__TRAIN_COMPLETE__|{json.dumps(final_metrics)}`. Do NOT write markdown plan/summary cells. Do NOT call list_cells or read_cell. Do NOT call configure_experiment or propose_training_plan again — they were already completed.';
  }

  if (!currentTurnResults.length) {
    return 'ACTION REQUIRED: Start by calling configure_experiment for each model the user wants (up to 3 per turn). If the user asks for multiple models, call configure_experiment multiple times BEFORE calling propose_training_plan. Do NOT call list_cells, read_cell, write_cell, or any notebook tools yet — configure experiments first.';
  }

  // Find the most relevant training lifecycle signals
  const lastRunCell = [...currentTurnResults].reverse().find((r) => r.tool === 'run_cell');
  const hasSuccessfulRunCell = lastRunCell && !lastRunCell.error &&
    lastRunCell.output && typeof lastRunCell.output === 'object' && !Array.isArray(lastRunCell.output) &&
    (lastRunCell.output as Record<string, unknown>).status === 'success';

  const lastExecuteTraining = [...currentTurnResults].reverse().find((r) => r.tool === 'execute_training');
  const hasSuccessfulExecute = lastExecuteTraining && !lastExecuteTraining.error &&
    lastExecuteTraining.output && typeof lastExecuteTraining.output === 'object' && !Array.isArray(lastExecuteTraining.output) &&
    (lastExecuteTraining.output as Record<string, unknown>).status === 'training';

  const lastEvalResults = [...currentTurnResults].reverse().find((r) => r.tool === 'evaluate_results');
  const hasEvalResults = lastEvalResults && !lastEvalResults.error;

  const lastRegisterModel = [...currentTurnResults].reverse().find((r) => r.tool === 'register_model');
  const hasRegistered = lastRegisterModel && !lastRegisterModel.error &&
    lastRegisterModel.output && typeof lastRegisterModel.output === 'object' && !Array.isArray(lastRegisterModel.output) &&
    (lastRegisterModel.output as Record<string, unknown>).modelId;

  // Find experimentId from configure_experiment results
  let experimentId: string | undefined;
  for (const r of currentTurnResults) {
    if (r.tool === 'configure_experiment' && !r.error &&
        r.output && typeof r.output === 'object' && !Array.isArray(r.output)) {
      const id = (r.output as Record<string, unknown>).experimentId;
      if (typeof id === 'string') experimentId = id;
    }
  }
  if (!experimentId) {
    for (let index = priorResults.length - 1; index >= 0; index -= 1) {
      const result = priorResults[index];
      if (result.name !== 'configure_experiment') {
        continue;
      }
      const id = result.response?.experimentId;
      if (typeof id === 'string' && id.trim()) {
        experimentId = id;
        break;
      }
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

  const lastLifecycleFailure = [...currentTurnResults].reverse().find((result) => {
    if (!['configure_experiment', 'propose_training_plan', 'execute_training', 'evaluate_results', 'register_model', 'compare_models'].includes(result.tool)) {
      return false;
    }
    if (typeof result.error === 'string' && result.error.trim()) {
      return true;
    }
    if (!result.output || typeof result.output !== 'object' || Array.isArray(result.output)) {
      return false;
    }
    const output = result.output as Record<string, unknown>;
    return typeof output.error === 'string' && output.error.trim().length > 0;
  });
  const lifecycleFailureMessage = (() => {
    if (!lastLifecycleFailure) {
      return '';
    }
    if (typeof lastLifecycleFailure.error === 'string' && lastLifecycleFailure.error.trim()) {
      return lastLifecycleFailure.error.toLowerCase();
    }
    if (lastLifecycleFailure.output && typeof lastLifecycleFailure.output === 'object' && !Array.isArray(lastLifecycleFailure.output)) {
      const output = lastLifecycleFailure.output as Record<string, unknown>;
      if (typeof output.error === 'string' && output.error.trim()) {
        return output.error.toLowerCase();
      }
    }
    return '';
  })();

  if (lifecycleFailureMessage.includes('experiment') && lifecycleFailureMessage.includes('not found')) {
    return 'ACTION REQUIRED: The previous tool call used the wrong experiment identifier. Call configure_experiment now for this request if it has not been configured in this turn. After configure_experiment succeeds, call propose_training_plan and stop for approval. Do NOT compare models or validate results yet.';
  }

  if (lifecycleFailureMessage.includes('evaluate_results requires non-empty numeric metrics') && experimentId) {
    return `ACTION REQUIRED: Call evaluate_results now with experimentId="${experimentId}". Use the numeric metrics already produced by training (RMSE/MAE/R2 or accuracy/F1) instead of comparing models. Do NOT call compare_models unless multiple experiments were actually evaluated.`;
  }

  const lastNotebookFailure = [...currentTurnResults].reverse().find((result) => {
    if (!['write_cell', 'insert_cell', 'edit_cell', 'run_cell'].includes(result.tool)) {
      return false;
    }
    if (typeof result.error === 'string' && result.error.trim()) {
      return true;
    }
    if (!result.output || typeof result.output !== 'object' || Array.isArray(result.output)) {
      return false;
    }
    const output = result.output as Record<string, unknown>;
    return typeof output.error === 'string' && output.error.trim().length > 0;
  });
  const notebookFailureMessage = (() => {
    if (!lastNotebookFailure) {
      return '';
    }
    if (typeof lastNotebookFailure.error === 'string' && lastNotebookFailure.error.trim()) {
      return lastNotebookFailure.error.toLowerCase();
    }
    if (lastNotebookFailure.output && typeof lastNotebookFailure.output === 'object' && !Array.isArray(lastNotebookFailure.output)) {
      const output = lastNotebookFailure.output as Record<string, unknown>;
      if (typeof output.error === 'string' && output.error.trim()) {
        return output.error.toLowerCase();
      }
    }
    return '';
  })();

  if (notebookFailureMessage.includes('markdown cells are not allowed')) {
    return 'ACTION REQUIRED: Repair the notebook by writing ONLY executable code cells. Write the NEXT cell as a SMALL code cell for one step only (imports/config first, then dataset prep, then model fit/evaluation, then artifact save). Do NOT write markdown or summaries. Do NOT call list_cells or read_cell.';
  }

  if (notebookFailureMessage.includes('too large') || notebookFailureMessage.includes('too long')) {
    return 'ACTION REQUIRED: The previous training cell was too large. Split the workflow into SMALL code cells. Write ONLY the next code cell for a single step, not the entire training script. Start with imports/config or dataset prep. Do NOT write markdown. Do NOT call list_cells or read_cell.';
  }

  if (
    notebookFailureMessage.includes('dtypepromotionerror')
    || (notebookFailureMessage.includes('datetime64') && notebookFailureMessage.includes('promoted'))
    || (notebookFailureMessage.includes('datetime64') && notebookFailureMessage.includes('median'))
    || (notebookFailureMessage.includes('datetime') && notebookFailureMessage.includes('imputer'))
  ) {
    return 'ACTION REQUIRED: Repair the failed code cell so raw datetime columns never enter numeric preprocessing. If you parsed DATE with pd.to_datetime(), either convert it to numeric/ordinal values, derive date parts, or drop the raw datetime column before building numeric_features. Prefer existing numeric date features like date_month/date_year when they are already available. Rewrite only the next SMALL code cell needed for that repair, then continue the staged training workflow.';
  }

  if (notebookFailureMessage.includes('selected dataset')) {
    return 'ACTION REQUIRED: Rewrite the next code cell using the UI-selected dataset from the context block. Use resolve_dataset_path() with the selected dataset filename/datasetId exactly as provided. Do NOT use a different dataset name from the prompt text.';
  }

  if (notebookFailureMessage.includes('selected target column')) {
    return 'ACTION REQUIRED: Rewrite the next code cell using the UI-selected target column from the context block. The selected target is authoritative for this turn, even if the prompt text mentioned another target.';
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

  const hasConfigured = currentTurnResults.some(
    (r) => r.tool === 'configure_experiment' && !r.error
  );
  const hasProposed = currentTurnResults.some(
    (r) => r.tool === 'propose_training_plan' && !r.error
  );
  // NOTE: No directive needed after proposal. propose_training_plan returns
  // status='awaiting_approval' which triggers the existing pause mechanism
  // in toolExecutor.ts. The turn ends deterministically — no LLM call needed.
  // The user sees the proposal via StepProposalCard and sends a follow-up.

  if (currentNode === 'propose_model' && hasConfigured && !hasProposed) {
    return 'ACTION REQUIRED: One or more experiments are already configured in this turn. Call propose_training_plan NOW for a configured experiment and stop for approval. Do NOT write training code yet. Do NOT continue with advisory text only.';
  }

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
  const hasAnyLifecycleTool = currentTurnResults.some(
    (r) => ['configure_experiment', 'propose_training_plan', 'execute_training', 'evaluate_results', 'register_model'].includes(r.tool)
  );
  if (!hasAnyLifecycleTool && hasPriorConfigure && hasPriorPropose) {
    return 'ACTION REQUIRED: A training experiment is already configured and approved. Continue the multi-cell notebook workflow. If you have not yet written the next executable code cell, write it now with `cellType: "code"`. If the next code cell is already written, call run_cell on it now. Only the FINAL training/evaluation cell should print `__TRAIN_COMPLETE__|{json.dumps(final_metrics)}`. Do NOT write markdown plan/summary cells. Do NOT call list_cells or read_cell. Do NOT call configure_experiment again.';
  }
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
  currentNode?: string;
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
    currentNode,
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
    '[Selected workflow controls: the dataset and target listed below come from the Training tab controls for this turn.]',
    `[Context - Available dataset: "${dataset.filename}" (${dataset.nRows} rows, ${dataset.nCols} columns)]`,
    targetColumn ? `[Target column: ${targetColumn}]` : null,
    `[Selected training controls: dataset "${dataset.filename}"${targetColumn ? ` and target "${targetColumn}"` : ''}.]`,
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
  const continuationDirective = buildTrainingContinuationDirective(
    toolResults,
    currentNode,
    toolCallHistory,
    toolResultHistory
  );

  // User prompt is the PRIMARY content
  const userContent = [
    contextParts.join('\n'),
    '',
    prompt ?? 'Continue the training workflow.',
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
