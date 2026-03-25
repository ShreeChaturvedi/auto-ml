import { env } from '../../config.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';
import { createProjectRepository } from '../../repositories/projectRepository.js';
import {
  getFeatureEngineeringGateState,
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
import { LLM_ALL_TOOLS, LLM_FEATURE_ENGINEERING_TOOLS, LLM_ONBOARDING_TOOLS } from '../llm/toolRegistry.js';
import { listMcpToolsForLlm } from '../mcp/mcpAdapter.js';

import type { WorkflowGraphState } from './graphState.js';
import { hasWorkflowHistory } from './history.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const projectRepository = createProjectRepository(env.storagePath);

function shouldContinuePreprocessingTurn(state: WorkflowGraphState): boolean {
  if (state.iteration > 0) {
    return true;
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

export async function buildPhaseRequest(state: WorkflowGraphState): Promise<Partial<WorkflowGraphState>> {
  const turn = state.turn;
  const dataset = turn.datasetId ? await datasetRepository.getById(turn.datasetId) : undefined;
  const project = await projectRepository.getById(turn.projectId);
  const projectPlan = typeof project?.metadata?.projectPlan === 'string'
    ? project.metadata.projectPlan
    : undefined;
  const ragSnippets = await loadRagSnippets(turn.projectId, turn.prompt ?? dataset?.filename ?? turn.phase);
  const modelOverride = turn.model && turn.model !== 'auto' ? turn.model : undefined;
  const client = createLlmClient(modelOverride, turn.reasoningEffort ? env.preprocessingThinkingLlmTimeoutMs : undefined);

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
    const MAX_FE_HISTORY_PAIRS = 8;
    const filteredPairs = toolCallHistory
      .map((call, i) => ({ call, result: toolResultHistory[i] }))
      .filter(({ call, result }) => call.name !== 'get_dataset_profile' && result !== undefined)
      .slice(-MAX_FE_HISTORY_PAIRS);
    const featureToolCallHistory = filteredPairs.map(({ call }) => call);
    const featureToolResultHistory = filteredPairs.map(({ result }) => result!);
    const featureRawToolResults = state.toolResultHistory.filter(
      (r) => r.tool !== 'get_dataset_profile'
    );
    return {
      nextStep: 'invoke_model',
      request: buildFeatureEngineeringRequest({
        dataset,
        targetColumn: turn.targetColumn,
        prompt: turn.prompt,
        projectPlan,
        ragSnippets,
        toolResults: featureRawToolResults,
        toolCallHistory: featureToolCallHistory,
        toolResultHistory: featureToolResultHistory,
        featureMethods: [...FEATURE_METHODS],
        toolDefinitions: LLM_FEATURE_ENGINEERING_TOOLS,
        reasoningEffort: turn.reasoningEffort
      }),
      run: {
        ...state.run,
        // Always use continue_feature_pipeline (text mode → main model). Dataset
        // columns, types, and sample rows are already in the user message, so the
        // plan_feature_pipeline deterministic profile step is not needed.
        currentNode: 'continue_feature_pipeline',
        activeDatasetId: turn.datasetId,
        activeNotebookId: turn.notebookId
      }
    };
  }

  const feGate = getFeatureEngineeringGateState(project?.metadata);
  if (feGate.requiresApproval && !feGate.hasApprovedVersion) {
    return {
      nextStep: 'fail',
      errorMessage: 'Training is blocked until an approved feature engineering pipeline is available.',
      errorCode: 'FE_PIPELINE_APPROVAL_REQUIRED'
    };
  }

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
      currentNode: state.iteration === 0 ? 'plan_training_workflow' : 'continue_training_workflow',
      activeDatasetId: turn.datasetId,
      activeNotebookId: turn.notebookId
    }
  };
}
