import { randomUUID } from 'node:crypto';

import { env } from '../../../config.js';
import { createDatasetRepository } from '../../../repositories/datasetRepository.js';
import { ToolCallSchema } from '../../../types/llm.js';
import { asRecord, asString } from '../../../utils/typeCoercion.js';
import type { LlmClient, LlmToolDefinition } from '../../llm/llmClient.js';
import { TRAINING_LIFECYCLE_CONTRACT } from '../../llm/prompts/trainingContract.js';
import { LLM_ALL_TOOLS, LLM_TRAINING_LIFECYCLE_TOOLS } from '../../llm/tools/index.js';
import { TRAINING_TOOL_NAMES } from '../../llm/tools/trainingTools.js';
import { TRAINING_TOOL_HANDLERS } from '../../llm/trainingTools/index.js';
import { formatTargetProfileForPrompt } from '../../llm/trainingTools/registrationTools.js';
import { toTrainingToolContext } from '../../llm/trainingTools/types.js';
import {
  extractWorkflowPrepSegmentsFromSegments,
  normalizeWorkflowPrepSegments,
} from '../../llm/trainingTools/workflowPrepSegments.js';
import {
  extractSuccessfulRuntimeDependenciesFromHistory,
  hasRuntimeDependency,
  extractMissingModuleName,
  inferRuntimeDependenciesFromModelType,
  inferSpecificModelType,
  resolvePackageRequirementForMissingModule,
} from '../../runtimeDependencies.js';
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
import { selectTrainingExecutionExperiment } from '../trainingExperimentSelection.js';

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
  generate_code: [...TRAINING_EXECUTION_NOTEBOOK_TOOLS, 'install_package'],
  write_code: [...TRAINING_EXECUTION_NOTEBOOK_TOOLS, 'install_package'],
  execute_training: ['execute_training'],
  evaluate_results: ['evaluate_results'],
  await_review: ['register_model'],
  register_model: ['register_model'],
  summarize: []
};
const TOOL_BY_NAME = new Map(
  ([...LLM_TRAINING_LIFECYCLE_TOOLS, ...LLM_ALL_TOOLS] as LlmToolDefinition[]).map((tool) => [tool.name, tool])
);
const datasetRepository = createDatasetRepository(env.datasetMetadataPath);

const MAX_TRAINING_REPAIR_ATTEMPTS = 3;

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

interface TrainingDraftNotebookActivity {
  notebookResults: import('../../../types/llm.js').ToolResult[];
  runResults: import('../../../types/llm.js').ToolResult[];
  writtenCellIds: string[];
}

const TRAINING_MODEL_INFERENCE_PATTERNS: Array<{ pattern: RegExp; modelType: string }> = [
  { pattern: /\bTabTransformerConfig\b/i, modelType: 'tabtransformer' },
  { pattern: /\bFTTransformerConfig\b/i, modelType: 'fttransformer' },
  { pattern: /\bTabNet(?:Classifier|Regressor)\b|\bfrom\s+pytorch_tabnet\b|\bimport\s+pytorch_tabnet\b/i, modelType: 'tabnet' },
  { pattern: /\bCatBoost(?:Classifier|Regressor)\b|\bfrom\s+catboost\s+import\b|\bimport\s+catboost\b/i, modelType: 'catboost' },
  { pattern: /\bXGB(?:Classifier|Regressor)\b|\bfrom\s+xgboost\s+import\b|\bimport\s+xgboost\b/i, modelType: 'xgboost' },
  { pattern: /\bLGBM(?:Classifier|Regressor)\b|\bfrom\s+lightgbm\s+import\b|\bimport\s+lightgbm\b/i, modelType: 'lightgbm' },
  { pattern: /\bProphet\b|\bfrom\s+prophet\s+import\b|\bimport\s+prophet\b/i, modelType: 'prophet' },
  { pattern: /\bSARIMAX\b|\bARIMA\b|\bfrom\s+statsmodels\b|\bimport\s+statsmodels\b/i, modelType: 'statsmodels' },
];

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
  if (state) {
    const selected = selectTrainingExecutionExperiment(run, state, activeExperimentId);
    if (selected) {
      return selected;
    }
  }

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

interface TrainingMissingDependencyRecovery {
  moduleName: string;
  packageName: string;
  failedCellId: string | null;
  installAttemptedAfterFailure: boolean;
  installSucceededAfterFailure: boolean;
  installFailedAfterFailure: boolean;
  rerunSucceededAfterInstall: boolean;
  hadSuccessfulInstallEarlierInTurn: boolean;
}

function normalizePythonForDependencyChecks(code: string): string {
  return code.replace(/\s+/g, ' ').trim();
}

function containsInlinePackageInstall(code: string): boolean {
  const normalized = normalizePythonForDependencyChecks(code);
  return /pip\s+install/i.test(normalized)
    || /subprocess\.(check_call|run|Popen)\([^)]*pip/i.test(normalized)
    || /sys\.executable[^)]*-m[^)]*pip/i.test(normalized);
}

function getRequiredTrainingRuntimeDependencies(modelType: string | undefined): string[] {
  return inferRuntimeDependenciesFromModelType(modelType);
}

function getInstalledTrainingRuntimeDependencies(state: WorkflowGraphState): string[] {
  const currentTurnCalls = state.toolCallHistory.slice(state.turnStartToolCallCount);
  const currentTurnResults = state.toolResultHistory.slice(state.turnStartToolCallCount);
  return extractSuccessfulRuntimeDependenciesFromHistory(currentTurnCalls, currentTurnResults);
}

function getCurrentTurnCallResultPairs(state: WorkflowGraphState): Array<{
  call?: WorkflowGraphState['toolCallHistory'][number];
  result?: WorkflowGraphState['toolResultHistory'][number];
}> {
  const calls = state.toolCallHistory.slice(state.turnStartToolCallCount);
  const results = state.toolResultHistory.slice(state.turnStartToolCallCount);
  const pairCount = Math.max(calls.length, results.length);
  return Array.from({ length: pairCount }, (_, index) => ({
    call: calls[index],
    result: results[index],
  }));
}

