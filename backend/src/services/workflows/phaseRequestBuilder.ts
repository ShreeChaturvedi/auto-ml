import { env } from '../../config.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';
import { createProjectRepository } from '../../repositories/projectRepository.js';
import {
  listProjectDocuments,
  loadRagSnippets
} from '../../routes/llm/shared.js';
import type { DatasetProfile } from '../../types/dataset.js';
import { asRecord, asString } from '../../utils/typeCoercion.js';
import { FEATURE_METHODS } from '../featureEngineering.js';
import type { FeatureSpec } from '../featureEngineering.js';
import { createLlmClient } from '../llm/llmClient.js';
import { resolvePreprocessingControllerTurn } from '../llm/preprocessing/controller.js';
import {
  buildFeatureEngineeringRequest,
  buildOnboardingRequest,
  buildTrainingRequest
} from '../llm/prompts/index.js';
import { LLM_FEATURE_CONTINUE_TOOLS, LLM_FEATURE_PROPOSAL_TOOLS, LLM_ONBOARDING_TOOLS, LLM_TRAINING_LIFECYCLE_TOOLS } from '../llm/toolRegistry.js';

import type { WorkflowGraphState } from './graphState.js';
import { hasWorkflowHistory } from './history.js';
import { getPhaseConfig } from './phaseConfig.js';
import { hasPendingApprovedTrainingExperiments } from './trainingExperimentSelection.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const projectRepository = createProjectRepository(env.storagePath);

export interface TrainingSelectionMismatch {
  message: string;
  requestedDatasetFilename?: string;
  requestedTargetColumn?: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueNonEmpty(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim().toLowerCase())
        .filter((value): value is string => Boolean(value))
    )
  );
}

function buildDatasetAliases(filename: string): string[] {
  const trimmed = filename.trim();
  const extensionIndex = trimmed.lastIndexOf('.');
  const stem = extensionIndex > 0 ? trimmed.slice(0, extensionIndex) : trimmed;
  return uniqueNonEmpty([trimmed, stem]);
}

function promptContainsAlias(prompt: string, alias: string): boolean {
  if (alias.includes('.')) {
    return prompt.includes(alias);
  }
  const boundaryPattern = new RegExp(`(^|[^a-z0-9_])${escapeRegExp(alias)}([^a-z0-9_]|$)`, 'i');
  return boundaryPattern.test(prompt);
}

function detectPromptDatasetReference(
  prompt: string | undefined,
  datasets: DatasetProfile[],
  selectedDatasetFilename: string
): string | undefined {
  if (!prompt?.trim()) {
    return undefined;
  }

  const normalizedPrompt = prompt.toLowerCase();
  const selectedAliases = new Set(buildDatasetAliases(selectedDatasetFilename));
  const candidates = datasets
    .filter((dataset) => dataset.filename !== selectedDatasetFilename)
    .map((dataset) => ({
      filename: dataset.filename,
      aliases: buildDatasetAliases(dataset.filename)
    }))
    .sort((left, right) => right.filename.length - left.filename.length);

  for (const candidate of candidates) {
    const hasPromptMatch = candidate.aliases.some((alias) => promptContainsAlias(normalizedPrompt, alias));
    if (!hasPromptMatch) {
      continue;
    }
    const aliasesOverlapSelection = candidate.aliases.some((alias) => selectedAliases.has(alias));
    if (!aliasesOverlapSelection) {
      return candidate.filename;
    }
  }

  return undefined;
}

function detectPromptTargetReference(
  prompt: string | undefined,
  dataset: DatasetProfile,
  selectedTargetColumn: string | undefined
): string | undefined {
  if (!prompt?.trim() || !selectedTargetColumn?.trim()) {
    return undefined;
  }

  const candidates = dataset.columns
    .map((column) => column.name)
    .filter((columnName) => columnName.trim() && columnName !== selectedTargetColumn)
    .sort((left, right) => right.length - left.length);

  for (const candidate of candidates) {
    const escaped = escapeRegExp(candidate);
    const patterns = [
      new RegExp(`\\bpredict(?:ing)?\\s+\`?${escaped}\`?(?=\\s+(?:from|using|with|on|in)\\b|\\b)`, 'i'),
      new RegExp(`\\btarget(?:\\s+column)?\\s*(?:is|=|:)\\s*\`?${escaped}\`?\\b`, 'i'),
      new RegExp(`\\bresponse(?:\\s+column)?\\s*(?:is|=|:)\\s*\`?${escaped}\`?\\b`, 'i'),
      new RegExp(`\\blabel(?:\\s+column)?\\s*(?:is|=|:)\\s*\`?${escaped}\`?\\b`, 'i'),
      new RegExp(`\\boutcome(?:\\s+column)?\\s*(?:is|=|:)\\s*\`?${escaped}\`?\\b`, 'i')
    ];
    if (patterns.some((pattern) => pattern.test(prompt))) {
      return candidate;
    }
  }

  return undefined;
}

