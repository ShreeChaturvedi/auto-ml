import { env } from '../../config.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';
import { createProjectRepository } from '../../repositories/projectRepository.js';
import {
  listProjectDocuments,
  loadRagSnippets
} from '../../routes/llm/shared.js';
import { FEATURE_METHODS } from '../featureEngineering.js';
import type { FeatureSpec } from '../featureEngineering.js';
import { createLlmClient } from '../llm/llmClient.js';
import { resolvePreprocessingControllerTurn } from '../llm/preprocessing/controller.js';
import {
  buildFeatureEngineeringRequest,
  buildOnboardingRequest,
  buildTrainingRequest
} from '../llm/prompts/index.js';
import { LLM_ALL_TOOLS, LLM_FEATURE_CONTINUE_TOOLS, LLM_FEATURE_PROPOSAL_TOOLS, LLM_ONBOARDING_TOOLS } from '../llm/toolRegistry.js';
import { listMcpToolsForLlm } from '../mcp/mcpAdapter.js';

import type { WorkflowGraphState } from './graphState.js';
import { hasWorkflowHistory } from './history.js';
import { getPhaseConfig } from './phaseConfig.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const projectRepository = createProjectRepository(env.storagePath);
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
  return shouldRestrictFeatureToolsToProposalMode(toolResults, prompt)
    ? toolResults.slice(turnStartToolCallCount)
    : toolResults;
}

export function shouldAllowFeatureProposeTool(prompt: string | undefined): boolean {
  return extractSelectedFeatureIds(prompt).length === 0;
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
    const currentTurnResults = featureRawToolResults.slice(state.turnStartToolCallCount);
    const selectedFeatureIds = extractSelectedFeatureIds(turn.prompt);
    const restrictToProposalMode = shouldRestrictFeatureToolsToProposalMode(featureRawToolResults, turn.prompt);

    // For proposal-mode prompts (no selected feature IDs), only use current-turn
    // lifecycle context so old checkpoint/register history does not hijack the
    // continuation directive for a brand new user request.
    const historyOffset = restrictToProposalMode ? state.turnStartToolCallCount : 0;
    const historyCalls = toolCallHistory.slice(historyOffset);
    const historyResults = toolResultHistory.slice(historyOffset);

    const MAX_FE_HISTORY_PAIRS = 8;
    const filteredPairs = historyCalls
      .map((call, i) => ({ call, result: historyResults[i] }))
      .filter(({ call, result }) => call.name !== 'get_dataset_profile' && result !== undefined);
    const trimmedPairs = restrictToProposalMode
      ? filteredPairs
      : filteredPairs.slice(-MAX_FE_HISTORY_PAIRS);

    const featureToolCallHistory = trimmedPairs.map(({ call }) => call);
    const featureToolResultHistory = trimmedPairs.map(({ result }) => result!);
    const featureRequestToolResults = selectFeatureRequestToolResults(
      featureRawToolResults,
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
        const proposalItems = currentTurnLifecycleResults
          .filter((r) => r.tool === 'propose_feature' && !r.error && r.output)
          .map((r) => {
            const out = r.output as Record<string, unknown>;
            const sourceColumns = Array.isArray(out.sourceColumns)
              ? (out.sourceColumns as unknown[]).filter((c): c is string => typeof c === 'string')
              : [];
            const secondaryColumn = sourceColumns.length > 1 ? sourceColumns[1] : undefined;
            return {
              type: 'feature_suggestion' as const,
              id: (out.featureId as string) ?? `feat-${Date.now()}`,
              feature: {
                sourceColumn: sourceColumns[0] ?? '',
                // Propagate the second source column for interaction features
                // (ratio, difference, product, groupby-shares) so the frontend
                // guard doesn't block them with a "needs secondary column" error.
                ...(secondaryColumn ? { secondaryColumn } : {}),
                featureName: (out.featureName as string) ?? 'unnamed',
                method: (out.method as string) ?? 'custom',
                params: (out.params && typeof out.params === 'object' && !Array.isArray(out.params)
                  ? out.params as Record<string, unknown>
                  : {})
              },
              rationale: (out.rationale as string) ?? (out.message as string) ?? '',
              impact: (['high', 'medium', 'low'].includes(out.impact as string) ? out.impact : 'medium') as 'high' | 'medium' | 'low'
            };
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

  // Resolve the current training lifecycle stage so that stage-based tool
  // filtering in the PhaseConfig can restrict which tools the LLM may call.
  let trainingNode: string;
  if (state.iteration === 0) {
    trainingNode = 'configure_experiment';
  } else {
    const trainingPhase = getPhaseConfig('training');
    const nextStage = trainingPhase?.resolveNextStage(state.run.currentNode, state.toolResultHistory);
    trainingNode = nextStage ?? state.run.currentNode;
  }

  return {
    nextStep: 'invoke_model',
    request: buildTrainingRequest({
      dataset,
      targetColumn: turn.targetColumn,
      prompt: turn.prompt,
      projectPlan,
      ragSnippets,
      toolResults: state.toolResultHistory,
      featureSummary: turn.featureSummary,
      featureSpecs,
      toolCallHistory,
      toolResultHistory,
      toolDefinitions: await listMcpToolsForLlm().catch(() => LLM_ALL_TOOLS),
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