function getTrainingMissingDependencyRecovery(
  state: WorkflowGraphState,
): TrainingMissingDependencyRecovery | null {
  const currentTurnPairs = getCurrentTurnCallResultPairs(state);
  let failureIndex = -1;
  let failedCellId: string | null = null;
  let packageName: string | null = null;
  let moduleName: string | null = null;

  for (let index = currentTurnPairs.length - 1; index >= 0; index -= 1) {
    const { call, result } = currentTurnPairs[index];
    if (!result || !['run_cell', 'write_cell', 'edit_cell', 'insert_cell'].includes(result.tool)) {
      continue;
    }
    const errorMessage = getToolErrorMessage(result);
    const missingModuleName = extractMissingModuleName(errorMessage);
    const resolvedPackage = resolvePackageRequirementForMissingModule(missingModuleName ?? undefined);
    if (!missingModuleName || !resolvedPackage) {
      continue;
    }

    const output = getOutputRecord(result);
    failureIndex = index;
    moduleName = missingModuleName;
    packageName = resolvedPackage;
    failedCellId = asString(output?.cellId) ?? asString(asRecord(call?.args)?.cellId) ?? null;
    break;
  }

  if (failureIndex === -1 || !moduleName || !packageName) {
    return null;
  }

  let installAttemptedAfterFailure = false;
  let installSucceededAfterFailure = false;
  let installFailedAfterFailure = false;
  let rerunSucceededAfterInstall = false;
  let hadSuccessfulInstallEarlierInTurn = false;
  let successfulInstallIndexAfterFailure = -1;

  for (let index = 0; index < currentTurnPairs.length; index += 1) {
    const { call, result } = currentTurnPairs[index];
    if (!call || call.tool !== 'install_package') {
      continue;
    }
    const requestedPackage = resolvePackageRequirementForMissingModule(asString(asRecord(call.args)?.packageName));
    if (requestedPackage !== packageName) {
      continue;
    }

    const output = getOutputRecord(result ?? null);
    const succeeded = result?.error == null && output?.success === true;
    const failed = Boolean(result?.error) || output?.success === false;

    if (index > failureIndex) {
      installAttemptedAfterFailure = true;
      if (succeeded && successfulInstallIndexAfterFailure === -1) {
        successfulInstallIndexAfterFailure = index;
      }
      installSucceededAfterFailure = installSucceededAfterFailure || succeeded;
      installFailedAfterFailure = installFailedAfterFailure || failed;
    } else if (succeeded) {
      hadSuccessfulInstallEarlierInTurn = true;
    }
  }

  if (successfulInstallIndexAfterFailure !== -1 && failedCellId) {
    for (let index = successfulInstallIndexAfterFailure + 1; index < currentTurnPairs.length; index += 1) {
      const { call, result } = currentTurnPairs[index];
      if (!call || call.tool !== 'run_cell' || asString(asRecord(call.args)?.cellId) !== failedCellId) {
        continue;
      }
      if (result && isSuccessfulRunCell(result)) {
        rerunSucceededAfterInstall = true;
        break;
      }
    }
  }

  return {
    moduleName,
    packageName,
    failedCellId,
    installAttemptedAfterFailure,
    installSucceededAfterFailure,
    installFailedAfterFailure,
    rerunSucceededAfterInstall,
    hadSuccessfulInstallEarlierInTurn,
  };
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

function sanitizeGeneratedPython(rawCode: string): string {
  return rawCode
    .replace(/^```(?:python)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
}

type TrainingEstimatorRule = {
  pattern: RegExp;
  description: string;
};

function getSpecificTrainingEstimatorRule(
  modelType: string | undefined,
  taskType: string | undefined,
): TrainingEstimatorRule | null {
  const canonical = inferSpecificModelType(modelType);
  switch (canonical) {
    case 'random_forest_classifier':
      return { pattern: /\bRandomForestClassifier\b/, description: 'RandomForestClassifier' };
    case 'random_forest_regressor':
      return { pattern: /\bRandomForestRegressor\b/, description: 'RandomForestRegressor' };
    case 'random_forest':
      return taskType === 'classification'
        ? { pattern: /\bRandomForestClassifier\b/, description: 'RandomForestClassifier' }
        : { pattern: /\bRandomForestRegressor\b/, description: 'RandomForestRegressor' };
    case 'gradient_boosting_classifier':
      return { pattern: /\bGradientBoostingClassifier\b/, description: 'GradientBoostingClassifier' };
    case 'gradient_boosting_regressor':
      return { pattern: /\bGradientBoostingRegressor\b/, description: 'GradientBoostingRegressor' };
    case 'gradient_boosting':
      return taskType === 'classification'
        ? { pattern: /\bGradientBoostingClassifier\b/, description: 'GradientBoostingClassifier' }
        : { pattern: /\bGradientBoostingRegressor\b/, description: 'GradientBoostingRegressor' };
    case 'decision_tree_classifier':
      return { pattern: /\bDecisionTreeClassifier\b/, description: 'DecisionTreeClassifier' };
    case 'decision_tree_regressor':
      return { pattern: /\bDecisionTreeRegressor\b/, description: 'DecisionTreeRegressor' };
    case 'decision_tree':
      return taskType === 'classification'
        ? { pattern: /\bDecisionTreeClassifier\b/, description: 'DecisionTreeClassifier' }
        : { pattern: /\bDecisionTreeRegressor\b/, description: 'DecisionTreeRegressor' };
    case 'knn_classifier':
      return { pattern: /\bKNeighborsClassifier\b/, description: 'KNeighborsClassifier' };
    case 'knn_regressor':
      return { pattern: /\bKNeighborsRegressor\b/, description: 'KNeighborsRegressor' };
    case 'knn':
      return taskType === 'classification'
        ? { pattern: /\bKNeighborsClassifier\b/, description: 'KNeighborsClassifier' }
        : { pattern: /\bKNeighborsRegressor\b/, description: 'KNeighborsRegressor' };
    case 'logistic_regression':
      return { pattern: /\bLogisticRegression\b/, description: 'LogisticRegression' };
    case 'linear_regression':
      return { pattern: /\bLinearRegression\b/, description: 'LinearRegression' };
    case 'ridge':
      return { pattern: /\bRidge\b/, description: 'Ridge' };
    case 'lasso':
      return { pattern: /\bLasso\b/, description: 'Lasso' };
    case 'elasticnet':
      return { pattern: /\bElasticNet\b/, description: 'ElasticNet' };
    case 'mlp_classifier':
      return { pattern: /\bMLPClassifier\b/, description: 'MLPClassifier' };
    case 'mlp_regressor':
      return { pattern: /\bMLPRegressor\b/, description: 'MLPRegressor' };
    case 'mlp':
      return taskType === 'classification'
        ? { pattern: /\bMLPClassifier\b/, description: 'MLPClassifier' }
        : { pattern: /\bMLPRegressor\b/, description: 'MLPRegressor' };
    case 'svr':
      return { pattern: /\bSVR\b/, description: 'SVR' };
    case 'svc':
      return { pattern: /\b(?:LinearSVC|SVC)\b/, description: 'SVC or LinearSVC' };
    case 'kmeans':
      return { pattern: /\bKMeans\b/, description: 'KMeans' };
    case 'lightgbm':
      return {
        pattern: /\bLGBM(?:Classifier|Regressor)\b|\bfrom\s+lightgbm\s+import\b|\bimport\s+lightgbm\b/i,
        description: 'LightGBM (LGBMClassifier/LGBMRegressor)',
      };
    case 'xgboost':
      return {
        pattern: /\bXGB(?:Classifier|Regressor)\b|\bfrom\s+xgboost\s+import\b|\bimport\s+xgboost\b/i,
        description: 'XGBoost (XGBClassifier/XGBRegressor)',
      };
    case 'catboost':
      return {
        pattern: /\bCatBoost(?:Classifier|Regressor)\b|\bfrom\s+catboost\s+import\b|\bimport\s+catboost\b/i,
        description: 'CatBoost (CatBoostClassifier/CatBoostRegressor)',
      };
    default:
      return null;
  }
}

function getSpecificTrainingModelGuidance(modelType: string | undefined): string | null {
  const TRANSFORMER_CPU_BUDGET_RULES = [
    'Runtime is CPU-only and the cell must finish in under 10 minutes.',
    'SUBSAMPLE the training DataFrame before fit when it exceeds 5000 rows: `if len(train_df) > 5000: train_df = train_df.sample(n=5000, random_state=42)`. Keep the full test set for evaluation.',
    'TrainerConfig: max_epochs=2, batch_size=1024, early_stopping=None, early_stopping_patience=0, checkpoints=None, progress_bar="none", accelerator="cpu". Do NOT pass `trainer_kwargs={"logger": ...}` or `trainer_kwargs={"enable_progress_bar": ...}` — those keys collide with pytorch_tabular\'s internal pl.Trainer call (tabular_model.py ~L359) and raise `TypeError: got multiple values for keyword argument`. Leave `trainer_kwargs={}`.',
    'DataConfig: validation_split=0.15 (small single pass).',
    'Architecture (compact for CPU): input_embed_dim=16, num_attn_blocks=1, num_heads=2, ff_hidden_multiplier=2, attn_feature_importance=False.',
    'Cast integer continuous columns to float64 before fitting: `df[continuous_cols] = df[continuous_cols].astype("float64")`.',
    'Use TabularModel `verbose=False` in its constructor.',
    'ARTIFACT SAVE (MANDATORY): the fitted TabularModel MUST be saved with `joblib.dump(model, "model.joblib")` in the final cell, BEFORE printing the __TRAIN_COMPLETE__ marker. TabularModel is picklable via joblib on this runtime. Do NOT skip this step — register_model fails with ENOENT otherwise.',
  ].join(' ');

  switch (inferSpecificModelType(modelType)) {
    case 'tabtransformer':
      return 'Implement a real TabTransformer using pytorch_tabular. REQUIRED IMPORTS (use exactly these module paths; other paths do not exist): `from pytorch_tabular import TabularModel`, `from pytorch_tabular.config import DataConfig, TrainerConfig, OptimizerConfig`, `from pytorch_tabular.models import TabTransformerConfig`. Do not import from `pytorch_tabular.models.tab_transformer.config` (that path does not exist). Do not use sklearn MLPClassifier or MLPRegressor as a proxy. '
        + TRANSFORMER_CPU_BUDGET_RULES;
    case 'fttransformer':
      return 'Implement a real FT-Transformer using pytorch_tabular. REQUIRED IMPORTS (use exactly these module paths; other paths do not exist): `from pytorch_tabular import TabularModel`, `from pytorch_tabular.config import DataConfig, TrainerConfig, OptimizerConfig`, `from pytorch_tabular.models import FTTransformerConfig`. Do not import from `pytorch_tabular.models.ft_transformer.config` (that path does not exist). Do not use sklearn MLPClassifier or MLPRegressor as a proxy. '
        + TRANSFORMER_CPU_BUDGET_RULES;
    case 'tabnet':
      return 'Implement a real TabNet model using pytorch_tabnet. REQUIRED IMPORTS: `from pytorch_tabnet.tab_model import TabNetClassifier, TabNetRegressor`. Handle categorical columns explicitly (pass `cat_idxs` and `cat_dims`) instead of falling back to sklearn MLPClassifier or MLPRegressor. Runtime is CPU-only and the cell must finish in under 10 minutes. SUBSAMPLE training to 5000 rows when len(X_train) > 5000: `X_train, y_train = X_train.sample(n=5000, random_state=42), y_train.loc[X_train.index]`. Use compact settings: max_epochs=2, virtual_batch_size=256, batch_size=1024, patience=0, no hyperparameter search, `n_d=16, n_a=16, n_steps=2`. Pass `verbose=0` in the constructor. Do NOT pass `progress_bar=False` or other unsupported kwargs to the constructor.';
    default:
      return null;
  }
}

function getSpecificTrainingImplementationFailure(
  modelType: string | undefined,
  taskType: string | undefined,
  code: string,
): string | null {
  const canonical = inferSpecificModelType(modelType);
  if (!canonical) {
    if (taskType === 'regression') {
      if (/\bstratify\s*=\s*y\b/.test(code) || /\btrain_test_split\s*\([\s\S]{0,240}\bstratify\s*=\s*y\b/.test(code)) {
        return 'Regression code must not stratify train/test splits on y. Use an unstratified split for continuous targets.';
      }
      if (/\bStratifiedKFold\b|\bStratifiedShuffleSplit\b/.test(code)) {
        return 'Regression code must not use stratified splitters. Use train_test_split(..., stratify=None) or plain KFold.';
      }
    }
    return containsInlinePackageInstall(code)
      ? 'Notebook training code must not install Python packages inline. Use the install_package tool before rerunning the cell.'
      : null;
  }

  if (taskType === 'regression') {
    if (/\bstratify\s*=\s*y\b/.test(code) || /\btrain_test_split\s*\([\s\S]{0,240}\bstratify\s*=\s*y\b/.test(code)) {
      return 'Regression code must not stratify train/test splits on y. Use an unstratified split for continuous targets.';
    }
    if (/\bStratifiedKFold\b|\bStratifiedShuffleSplit\b/.test(code)) {
      return 'Regression code must not use stratified splitters. Use train_test_split(..., stratify=None) or plain KFold.';
    }
  }

  if (
    ['tabtransformer', 'fttransformer', 'tabnet'].includes(canonical)
    && /\bMLP(?:Classifier|Regressor)\b/.test(code)
  ) {
    return `Approved modelType "${canonical}" was replaced with sklearn MLP code.`;
  }
  if (containsInlinePackageInstall(code)) {
    return 'Notebook training code must not install Python packages inline. Use the install_package tool before rerunning the cell.';
  }

  const estimatorRule = getSpecificTrainingEstimatorRule(modelType, taskType);
  if (estimatorRule && !estimatorRule.pattern.test(code)) {
    return `Approved modelType "${canonical}" must implement ${estimatorRule.description}. Do not substitute a different estimator family.`;
  }

  switch (canonical) {
    case 'tabtransformer':
      if (!/\bTabTransformerConfig\b/.test(code) || !/\bTabularModel\b/.test(code)) {
        return 'TabTransformer code must use pytorch_tabular TabTransformerConfig together with TabularModel.';
      }
      break;
    case 'fttransformer':
      if (!/\bFTTransformerConfig\b/.test(code) || !/\bTabularModel\b/.test(code)) {
        return 'FT-Transformer code must use pytorch_tabular FTTransformerConfig together with TabularModel.';
      }
      break;
    case 'tabnet':
      if (!/\bTabNet(?:Classifier|Regressor)\b/.test(code)) {
        return 'TabNet code must use pytorch_tabnet TabNetClassifier or TabNetRegressor.';
      }
      break;
    default:
      break;
  }

  return null;
}

function buildTrainingCompletionFooterSegment(): TrainingCellDraft {
  return {
    title: 'Finalize Model Artifact and Metrics',
    content: [
      'import json',
      'import math',
      'import joblib',
      '',
      "def _is_predictable(value):",
      '    return value is not None and hasattr(value, "predict") and callable(getattr(value, "predict"))',
      '',
      "_ARTIFACT_CANDIDATES = ('pipeline', 'model', 'best_model', 'best_estimator', 'estimator', 'classifier', 'regressor', 'clf')",
      '',
      'trained_artifact = None',
      'for candidate_name in _ARTIFACT_CANDIDATES:',
      '    candidate_value = globals().get(candidate_name)',
      '    if _is_predictable(candidate_value):',
      '        trained_artifact = candidate_value',
      '        break',
      'if trained_artifact is None:',
      '    for candidate_name in _ARTIFACT_CANDIDATES:',
      '        candidate_value = globals().get(candidate_name)',
      '        if isinstance(candidate_value, dict):',
      "            for inner_key in ('pipeline', 'model', 'estimator', 'classifier', 'regressor', 'best_estimator'):",
      '                inner_value = candidate_value.get(inner_key)',
      '                if _is_predictable(inner_value):',
      '                    trained_artifact = inner_value',
      '                    break',
      '            if trained_artifact is not None:',
      '                break',
      'if trained_artifact is None:',
      "    raise TypeError('No sklearn-compatible trained model or pipeline was found in notebook globals. Save the Pipeline or fitted estimator directly — do not wrap it in a dict.')",
      '',
      "joblib.dump(trained_artifact, 'model.joblib')",
      '',
      "final_metrics = globals().get('final_metrics')",
      'if not isinstance(final_metrics, dict) or not final_metrics:',
      "    for container_name in ('metrics', 'result', 'results', 'evaluation'):",
      '        container = globals().get(container_name)',
      '        if isinstance(container, dict) and container:',
      '            final_metrics = {',
      '                str(key): float(value)',
      '                for key, value in container.items()',
      '                if isinstance(value, (int, float)) and math.isfinite(float(value))',
      '            }',
      '            if final_metrics:',
      '                break',
      'if not isinstance(final_metrics, dict) or not final_metrics:',
      "    raise ValueError('Training completed without a numeric final_metrics dict. Define final_metrics before finalization.')",
      '',
      "print('__TRAIN_COMPLETE__|' + json.dumps(final_metrics))",
    ].join('\n')
  };
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
- If the configured task type is regression, NEVER use \`stratify=y\`, \`StratifiedKFold\`, or \`StratifiedShuffleSplit\`. Regression targets must use unstratified splits.
- If the configured task type is clustering, do not create a supervised target split or supervised metrics block.
- If the approved modelType names a specific estimator family (for example decision tree, random forest, KNN, logistic regression, linear regression, ridge, SVR, MLP, LightGBM, XGBoost, CatBoost, KMeans), implement that exact family. Do NOT substitute a nearby baseline or proxy estimator.
- If the approved modelType is tabtransformer, fttransformer, or tabnet, you MUST implement that exact architecture with its real library. Never substitute sklearn MLPClassifier or MLPRegressor as a proxy.
- Never run pip install, python -m pip, subprocess-based package installation, or any dependency bootstrap logic inside notebook cells. Dependencies are installed via tools before code execution.
- If you use stratified splitting or stratified CV for classification, guard it: when any class has fewer than 2 rows, fall back to an unstratified split/CV instead of failing.
- If you parse a column with pd.to_datetime() or otherwise create a datetime64 column, do NOT pass that raw datetime column into numeric imputation/scaling/model input. Convert it to numeric/ordinal first, derive date parts, or drop the raw datetime column before building numeric_features.
- If date-derived numeric columns already exist (for example date_month/date_year), prefer those and exclude the raw DATE column from numeric preprocessing.
- Do NOT write markdown cells, notebook narration, or plan summaries.
- Use the configured hyperparameters exactly when they are provided in the request context.
- If the model is a random forest regressor/classifier and hyperparameters are absent or incomplete, use a runtime-safe baseline for wide tabular data: n_estimators <= 100, max_depth <= 10, min_samples_leaf >= 2, max_features="sqrt", random_state=42. Do NOT use max_depth=None unless the user explicitly requested it.
- For expensive tree ensembles on medium/large datasets, avoid full train-set predictions unless the user explicitly asked for train metrics. Test-set metrics are sufficient.
- The FINAL executable cell MUST do both of these BEFORE printing the marker — never one without the other:
  1. Save the fitted model/pipeline:  import joblib; joblib.dump(<fitted_model_or_pipeline>, "model.joblib")
  2. Print the marker:  print("__TRAIN_COMPLETE__|" + json.dumps(final_metrics))
  register_model fails with ENOENT if model.joblib is not saved, so this is mandatory.
- Keep runtime lean. Prefer train/test split or light CV unless the request explicitly requires heavier evaluation.
- For TabTransformer, FT-Transformer, and TabNet on CPU: MUST subsample training to 5000 rows before fit, max_epochs=2, batch_size=1024, no early stopping, no hyperparameter search, compact architecture (input_embed_dim=16, num_attn_blocks=1, num_heads=2). Keep the full test set for evaluation. Target runtime under 3 minutes; the cell timeout is 10 minutes.
- Save the trained pipeline/model with joblib.dump(..., "model.joblib") before final completion.
- The object passed to joblib.dump MUST be sklearn-compatible (have .predict) — either the raw fitted estimator or a Pipeline. Do NOT wrap the model in a dict/tuple/list (e.g., {"model": clf, "categorical_columns": [...]}). If you need to carry metadata like categorical columns, bake it into the Pipeline or the estimator's constructor instead.
- RUNTIME PLATFORM (HARD): Python executes inside a Linux x86_64 Docker container with NO GPU access. Do NOT pass device='cuda' or device='mps'; do NOT call .cuda() or .to('cuda')/.to('mps'); do NOT set accelerator='gpu'/'cuda'/'mps'/'tpu' or devices='auto'/'gpu'. For pytorch_tabular TrainerConfig, omit accelerator and devices (or set accelerator='cpu'). For pytorch_tabnet, omit device_name. torch.cuda.is_available() is fine (it returns False).
- Each code cell MUST be 80 executable lines or fewer (comments and blank lines count). If one step exceeds 80 lines, split it across additional "# Cell N: <title>" markers (e.g. "# Cell 3a: Model fit", "# Cell 3b: Metrics computation"). Prefer concise idiomatic code over verbose loops; avoid restating imports inside cells.
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
- Never run pip, python -m pip, subprocess pip installs, or ad-hoc dependency bootstrap logic inside the notebook cell. Dependency installation belongs to the install_package tool, not notebook code.
- If the failure mentions datetime64, DTypePromotionError, or numeric imputation/scaling with dates, repair it by converting the raw datetime column to numeric/ordinal values, deriving date parts, or dropping the raw datetime column before numeric preprocessing. Do NOT send raw datetime columns into numeric_features.
- If the configured task type is regression, remove any \`stratify=y\`, \`StratifiedKFold\`, or \`StratifiedShuffleSplit\` logic from the repaired cell. Regression targets must use unstratified splits.
- If the failure mentions timeout or the model fit was too slow, simplify the cell by reducing tree-ensemble cost (fewer trees, bounded max_depth, larger min_samples_leaf, max_features="sqrt") and remove full train-set predictions unless the user explicitly asked for them.
- If the approved model is TabTransformer, FT-Transformer, or TabNet and the failure mentions timeout, shrink the architecture and training budget aggressively: max_epochs <= 5, patience <= 2, compact hidden sizes, and no tuning loops.
- RUNTIME PLATFORM (HARD): Python executes inside a Linux x86_64 Docker container with NO GPU access. Do NOT pass device='cuda' or device='mps'; do NOT call .cuda() or .to('cuda')/.to('mps'); do NOT set accelerator='gpu'/'cuda'/'mps'/'tpu' or devices='auto'/'gpu'. If the previous error mentioned CUDA/MPS/accelerator, remove those device references entirely and rely on CPU defaults.
- CELL SIZE (HARD): the repaired cell MUST be <= 80 executable lines. The workflow rejects any cell with more than 100 lines. If the repair is close to the limit, drop non-essential comments, helper prints, defensive try/except, and verbose docstrings. Do NOT re-implement earlier successful cells in this repair; rely on their already-defined variables/imports.
- If the failure mentions "got multiple values for keyword argument" (typical for pytorch_tabular TrainerConfig), REMOVE any "logger", "enable_progress_bar", or other conflicting keys from trainer_kwargs that collide with pytorch_tabular's internal pl.Trainer call. Use native TrainerConfig fields instead: progress_bar="none" to silence the bar, checkpoints=None to skip checkpoint writing. Leave trainer_kwargs={} or only include kwargs NOT already handled by TrainerConfig.
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
  const hyperparameters = asRecord(experiment.hyperparameters) ?? {};
  const modelType = asString(experiment.modelType) ?? 'unknown';
  const specificModelGuidance = getSpecificTrainingModelGuidance(modelType);
  const currentTurnResults = state.toolResultHistory.slice(state.turnStartToolCallCount);
  const currentTurnCalls = state.toolCallHistory.slice(state.turnStartToolCallCount);
  const lastRunCell = getLastToolResult(currentTurnResults, 'run_cell');
  const lastRunOutput = getOutputRecord(lastRunCell);
  const stderr = asString(lastRunOutput?.stderr) ?? asString(lastRunOutput?.error) ?? '';
  const stdout = asString(lastRunOutput?.stdout) ?? '';
  const latestDraft = extractLatestTrainingDraftMetadata(state);
  const missingDependencyRecovery = getTrainingMissingDependencyRecovery(state);
  const requiredRuntimeDependencies = getRequiredTrainingRuntimeDependencies(modelType);
  const installedRuntimeDependencies = getInstalledTrainingRuntimeDependencies(state);
  const missingRuntimeDependencies = requiredRuntimeDependencies.filter((requirement) =>
    !hasRuntimeDependency(installedRuntimeDependencies, requirement),
  );

  if (!latestDraft && missingRuntimeDependencies.length > 0) {
    const parsedInstallBundle = ToolCallSchema.safeParse({
      id: `wf-call-auto-install-training-bundle-${randomUUID()}`,
      tool: 'install_package',
      args: {
        packageName: missingRuntimeDependencies.join(', '),
      },
      rationale: `Install the runtime dependency bundle required for the approved ${modelType} training flow before writing notebook cells.`,
    });
    if (parsedInstallBundle.success) {
      return [parsedInstallBundle.data];
    }
  }

  if (
    missingDependencyRecovery
    && !missingDependencyRecovery.installAttemptedAfterFailure
    && !missingDependencyRecovery.hadSuccessfulInstallEarlierInTurn
  ) {
    const parsedInstall = ToolCallSchema.safeParse({
      id: `wf-call-auto-install-training-${missingDependencyRecovery.packageName.replace(/[^a-z0-9]+/gi, '-')}`,
      tool: 'install_package',
      args: {
        packageName: missingDependencyRecovery.packageName,
      },
      rationale: `Install missing Python dependency "${missingDependencyRecovery.packageName}" required by the training notebook before retrying the failed cell.`
    });
    if (parsedInstall.success) {
      return [parsedInstall.data];
    }
  }

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

    // Bound repair attempts per turn so validator rejections (oversized cell,
    // forbidden device, inline pip) can't push the LangGraph runner into its
    // 152-iteration recursion cap. Each repair attempt adds an auto-rewrite
    // call to history; after MAX_TRAINING_REPAIR_ATTEMPTS we surrender the
    // turn cleanly with the last error intact for the user.
    const priorRepairAttempts = currentTurnCalls.filter((call) =>
      typeof call.id === 'string' && call.id.startsWith('wf-call-auto-rewrite-training-')
    ).length;
    if (priorRepairAttempts >= MAX_TRAINING_REPAIR_ATTEMPTS) {
      return [];
    }

    const repairTargetColumn = state.turn.targetColumn
      ? dataset.columns.find((column) => column.name === state.turn.targetColumn) ?? null
      : null;
    const repairTargetProfileLine = formatTargetProfileForPrompt(repairTargetColumn);
    const repairExperimentTaskType = asString(experiment.taskType);

    const repairPrompt = [
      'Runtime environment (authoritative): Linux x86_64 Docker container, CPU only, no GPU, no MPS, no CUDA. Do not emit device=/accelerator=/devices= arguments targeting GPU.',
      `Selected dataset (authoritative): ${dataset.filename} [${dataset.datasetId}]`,
      state.turn.targetColumn ? `Selected target column (authoritative): ${state.turn.targetColumn}` : null,
      repairTargetProfileLine,
      repairExperimentTaskType ? `Configured task type (authoritative): ${repairExperimentTaskType} — the fitted estimator variant MUST match this.` : null,
      `User request: ${state.turn.prompt ?? 'Continue the training workflow.'}`,
    `Configured experiment: ${asString(experiment.experimentName) ?? 'Unnamed experiment'}`,
    `Model type: ${modelType}`,
    Object.keys(hyperparameters).length > 0
      ? `Configured hyperparameters (authoritative): ${JSON.stringify(hyperparameters)}`
      : 'Configured hyperparameters: none provided — choose runtime-safe defaults for the selected model type.',
      `Failed segment title: ${failingSegment.title}`,
      `Failed segment index: ${failingSegmentIndex + 1} of ${latestDraft.segments.length}`,
      specificModelGuidance ? `Architecture requirement: ${specificModelGuidance}` : null,
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

    let cleanedRepair = repairedCode
      .replace(/^```(?:python)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
    if (containsInlinePackageInstall(cleanedRepair)) {
      const retryRepair = await client.complete({
        messages: [
          { role: 'system', content: buildTrainingRepairSystemPrompt() },
          {
            role: 'user',
            content: `${repairPrompt}\n\nRepair constraint: remove all inline pip/subprocess dependency installation logic. Assume dependencies are installed outside the notebook.`,
          }
        ],
        temperature: 0.1,
        maxOutputTokens: 3000,
        reasoningEffort: 'low'
      });
      cleanedRepair = retryRepair
        .replace(/^```(?:python)?\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .trim();
    }
    if (!cleanedRepair) {
      return [];
    }
    if (containsInlinePackageInstall(cleanedRepair)) {
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

  const targetColumnForPrompt = state.turn.targetColumn
    ? dataset.columns.find((column) => column.name === state.turn.targetColumn) ?? null
    : null;
  const targetProfileLine = formatTargetProfileForPrompt(targetColumnForPrompt);
  const experimentTaskType = asString(experiment.taskType);

  const prompt = [
    'Runtime environment (authoritative): Linux x86_64 Docker container, CPU only, no GPU, no MPS, no CUDA. Do not emit device=/accelerator=/devices= arguments targeting GPU.',
    `Selected dataset (authoritative): ${dataset.filename} [${dataset.datasetId}]`,
    state.turn.targetColumn ? `Selected target column (authoritative): ${state.turn.targetColumn}` : null,
    targetProfileLine,
    experimentTaskType ? `Configured task type (authoritative): ${experimentTaskType} — the fitted estimator variant MUST match this.` : null,
    `User request: ${state.turn.prompt ?? 'Continue the training workflow.'}`,
    `Configured experiment: ${asString(experiment.experimentName) ?? 'Unnamed experiment'}`,
    `Model type: ${modelType}`,
    `Split strategy: ${asString(experiment.splitStrategy) ?? 'train_test'}`,
    specificModelGuidance ? `Architecture requirement: ${specificModelGuidance}` : null,
    Object.keys(hyperparameters).length > 0
      ? `Configured hyperparameters (authoritative): ${JSON.stringify(hyperparameters)}`
      : 'Configured hyperparameters: none provided — choose runtime-safe defaults for the selected model type.',
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

  let cleaned = sanitizeGeneratedPython(rawCode);
  const specificImplementationFailure = getSpecificTrainingImplementationFailure(modelType, experimentTaskType, cleaned);
  if (specificImplementationFailure) {
    const retryPrompt = [
      prompt,
      `Retry requirement: ${specificImplementationFailure}`,
      specificModelGuidance ? `Use this implementation guidance exactly: ${specificModelGuidance}` : null,
      'Return replacement raw Python code only.'
    ].filter(Boolean).join('\n\n');
    const retryCode = await client.complete({
      messages: [
        { role: 'system', content: buildTrainingCodeGenerationSystemPrompt() },
        { role: 'user', content: retryPrompt }
      ],
      temperature: 0.1,
      maxOutputTokens: 5000,
      reasoningEffort: 'low'
    });
    cleaned = sanitizeGeneratedPython(retryCode);
  }
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
  // Intentionally NOT pre-filtering by `extractLatestExperimentIdFromHistory(state)`
  // — that filter was introduced by the sprint11 merge and caused #332:
  // when a user approves a SECOND model in the same turn, register_model
  // for the first model wins the reverse scan and the filter then drops
  // the newer draft because its experimentId !== latestExperimentId.
  // Callers that need experiment-scoped filtering already do it themselves
  // (selectTrainingExecutionExperiment + collectTrainingDraftNotebookActivity).
  const callSources = [
    state.toolCallHistory.slice(state.turnStartToolCallCount),
    state.toolCallHistory,
  ];

  for (const calls of callSources) {
    for (let index = calls.length - 1; index >= 0; index -= 1) {
      const call = calls[index];
      if (!['write_cell', 'edit_cell', 'insert_cell'].includes(call.tool)) {
        continue;
      }
      const metadata = asRecord(call.args?.metadata);
      const trainingDraft = asRecord(metadata?.trainingDraft);
      const rawSegments = Array.isArray(trainingDraft?.segments) ? trainingDraft.segments : null;
      if (!trainingDraft || !rawSegments || rawSegments.length === 0) {
        continue;
      }
      const experimentId = asString(trainingDraft.experimentId) ?? undefined;

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
        experimentId,
        datasetId: asString(trainingDraft.datasetId) ?? undefined,
        datasetFilename: asString(trainingDraft.datasetFilename) ?? undefined,
        targetColumn: asString(trainingDraft.targetColumn) ?? undefined,
        segmentIndex: typeof trainingDraft.segmentIndex === 'number' ? trainingDraft.segmentIndex : 0,
        segments
      };
    }
  }
  return null;
}

function extractTrainingDraftIdFromCall(call: WorkflowGraphState['toolCallHistory'][number] | undefined): string | null {
  const metadata = asRecord(call?.args?.metadata);
  const trainingDraft = asRecord(metadata?.trainingDraft);
  return asString(trainingDraft?.draftId) ?? null;
}

function collectTrainingDraftNotebookActivity(
  state: WorkflowGraphState,
  draftId: string
): TrainingDraftNotebookActivity {
  const cellIds: string[] = [];
  const seen = new Set<string>();
  const notebookResults: import('../../../types/llm.js').ToolResult[] = [];
  const runResults: import('../../../types/llm.js').ToolResult[] = [];
  const allCalls = state.toolCallHistory;
  const allResults = state.toolResultHistory;

  for (let index = 0; index < allResults.length; index += 1) {
    const call = allCalls[index];
    const result = allResults[index];
    if (!call || !result) {
      continue;
    }

    if (['write_cell', 'edit_cell', 'insert_cell'].includes(call.tool)) {
      if (extractTrainingDraftIdFromCall(call) !== draftId) {
        continue;
      }
      notebookResults.push(result);
      if (result.error) {
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
      if (typeof cell?.cellId === 'string' && !seen.has(cell.cellId)) {
        seen.add(cell.cellId);
        cellIds.push(cell.cellId);
      }
      continue;
    }

    if (call.tool !== 'run_cell') {
      continue;
    }
    const callArgs = asRecord(call.args);
    const cellId = asString(callArgs?.cellId);
    if (!cellId || !seen.has(cellId)) {
      continue;
    }
    notebookResults.push(result);
    runResults.push(result);
  }

  return {
    notebookResults,
    runResults,
    writtenCellIds: cellIds
  };
}

function extractTrainingDraftRunStatuses(
  state: WorkflowGraphState,
  draftId: string
): Array<{ status?: string }> {
  return collectTrainingDraftNotebookActivity(state, draftId).runResults.map((result) => {
    const output = getOutputRecord(result);
    return {
      status: typeof output?.status === 'string' ? output.status : undefined
    };
  });
}

/**
 * Returns the content string of every cell the workflow wrote (or re-wrote)
 * as part of the given training draft. For any cellId that was written
 * multiple times (the LLM's mid-turn correction path), the LATEST content
 * wins. This is the trusted source for "did the LLM actually write a
 * `joblib.dump(...)` line?" — checking `draft.segments[i].content` would
 * lie because that array reflects the INITIAL plan, never the live cell.
 */
function collectTrainingDraftWrittenContent(
  state: WorkflowGraphState,
  draftId: string
): string[] {
  const latestByCellId = new Map<string, string>();
  const anonymousContents: string[] = [];

  for (let index = 0; index < state.toolCallHistory.length; index += 1) {
    const call = state.toolCallHistory[index];
    if (!call || !['write_cell', 'edit_cell', 'insert_cell'].includes(call.tool)) {
      continue;
    }
    if (extractTrainingDraftIdFromCall(call) !== draftId) {
      continue;
    }
    const args = asRecord(call.args);
    const content = asString(args?.content);
    if (!content) {
      continue;
    }
    const argCellId = asString(args?.cellId);
    const resultOutput = getOutputRecord(state.toolResultHistory[index]);
    const resolvedCellId = argCellId
      ?? asString(resultOutput?.cellId)
      ?? asString(asRecord(resultOutput?.cell)?.cellId);
    if (resolvedCellId) {
      latestByCellId.set(resolvedCellId, content);
    } else {
      anonymousContents.push(content);
    }
  }

  return [...latestByCellId.values(), ...anonymousContents];
}

/**
 * True iff any cell actually written during this training draft contains a
 * `joblib.dump(...)` call. Unlike checking `draft.segments`, this reflects
 * the LLM's live, post-correction notebook state.
 */
function anyWrittenCellSavesArtifact(state: WorkflowGraphState, draftId: string): boolean {
  return collectTrainingDraftWrittenContent(state, draftId).some((content) =>
    /joblib\.dump\s*\(/.test(content)
  );
}

/**
 * Detects whether the current turn has a register_model failure whose error
 * text indicates a missing artifact (e.g. ENOENT on model.joblib). When true
 * the caller should force-inject the completion footer so the subsequent
 * register_model retry can succeed.
 */
function hasRegisterModelArtifactFailure(state: WorkflowGraphState): boolean {
  const currentTurnResults = state.toolResultHistory.slice(state.turnStartToolCallCount);
  for (let index = currentTurnResults.length - 1; index >= 0; index -= 1) {
    const result = currentTurnResults[index];
    if (result.tool !== 'register_model') continue;
    if (!result.error) return false;
    const message = typeof result.error === 'string' ? result.error.toLowerCase() : '';
    if (!message) return false;
    // Stable substrings of the registrationTools error messages.
    return message.includes('locate the model artifact')
      || message.includes('enoent')
      || (message.includes('artifact') && message.includes('no such'));
  }
  return false;
}

async function buildTrainingWriteCodeAction(
  state: WorkflowGraphState
): Promise<import('../../../types/llm.js').ToolCall[]> {
  const draft = extractLatestTrainingDraftMetadata(state);
  if (!draft || draft.segments.length === 0) {
    return [];
  }

  const draftActivity = collectTrainingDraftNotebookActivity(state, draft.draftId);
  const lastNotebookResult = draftActivity.notebookResults.at(-1) ?? null;
  const missingDependencyRecovery = getTrainingMissingDependencyRecovery(state);
  if (
    missingDependencyRecovery?.installSucceededAfterFailure
    && !missingDependencyRecovery.rerunSucceededAfterInstall
    && missingDependencyRecovery.failedCellId
    && draftActivity.writtenCellIds.includes(missingDependencyRecovery.failedCellId)
  ) {
    const parsedRetry = ToolCallSchema.safeParse({
      id: `wf-call-auto-rerun-training-${draft.draftId}-${missingDependencyRecovery.packageName.replace(/[^a-z0-9]+/gi, '-')}`,
      tool: 'run_cell',
      args: { cellId: missingDependencyRecovery.failedCellId },
      rationale: `Retry the failed training cell now that "${missingDependencyRecovery.packageName}" has been installed in the runtime.`
    });
    return parsedRetry.success ? [parsedRetry.data] : [];
  }
  if (isFailedToolResult(lastNotebookResult)) {
    return [];
  }
  // Training is only "complete" when BOTH the __TRAIN_COMPLETE__ marker was
  // printed AND the model artifact was actually saved by a cell that was
  // WRITTEN to the notebook — not merely planned in draft.segments. If the
  // marker fired but no WRITTEN cell called joblib.dump, we still need to
  // emit the completion footer so register_model can find model.joblib.
  // Gap #2 fix: checking draft.segments[i].content here used to wrongly
  // treat the unwritten "Artifact Save" plan segment as proof of save.
  const hasCompletedRunMarker = draftActivity.runResults.some(isCompletedTrainingRunCell);
  const savedArtifactInWrittenCells = anyWrittenCellSavesArtifact(state, draft.draftId);
  if (hasCompletedRunMarker && savedArtifactInWrittenCells) {
    return [];
  }
  if (isFailedToolResult(draftActivity.runResults.at(-1) ?? null)) {
    return [];
  }

  const writtenCellIds = draftActivity.writtenCellIds;
  const runStatuses = extractTrainingDraftRunStatuses(state, draft.draftId);
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

  // Completion-footer injection — fires when ANY of:
  //   A) all planned segments have been written and run (original condition),
  //   B) the LLM skipped past the Artifact Save segment into execute_training
  //      and register_model subsequently failed with "could not locate the
  //      model artifact" (ENOENT). In case B we force-write the footer so the
  //      register_model retry has a model.joblib on disk.
  // We only need to inject if NO written cell already contains joblib.dump.
  const registerModelFailedOnArtifact = hasRegisterModelArtifactFailure(state);
  const allPlannedSegmentsRun = writtenCellIds.length >= draft.segments.length
    && runStatuses.length >= draft.segments.length;
  if ((allPlannedSegmentsRun || registerModelFailedOnArtifact) && !savedArtifactInWrittenCells) {
    const completionSegment = buildTrainingCompletionFooterSegment();
    const completionDraft: TrainingDraftMetadata = {
      ...draft,
      segmentIndex: draft.segments.length,
      segments: [...draft.segments, completionSegment]
    };
    const parsedFooterWrite = ToolCallSchema.safeParse({
      id: `wf-call-auto-write-training-${draft.draftId}-${completionDraft.segmentIndex}`,
      tool: 'write_cell',
      args: {
        title: completionSegment.title,
        cellType: 'code',
        content: completionSegment.content,
        metadata: {
          phase: 'training',
          source: 'training-lifecycle',
          trainingDraft: completionDraft
        }
      },
      rationale: registerModelFailedOnArtifact
        ? 'register_model failed with ENOENT — inject a save+marker cell so the retry can locate model.joblib.'
        : 'Append a finalization cell so the training workflow saves the artifact and emits the completion marker.'
    });
    return parsedFooterWrite.success ? [parsedFooterWrite.data] : [];
  }

  if (allPlannedSegmentsRun) {
    // All planned segments ran AND a written cell already saved the artifact.
    // Nothing more to do here — downstream stages (execute_training,
    // evaluate_results, register_model) handle the rest.
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
    return asRecord(parsed) ?? null;
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

function getLatestCompletedTrainingRunCellForDraft(
  state: WorkflowGraphState,
  draftId: string
): import('../../../types/llm.js').ToolResult | null {
  return getLatestCompletedTrainingRunCell(collectTrainingDraftNotebookActivity(state, draftId).runResults);
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

function getLastToolResultForExperiment(
  toolResults: import('../../../types/llm.js').ToolResult[],
  toolName: string,
  experimentId: string
): import('../../../types/llm.js').ToolResult | null {
  for (let index = toolResults.length - 1; index >= 0; index -= 1) {
    const result = toolResults[index];
    if (result?.tool !== toolName) {
      continue;
    }
    const output = getOutputRecord(result);
    if (asString(output?.experimentId) === experimentId) {
      return result;
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
  if (typeof output.stderr === 'string' && output.stderr.trim()) {
    return output.stderr;
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

  const existingExecute = getLastToolResultForExperiment(
    state.toolResultHistory.slice(state.turnStartToolCallCount),
    'execute_training',
    experimentId
  );
  if (existingExecute) {
    return [];
  }

  const draft = extractLatestTrainingDraftMetadata(state);
  if (!draft) {
    return [];
  }

  const completedRun = getLatestCompletedTrainingRunCellForDraft(state, draft.draftId);
  if (!completedRun) {
    return [];
  }

  const output = getOutputRecord(completedRun);
  const stdout = asString(output?.stdout) ?? '';
  const parsedMetrics = parseTrainCompleteMetrics(stdout);
  if (!parsedMetrics) {
    return [];
  }

  const cellIds = collectTrainingDraftNotebookActivity(state, draft.draftId).writtenCellIds;
  const prepSegments = extractWorkflowPrepSegmentsFromSegments(
    draft.segments.map((segment) => ({ content: segment.content }))
  );
  const parsed = ToolCallSchema.safeParse({
    id: `wf-call-auto-execute-training-${experimentId}`,
    tool: 'execute_training',
    args: {
      experimentId,
      succeeded: true,
      metrics: parsedMetrics,
      cellIds,
      ...(prepSegments.length > 0 ? { prepSegments } : {})
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
  const existingEvaluate = getLastToolResultForExperiment(currentTurnResults, 'evaluate_results', experimentId);
  if (existingEvaluate) {
    return [];
  }

  const executeResult = getLastToolResultForExperiment(currentTurnResults, 'execute_training', experimentId);
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
  const existingRegister = getLastToolResultForExperiment(currentTurnResults, 'register_model', experimentId);
  if (existingRegister) {
    return [];
  }

  const metrics = asRecord(experiment?.evaluationMetrics) ?? asRecord(experiment?.trainingMetrics);
  if (!metrics || Object.keys(metrics).length === 0) {
    return [];
  }
  const resolvedModelType = resolveRegisteredTrainingModelType(experiment);

  const parsed = ToolCallSchema.safeParse({
    id: `wf-call-auto-register-training-${experimentId}`,
    tool: 'register_model',
    args: {
      experimentId,
      modelName: asString(experiment?.experimentName) ?? `model-${experimentId}`,
      modelType: resolvedModelType,
      metrics,
      hyperparameters: asRecord(experiment?.hyperparameters) ?? {},
      artifactPath: asString(experiment?.artifactPath) ?? 'model.joblib',
      tags: [
        'baseline',
        asString(experiment?.splitStrategy) ?? 'train-test',
        resolvedModelType.replace(/_/g, '-')
      ]
    },
    rationale: 'Register the successfully evaluated training artifact and metrics.'
  });
  return parsed.success ? [parsed.data] : [];
}

function resolveRegisteredTrainingModelType(experiment: Record<string, unknown> | null): string {
  const configuredModelType = asString(experiment?.registeredModelType)
    ?? asString(experiment?.modelType)
    ?? 'unknown';
  const prepSegments = normalizeWorkflowPrepSegments(experiment?.workflowPrepSegments);
  const inferredModelType = inferModelTypeFromTrainingPrepSegments(prepSegments);
  return inferredModelType ?? configuredModelType;
}

function inferModelTypeFromTrainingPrepSegments(segments: string[]): string | null {
  const combined = segments.join('\n');
  if (!combined.trim()) {
    return null;
  }

  for (const { pattern, modelType } of TRAINING_MODEL_INFERENCE_PATTERNS) {
    if (pattern.test(combined)) {
      return modelType;
    }
  }

  return null;
}

function resolveNextTrainingStage(
  current: string,
  toolResults: import('../../../types/llm.js').ToolResult[]
): string | null {
  if (current === 'configure_experiment') {
    const lastConfigure = getLastToolResult(toolResults, 'configure_experiment');
    if (!lastConfigure || isFailedToolResult(lastConfigure)) {
      return current;
    }
    return 'propose_model';
  }

  if (current === 'propose_model') {
    const lastProposal = getLastToolResult(toolResults, 'propose_training_plan');
    if (!lastProposal || isFailedToolResult(lastProposal)) {
      return current;
    }
    // Approval is handled via pause state plus phaseRequestBuilder's
    // approved-experiment routing. Do not auto-advance into codegen from
    // stage order alone, or rejected/missing proposals can leak into
    // notebook execution within the same turn.
    return current;
  }

  if (current === 'generate_code') {
    // Repair mode is triggered only when the MOST RECENT notebook call is a
    // failure — scanning history for any past failure would keep this branch
    // active even after repair succeeded, causing the generator to discard
    // the existing draft and loop on fresh drafts until MAX_ITERATIONS.
    const lastNotebookResult = [...toolResults].reverse().find((result) =>
      ['write_cell', 'edit_cell', 'insert_cell', 'run_cell'].includes(result.tool)
    ) ?? null;
    const latestNotebookIsFailure = lastNotebookResult !== null && isFailedToolResult(lastNotebookResult);
    if (latestNotebookIsFailure) {
      const lastInstall = getLastToolResult(toolResults, 'install_package');
      if (lastInstall && !isFailedToolResult(lastInstall)) {
        return 'write_code';
      }
      return 'generate_code';
    }
    // Install-only turn (no notebook failure, no draft yet): stay at
    // generate_code so the next tick drafts the first cell. Advancing to
    // write_code here would hit DETERMINISTIC_ACTION_EMPTY because the write
    // stage has no draft to extend.
    const lastInstall = getLastToolResult(toolResults, 'install_package');
    if (lastInstall) {
      const hasSuccessfulDraftWrite = toolResults.some((result) =>
        ['write_cell', 'edit_cell', 'insert_cell'].includes(result.tool)
        && !isFailedToolResult(result)
        && typeof getOutputRecord(result)?.cellId === 'string'
      );
      if (!hasSuccessfulDraftWrite) {
        return 'generate_code';
      }
    }
  }

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
    const lastNotebookResult = [...toolResults].reverse().find((result) =>
      ['write_cell', 'edit_cell', 'insert_cell', 'run_cell'].includes(result.tool)
    ) ?? null;
    if (isFailedToolResult(lastNotebookResult)) {
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
      return 'generate_code';
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