export function detectTrainingSelectionMismatch(params: {
  prompt?: string;
  dataset: DatasetProfile;
  selectedTargetColumn?: string;
  availableDatasets: DatasetProfile[];
}): TrainingSelectionMismatch | null {
  const {
    prompt,
    dataset,
    selectedTargetColumn,
    availableDatasets
  } = params;

  const requestedDatasetFilename = detectPromptDatasetReference(prompt, availableDatasets, dataset.filename);
  const requestedTargetColumn = detectPromptTargetReference(prompt, dataset, selectedTargetColumn);

  if (!requestedDatasetFilename && !requestedTargetColumn) {
    return null;
  }

  const mismatchParts: string[] = [];
  if (requestedDatasetFilename && requestedDatasetFilename !== dataset.filename) {
    mismatchParts.push(
      `prompt references dataset "${requestedDatasetFilename}", but the Training tab dataset is "${dataset.filename}"`
    );
  }
  if (requestedTargetColumn && selectedTargetColumn && requestedTargetColumn !== selectedTargetColumn) {
    mismatchParts.push(
      `prompt requests target "${requestedTargetColumn}", but the Training tab target is "${selectedTargetColumn}"`
    );
  }

  if (mismatchParts.length === 0) {
    return null;
  }

  return {
    requestedDatasetFilename,
    requestedTargetColumn,
    message: `Training prompt and selected controls do not match: ${mismatchParts.join('; ')}. Align the dataset/target dropdowns or adjust the prompt, then retry.`
  };
}

function extractSelectedFeatureIds(prompt: string | undefined): string[] {
  if (!prompt) {
    return [];
  }

  const match = prompt.match(/^Selected feature IDs to implement:\s*(.+)$/im);
  if (!match) {
    return [];
  }

  return match[1]
    .split(/\s*,\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function extractFeatureIdFromToolResult(
  result: WorkflowGraphState['toolResultHistory'][number]
): string | undefined {
  if (!result.output || typeof result.output !== 'object' || Array.isArray(result.output)) {
    return undefined;
  }

  const output = result.output as Record<string, unknown>;
  return typeof output.featureId === 'string' ? output.featureId : undefined;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

export function buildFeatureProposalItems(params: {
  results: WorkflowGraphState['toolResultHistory'];
  calls: WorkflowGraphState['toolCallHistory'];
}) {
  const proposalCallsById = new Map(
    params.calls
      .filter((call) => call.tool === 'propose_feature')
      .map((call) => [call.id, call] as const)
  );

  return params.results
    .filter((result) => result.tool === 'propose_feature' && !result.error && result.output)
    .map((result) => {
      const output = result.output as Record<string, unknown>;
      const proposalCall = proposalCallsById.get(result.id);
      const callArgs = proposalCall?.args && typeof proposalCall.args === 'object' && !Array.isArray(proposalCall.args)
        ? proposalCall.args as Record<string, unknown>
        : undefined;
      const sourceColumns = Array.isArray(output.sourceColumns)
        ? (output.sourceColumns as unknown[]).filter((column): column is string => typeof column === 'string')
        : Array.isArray(callArgs?.sourceColumns)
          ? (callArgs.sourceColumns as unknown[]).filter((column): column is string => typeof column === 'string')
          : [];
      const secondaryColumn = sourceColumns.length > 1 ? sourceColumns[1] : undefined;
      const rationale = firstNonEmptyString(
        output.rationale,
        proposalCall?.rationale,
        callArgs?.rationale,
        output.message
      ) ?? '';

      return {
        type: 'feature_suggestion' as const,
        id: firstNonEmptyString(output.featureId, callArgs?.featureId) ?? `feat-${Date.now()}`,
        feature: {
          sourceColumn: sourceColumns[0] ?? '',
          ...(secondaryColumn ? { secondaryColumn } : {}),
          featureName: firstNonEmptyString(output.featureName, callArgs?.featureName) ?? 'unnamed',
          description: rationale,
          method: firstNonEmptyString(output.method, callArgs?.method) ?? 'custom',
          params: (output.params && typeof output.params === 'object' && !Array.isArray(output.params)
            ? output.params as Record<string, unknown>
            : {})
        },
        rationale,
        impact: (['high', 'medium', 'low'].includes(String(output.impact ?? callArgs?.impact))
          ? String(output.impact ?? callArgs?.impact)
          : 'medium') as 'high' | 'medium' | 'low'
      };
    });
}

function isRejectedRegisterResult(
  result: WorkflowGraphState['toolResultHistory'][number]
): boolean {
  if (result.tool !== 'register_feature') {
    return false;
  }

  if (!result.output || typeof result.output !== 'object' || Array.isArray(result.output)) {
    return false;
  }

  const status = (result.output as Record<string, unknown>).status;
  return typeof status === 'string' && status.toLowerCase() === 'rejected';
}

export function shouldContinuePreprocessingTurn(state: WorkflowGraphState): boolean {
  if (state.iteration > 0) {
    return true;
  }

  if (state.turn.prompt?.trim()) {
    return false;
  }

  const startingStatus = typeof state.run.metadata?.workflowTurnStartStatus === 'string'
    ? state.run.metadata.workflowTurnStartStatus
    : state.run.status;

  if (startingStatus === 'running' || startingStatus === 'paused') {
    return hasWorkflowHistory({
      toolCalls: state.toolCallHistory,
      toolResults: state.toolResultHistory
    });
  }

  return false;
}

export function shouldRestrictFeatureToolsToProposalMode(
  toolResults: WorkflowGraphState['toolResultHistory'],
  prompt: string | undefined
): boolean {
  const selectedFeatureIds = extractSelectedFeatureIds(prompt);
  if (selectedFeatureIds.length > 0) {
    return false;
  }

  // Without explicit selected IDs, keep the model in proposal/review mode
  // even when prior lifecycle history exists.
  void toolResults;
  return true;
}

export function selectFeatureRequestToolResults(
  toolResults: WorkflowGraphState['toolResultHistory'],
  turnStartToolCallCount: number,
  prompt: string | undefined
): WorkflowGraphState['toolResultHistory'] {
  const featureToolResults = toolResults.filter((result) => result.tool !== 'get_dataset_profile');
  const currentTurnFeatureResults = selectCurrentTurnFeatureToolResults(toolResults, turnStartToolCallCount);

  return shouldRestrictFeatureToolsToProposalMode(featureToolResults, prompt)
    ? currentTurnFeatureResults
    : featureToolResults;
}

export function selectCurrentTurnFeatureToolResults(
  toolResults: WorkflowGraphState['toolResultHistory'],
  turnStartToolCallCount: number
): WorkflowGraphState['toolResultHistory'] {
  return toolResults
    .slice(turnStartToolCallCount)
    .filter((result) => result.tool !== 'get_dataset_profile');
}

function selectCurrentTurnFeatureToolCalls(
  toolCalls: WorkflowGraphState['toolCallHistory'],
  turnStartToolCallCount: number
): WorkflowGraphState['toolCallHistory'] {
  return toolCalls
    .slice(turnStartToolCallCount)
    .filter((call) => call.tool !== 'get_dataset_profile');
}

export function shouldAllowFeatureProposeTool(prompt: string | undefined): boolean {
  return extractSelectedFeatureIds(prompt).length === 0;
}

function extractTrainingDraftSegmentCount(
  toolCalls: WorkflowGraphState['toolCallHistory'],
  turnStartToolCallCount: number
): { draftId: string; segmentCount: number } | null {
  const currentTurnCalls = toolCalls.slice(turnStartToolCallCount);
  for (let index = currentTurnCalls.length - 1; index >= 0; index -= 1) {
    const call = currentTurnCalls[index];
    if (!['write_cell', 'edit_cell', 'insert_cell'].includes(call.tool)) {
      continue;
    }
    const metadata = asRecord(call.args?.metadata);
    const trainingDraft = asRecord(metadata?.trainingDraft);
    const rawSegments = Array.isArray(trainingDraft?.segments) ? trainingDraft.segments : null;
    if (!rawSegments || rawSegments.length === 0) {
      continue;
    }
    const draftId = asString(trainingDraft?.draftId);
    if (!draftId) {
      continue;
    }
    return {
      draftId,
      segmentCount: rawSegments.length
    };
  }
  return null;
}

function extractTrainingDraftActivity(
  state: WorkflowGraphState,
  draftId: string
): { successfulWriteCount: number; runResults: WorkflowGraphState['toolResultHistory'] } {
  const currentTurnCalls = state.toolCallHistory.slice(state.turnStartToolCallCount);
  const currentTurnResults = state.toolResultHistory.slice(state.turnStartToolCallCount);
  const draftCellIds = new Set<string>();
  let successfulWriteCount = 0;
  const runResults: WorkflowGraphState['toolResultHistory'] = [];

  for (let index = 0; index < currentTurnResults.length; index += 1) {
    const call = currentTurnCalls[index];
    const result = currentTurnResults[index];
    if (!call || !result) {
      continue;
    }

    if (['write_cell', 'edit_cell', 'insert_cell'].includes(call.tool)) {
      const metadata = asRecord(call.args?.metadata);
      const trainingDraft = asRecord(metadata?.trainingDraft);
      if (asString(trainingDraft?.draftId) !== draftId) {
        continue;
      }
      if (result.error) {
        continue;
      }
      if (!result.output || typeof result.output !== 'object' || Array.isArray(result.output)) {
        continue;
      }
      const output = result.output as Record<string, unknown>;
      const cell = asRecord(output.cell);
      const cellId = typeof output.cellId === 'string'
        ? output.cellId
        : typeof cell?.cellId === 'string'
          ? cell.cellId
          : null;
      if (!cellId || draftCellIds.has(cellId)) {
        continue;
      }
      draftCellIds.add(cellId);
      successfulWriteCount += 1;
      continue;
    }

    if (call.tool !== 'run_cell') {
      continue;
    }
    const callArgs = asRecord(call.args);
    const cellId = asString(callArgs?.cellId);
    if (!cellId || !draftCellIds.has(cellId)) {
      continue;
    }
    runResults.push(result);
  }

  return { successfulWriteCount, runResults };
}

function scopeTrainingResultsToActiveExecutionWindow(
  currentTurnResults: WorkflowGraphState['toolResultHistory']
): WorkflowGraphState['toolResultHistory'] {
  for (let index = currentTurnResults.length - 1; index >= 0; index -= 1) {
    const result = currentTurnResults[index];
    if (result.tool !== 'register_model' || result.error) {
      continue;
    }
    return currentTurnResults.slice(index);
  }
  return currentTurnResults;
}

function hasExhaustedTrainingDraftWithoutCompletion(state: WorkflowGraphState): boolean {
  const draftSummary = extractTrainingDraftSegmentCount(state.toolCallHistory, state.turnStartToolCallCount);
  if (!draftSummary || draftSummary.segmentCount === 0) {
    return false;
  }

  const { successfulWriteCount, runResults } = extractTrainingDraftActivity(state, draftSummary.draftId);
  if (successfulWriteCount < draftSummary.segmentCount) {
    return false;
  }

  const hasCompletedMarker = runResults.some((result) => {
    if (!result.output || typeof result.output !== 'object' || Array.isArray(result.output)) {
      return false;
    }
    const output = result.output as Record<string, unknown>;
    return output.status === 'success'
      && typeof output.stdout === 'string'
      && output.stdout.includes('__TRAIN_COMPLETE__|');
  });
  if (hasCompletedMarker) {
    return false;
  }

  return runResults.length >= successfulWriteCount;
}

export function resolveTrainingLifecycleNode(
  state: WorkflowGraphState,
  currentTurnResults: WorkflowGraphState['toolResultHistory']
): string {
  const trainingPhase = getPhaseConfig('training');
  const lifecycleStageNames = new Set((trainingPhase?.lifecycle ?? []).map((stage) => stage.name));
  const currentNode = state.run.currentNode;
  const currentNodeIsValid = typeof currentNode === 'string' && lifecycleStageNames.has(currentNode);
  const stageScopedResults = scopeTrainingResultsToActiveExecutionWindow(currentTurnResults);
  const nextStage = trainingPhase?.resolveNextStage(state.run.currentNode, stageScopedResults);
  const hasConfiguredExperimentsAwaitingProposal = (() => {
    const experiments = asRecord(state.run.metadata?.experiments);
    if (!experiments) {
      return false;
    }
    return Object.values(experiments).some((value) => {
      const experiment = asRecord(value);
      return asString(experiment?.status) === 'configured';
    });
  })();
  const inferResumeStageFromHistory = (): string => {
    const fullResults = state.toolResultHistory;
    if (hasConfiguredExperimentsAwaitingProposal) {
      return 'propose_model';
    }
    for (let index = fullResults.length - 1; index >= 0; index -= 1) {
      const result = fullResults[index];
      if (result.tool === 'register_model') {
        if (result.error) {
          continue;
        }
        return 'register_model';
      }
      if (result.tool === 'evaluate_results') {
        if (result.error) {
          return 'evaluate_results';
        }
        return 'register_model';
      }
      if (result.tool === 'execute_training') {
        if (result.error) {
          return 'generate_code';
        }
        if (result.output && typeof result.output === 'object' && !Array.isArray(result.output)) {
          const record = result.output as Record<string, unknown>;
          const status = typeof record.status === 'string' ? record.status.toLowerCase() : '';
          if (status === 'failed' || status === 'error' || status === 'timeout') {
            return 'generate_code';
          }
        }
        return 'evaluate_results';
      }
      if (result.tool === 'run_cell') {
        if (result.error) {
          return 'generate_code';
        }
        const output = result.output;
        if (output && typeof output === 'object' && !Array.isArray(output)) {
          const record = output as Record<string, unknown>;
          if (record.status === 'failed' || record.status === 'error' || record.status === 'timeout') {
            return 'generate_code';
          }
          if (record.status === 'success' && typeof record.stdout === 'string' && record.stdout.includes('__TRAIN_COMPLETE__|')) {
            return 'execute_training';
          }
        }
      }
      if (result.tool === 'propose_training_plan') {
        if (result.error) {
          return 'propose_model';
        }
        return 'generate_code';
      }
      if (result.tool === 'configure_experiment') {
        if (result.error) {
          continue;
        }
        return 'propose_model';
      }
    }
    return 'configure_experiment';
  };

  if (state.iteration === 0) {
    const startingStatus = typeof state.run.metadata?.workflowTurnStartStatus === 'string'
      ? state.run.metadata.workflowTurnStartStatus
      : state.run.status;

    // Resumed training turns (typically after approval pause) must continue
    // from the next lifecycle stage, not restart configuration.
    if (startingStatus === 'paused') {
      if (hasConfiguredExperimentsAwaitingProposal) {
        return 'propose_model';
      }
      if (typeof nextStage === 'string' && lifecycleStageNames.has(nextStage)) {
        return nextStage;
      }
      if (currentNodeIsValid) {
        return currentNode;
      }
      return inferResumeStageFromHistory();
    }
    if (startingStatus === 'failed_retryable' || startingStatus === 'failed') {
      if (hasConfiguredExperimentsAwaitingProposal) {
        return 'propose_model';
      }
      const inferredStage = inferResumeStageFromHistory();
      if (typeof inferredStage === 'string' && lifecycleStageNames.has(inferredStage)) {
        return inferredStage;
      }
      if (typeof nextStage === 'string' && lifecycleStageNames.has(nextStage)) {
        return nextStage;
      }
      if (currentNodeIsValid) {
        return currentNode;
      }
      return 'generate_code';
    }
    return 'configure_experiment';
  }

  if (hasExhaustedTrainingDraftWithoutCompletion(state)) {
    return 'generate_code';
  }

  if (typeof nextStage === 'string' && lifecycleStageNames.has(nextStage)) {
    return nextStage;
  }
  if (currentNodeIsValid) {
    return currentNode;
  }
  return inferResumeStageFromHistory();
}

export function shouldAllowFeatureCheckpointTool(
  toolResults: WorkflowGraphState['toolResultHistory'],
  prompt: string | undefined
): boolean {
  const selectedFeatureIds = extractSelectedFeatureIds(prompt);
  if (selectedFeatureIds.length === 0) {
    return true;
  }

  const stageByFeature = new Map<string, number>(selectedFeatureIds.map((id) => [id, -1]));
  const stageByTool: Record<string, number> = {
    propose_feature: 0,
    materialize_feature_code: 1,
    execute_feature: 2,
    validate_feature: 3,
    register_feature: 4
  };

  for (const result of toolResults) {
    if (result.error) {
      continue;
    }

    const featureId = extractFeatureIdFromToolResult(result);
    if (!featureId || !stageByFeature.has(featureId)) {
      continue;
    }

    const stage = stageByTool[result.tool];
    if (typeof stage !== 'number') {
      continue;
    }

    if (stage === stageByTool.register_feature && isRejectedRegisterResult(result)) {
      continue;
    }

    const prev = stageByFeature.get(featureId) ?? -1;
    if (stage > prev) {
      stageByFeature.set(featureId, stage);
    }
  }

  return selectedFeatureIds.every((id) => (stageByFeature.get(id) ?? -1) >= 4);
}

/** Maximum number of non-proposal call/result pairs retained in the
 *  feature_engineering conversation history per turn. propose_feature
 *  pairs are ALWAYS retained regardless of this cap so the LLM never
 *  loses sight of which features it is iterating on mid-loop. */
export const MAX_FE_HISTORY_PAIRS = 16;

/**
 * Trim the feature_engineering conversation history while preserving
 * enough context for multi-feature loops. The previous implementation
 * used a plain `slice(-8)` which could drop propose_feature entries
 * during long runs (3 features × ~7 tool pairs each > 8), and the LLM
 * would then stall mid-loop with text-only output instead of tool calls.
 *
 * Strategy:
 * - Filter out get_dataset_profile noise (dataset context is in the
 *   user message already).
 * - When restricted to proposal-mode, return everything (no trim).
 * - Otherwise, keep ALL propose_feature pairs unconditionally, plus the
 *   most recent MAX_FE_HISTORY_PAIRS non-proposal pairs. Preserve the
 *   original chronological order.
 */
export function trimFeatureEngineeringHistory<
  Call extends { name: string },
  Result
>(
  historyCalls: readonly Call[],
  historyResults: readonly (Result | undefined)[],
  restrictToProposalMode: boolean
): { calls: Call[]; results: Result[] } {
  const indexedPairs: { call: Call; result: Result; index: number }[] = [];
  for (let i = 0; i < historyCalls.length; i += 1) {
    const call = historyCalls[i];
    const result = historyResults[i];
    if (result === undefined) continue;
    if (call.name === 'get_dataset_profile') continue;
    indexedPairs.push({ call, result, index: i });
  }

  let trimmedPairs: typeof indexedPairs;
  if (restrictToProposalMode) {
    trimmedPairs = indexedPairs;
  } else {
    const proposalPairs = indexedPairs.filter(({ call }) => call.name === 'propose_feature');
    const nonProposalPairs = indexedPairs.filter(({ call }) => call.name !== 'propose_feature');
    const recentNonProposalPairs = nonProposalPairs.slice(-MAX_FE_HISTORY_PAIRS);
    trimmedPairs = [...proposalPairs, ...recentNonProposalPairs].sort((a, b) => a.index - b.index);
  }

  return {
    calls: trimmedPairs.map(({ call }) => call),
    results: trimmedPairs.map(({ result }) => result)
  };
}

export async function buildPhaseRequest(state: WorkflowGraphState): Promise<Partial<WorkflowGraphState>> {
  const turn = state.turn;
  const dataset = turn.datasetId ? await datasetRepository.getById(turn.datasetId) : undefined;
  const project = await projectRepository.getById(turn.projectId);
  const projectPlan = typeof project?.metadata?.projectPlan === 'string'
    ? project.metadata.projectPlan
    : undefined;
  const ragSnippets = await loadRagSnippets(turn.projectId, turn.prompt ?? dataset?.filename ?? turn.phase);
  const modelOverride = turn.model && turn.model !== 'auto' ? turn.model : undefined;

  const toolCallHistory = state.toolCallHistory.map((call) => ({
    name: call.tool,
    args: call.args ?? {},
    thoughtSignature: call.thoughtSignature
  }));
  const toolResultHistory = state.toolResultHistory.map((result) => ({
    name: result.tool,
    response: result.error ? { error: result.error } : { output: result.output }
  }));

  if (turn.phase === 'preprocessing') {
    if (!dataset) {
      return {
        nextStep: 'fail',
        errorMessage: 'Dataset not found.',
        errorCode: 'DATASET_NOT_FOUND'
      };
    }

    // Only preprocessing uses the controller client directly; other phases
    // construct their LLM client in modelTurnCollector.invokeModelNode.
    const client = createLlmClient(
      modelOverride,
      turn.reasoningEffort ? env.preprocessingThinkingLlmTimeoutMs : undefined
    );

    const controllerDecision = await resolvePreprocessingControllerTurn({
      client,
      dataset,
      prompt: turn.prompt,
      continuation: shouldContinuePreprocessingTurn(state),
      projectPlan,
      ragSnippets,
      toolResults: state.toolResultHistory,
      toolCallHistory,
      toolResultHistory,
      reasoningEffort: turn.reasoningEffort,
      threadId: state.run.threadId
    });

    return {
      nextStep: 'invoke_model',
      request: controllerDecision.request,
      controllerSummary: controllerDecision.summary as unknown as Record<string, unknown>,
      run: {
        ...state.run,
        currentNode: controllerDecision.summary.currentNode,
        activeDatasetId: turn.datasetId,
        activeNotebookId: turn.notebookId,
        threadId: controllerDecision.summary.threadId
      }
    };
  }

  if (turn.phase === 'onboarding') {
    const [datasets, documents] = await Promise.all([
      datasetRepository.list(),
      listProjectDocuments(turn.projectId)
    ]);
    const projectDatasets = datasets.filter((d) => d.projectId === turn.projectId);

    const fileSummaries = [
      ...projectDatasets.map((d) => ({
        filename: d.filename,
        type: 'dataset' as const,
        stats: {
          datasetId: d.datasetId,
          nRows: d.nRows,
          nCols: d.nCols,
          columns: d.columns.map((c) => ({ name: c.name, dtype: c.dtype }))
        }
      })),
      ...documents.map((d) => ({
        filename: d.filename,
        type: 'document' as const,
        stats: {
          documentId: d.documentId,
          mimeType: d.mimeType
        }
      }))
    ];

    const ragQuery = [
      turn.userIntent,
      ...(turn.questionAnswers?.map((entry) =>
        `${entry.questionId}: ${Array.isArray(entry.answer) ? entry.answer.join(', ') : entry.answer}`
      ) ?? [])
    ]
      .filter(Boolean)
      .join('\n')
      .trim();

    const onboardingRagSnippets = documents.length > 0
      ? await loadRagSnippets(turn.projectId, ragQuery)
      : [];

    const onboardingRequest = buildOnboardingRequest({
      projectTitle: project?.name ?? '',
      projectDescription: project?.description ?? '',
      fileSummaries,
      userIntent: turn.userIntent,
      questionAnswers: turn.questionAnswers,
      ragSnippets: onboardingRagSnippets,
      round: turn.round ?? 0,
      toolCallHistory,
      toolResultHistory,
      toolDefinitions: LLM_ONBOARDING_TOOLS,
      reasoningEffort: turn.reasoningEffort
    });

    return {
      nextStep: 'invoke_model',
      request: onboardingRequest,
      run: {
        ...state.run,
        currentNode: 'onboarding_converse'
      }
    };
  }

  if (!dataset) {
    return {
      nextStep: 'fail',
      errorMessage: 'datasetId is required for this workflow phase.',
      errorCode: 'DATASET_REQUIRED'
    };
  }

  if (turn.phase === 'feature_engineering') {
    // Build conversation history for the feature engineering model:
    // - Exclude get_dataset_profile pairs: dataset columns/types/sample are already in the
    //   user message via the dataset parameter. Including profile results causes either
    //   oversized context or a re-profiling loop (model sees no history entry but the
    //   user message says results are available, so it re-calls the tool).
    // - Limit to the most recent 8 pairs to prevent context explosion on long pipelines.
    const featureRawToolResults = state.toolResultHistory.filter(
      (r) => r.tool !== 'get_dataset_profile'
    );
    const currentTurnResults = selectCurrentTurnFeatureToolResults(
      state.toolResultHistory,
      state.turnStartToolCallCount
    );
    const currentTurnCalls = selectCurrentTurnFeatureToolCalls(
      state.toolCallHistory,
      state.turnStartToolCallCount
    );
    const selectedFeatureIds = extractSelectedFeatureIds(turn.prompt);
    const restrictToProposalMode = shouldRestrictFeatureToolsToProposalMode(featureRawToolResults, turn.prompt);

    // For proposal-mode prompts (no selected feature IDs), only use current-turn
    // lifecycle context so old checkpoint/register history does not hijack the
    // continuation directive for a brand new user request.
    const historyOffset = restrictToProposalMode ? state.turnStartToolCallCount : 0;
    const historyCalls = toolCallHistory.slice(historyOffset);
    const historyResults = toolResultHistory.slice(historyOffset);

    const { calls: featureToolCallHistory, results: featureToolResultHistory } = trimFeatureEngineeringHistory(
      historyCalls,
      historyResults,
      restrictToProposalMode
    );
    const featureRequestToolResults = selectFeatureRequestToolResults(
      state.toolResultHistory,
      state.turnStartToolCallCount,
      turn.prompt
    );

    // When the lifecycle is complete (checkpoint was the last lifecycle tool
    // IN THIS TURN), skip the model invocation.  Only check results from the
    // current turn — a checkpoint from a previous turn must NOT block new work.
    const LIFECYCLE_TERMINAL_TOOLS = new Set(['checkpoint_feature_pipeline']);
    const lastLifecycleToolThisTurn = [...currentTurnResults].reverse().find(
      (r) => ['propose_feature', 'materialize_feature_code', 'execute_feature',
        'validate_feature', 'register_feature', 'checkpoint_feature_pipeline'].includes(r.tool)
    );
    if (lastLifecycleToolThisTurn && LIFECYCLE_TERMINAL_TOOLS.has(lastLifecycleToolThisTurn.tool) && !lastLifecycleToolThisTurn.error) {
      return {
        nextStep: 'complete',
        request: null,
        run: {
          ...state.run,
          currentNode: 'continue_feature_pipeline',
          activeDatasetId: turn.datasetId,
          activeNotebookId: turn.notebookId
        }
      };
    }

    // Pause after proposals unless the user explicitly asked for implementation.
    // Only check THIS turn's lifecycle results so previous turns don't interfere.
    const currentTurnLifecycleResults = currentTurnResults.filter(
      (r) => ['propose_feature', 'materialize_feature_code', 'execute_feature',
        'validate_feature', 'register_feature', 'checkpoint_feature_pipeline'].includes(r.tool)
    );
    const allProposals = currentTurnLifecycleResults.length > 0 && currentTurnLifecycleResults.every((r) => r.tool === 'propose_feature');
    if (allProposals) {
      if (selectedFeatureIds.length === 0) {
        // Build feature_suggestion UI items from the proposal results so the
        // user gets interactive cards with Enable/Disable toggles.  This is
        // deterministic — no LLM call needed for the render_ui step.
        const proposalItems = buildFeatureProposalItems({
          results: currentTurnLifecycleResults,
          calls: currentTurnCalls
        });

        return {
          nextStep: 'complete',
          request: null,
          uiPayload: proposalItems.length > 0
            ? {
                version: '1' as const,
                kind: 'feature_engineering' as const,
                title: 'Proposed Features',
                summary: `${proposalItems.length} feature(s) proposed. Enable the ones you want, then ask me to implement them.`,
                sections: [{
                  id: 'proposals',
                  title: 'Feature Proposals',
                  items: proposalItems
                }]
              }
            : null,
          run: {
            ...state.run,
            currentNode: 'continue_feature_pipeline',
            activeDatasetId: turn.datasetId,
            activeNotebookId: turn.notebookId
          }
        };
      }
    }

    let continueTools = LLM_FEATURE_CONTINUE_TOOLS;
    if (!shouldAllowFeatureProposeTool(turn.prompt)) {
      continueTools = continueTools.filter((tool) => tool.name !== 'propose_feature');
    }
    if (!shouldAllowFeatureCheckpointTool(featureRawToolResults, turn.prompt)) {
      continueTools = continueTools.filter((tool) => tool.name !== 'checkpoint_feature_pipeline');
    }

    return {
      nextStep: 'invoke_model',
      request: buildFeatureEngineeringRequest({
        dataset,
        targetColumn: turn.targetColumn,
        prompt: turn.prompt,
        projectPlan,
        ragSnippets,
        toolResults: featureRequestToolResults,
        toolCallHistory: featureToolCallHistory,
        toolResultHistory: featureToolResultHistory,
        featureMethods: [...FEATURE_METHODS],
        // Require explicit selected feature IDs before unlocking lifecycle
        // implementation tools. Without selection, remain in proposal/review.
        toolDefinitions: restrictToProposalMode
          ? LLM_FEATURE_PROPOSAL_TOOLS
          : continueTools,
        reasoningEffort: turn.reasoningEffort
      }),
      run: {
        ...state.run,
        // Always use continue_feature_pipeline (text mode). Dataset columns,
        // types, and sample rows are already in the user message, so the
        // plan_feature_pipeline deterministic profile step is not needed.
        currentNode: 'continue_feature_pipeline',
        activeDatasetId: turn.datasetId,
        activeNotebookId: turn.notebookId
      }
    };
  }

  // Feature engineering approval is informational — it does not block training.
  // Users can proceed to training with or without an approved FE pipeline.

  const featureSpecs = (
    Array.isArray(project?.metadata?.features)
      ? (project.metadata.features as unknown[]).filter(
          (f): f is FeatureSpec =>
            typeof f === 'object' && f !== null &&
            typeof (f as FeatureSpec).sourceColumn === 'string' &&
            typeof (f as FeatureSpec).featureName === 'string' &&
            typeof (f as FeatureSpec).method === 'string' &&
            (f as FeatureSpec).enabled !== false
        )
      : []
  );
  const projectDatasets = await datasetRepository.listByProject(turn.projectId);
  const selectionMismatch = detectTrainingSelectionMismatch({
    prompt: turn.prompt,
    dataset,
    selectedTargetColumn: turn.targetColumn,
    availableDatasets: projectDatasets
  });
  if (selectionMismatch) {
    return {
      nextStep: 'fail',
      errorMessage: selectionMismatch.message,
      errorCode: 'TRAINING_SELECTION_MISMATCH',
      run: {
        ...state.run,
        currentNode: 'configure_experiment',
        activeDatasetId: turn.datasetId,
        activeNotebookId: turn.notebookId
      }
    };
  }

  // Resolve the current training lifecycle stage so that stage-based tool
  // filtering in the PhaseConfig can restrict which tools the LLM may call.
  const currentTurnResults = state.toolResultHistory.slice(state.turnStartToolCallCount);

  // When register_model was the last lifecycle tool this turn, the training
  // lifecycle is complete. Skip the LLM invocation — the frontend already
  // renders a ModelSavedCard from the tool_executed event. This mirrors FE's
  // checkpoint_feature_pipeline terminal detection at lines 392-408 above.
  const TRAINING_LIFECYCLE_TOOLS_LIST = ['configure_experiment', 'propose_training_plan',
    'execute_training', 'evaluate_results', 'register_model', 'compare_models'];
  const lastTrainingLifecycleTool = [...currentTurnResults].reverse().find(
    (r) => TRAINING_LIFECYCLE_TOOLS_LIST.includes(r.tool)
  );
  if (
    lastTrainingLifecycleTool?.tool === 'register_model'
    && !lastTrainingLifecycleTool.error
    && !hasPendingApprovedTrainingExperiments(state.run, turn.prompt)
  ) {
    return {
      nextStep: 'complete',
      request: null,
      run: {
        ...state.run,
        currentNode: 'register_model',
        activeDatasetId: turn.datasetId,
        activeNotebookId: turn.notebookId
      }
    };
  }

  const trainingNode = resolveTrainingLifecycleNode(state, currentTurnResults);

  return {
    nextStep: 'invoke_model',
    request: buildTrainingRequest({
      dataset,
      targetColumn: turn.targetColumn,
      prompt: turn.prompt,
      projectPlan,
      ragSnippets,
      toolResults: currentTurnResults,
      featureSummary: turn.featureSummary,
      featureSpecs,
      currentNode: trainingNode,
      toolCallHistory,
      toolResultHistory,
      // Use LLM_TRAINING_LIFECYCLE_TOOLS which merges the 6 training lifecycle
      // tools (configure_experiment, propose_training_plan, execute_training,
      // evaluate_results, register_model, compare_models) with notebook + data
      // discovery tools. Without this, the streaming model only sees notebook
      // tools (from LLM_ALL_TOOLS) and literally cannot call lifecycle tools.
      toolDefinitions: LLM_TRAINING_LIFECYCLE_TOOLS,
      reasoningEffort: turn.reasoningEffort
    }),
    run: {
      ...state.run,
      currentNode: trainingNode,
      activeDatasetId: turn.datasetId,
      activeNotebookId: turn.notebookId
    }
  };
}
