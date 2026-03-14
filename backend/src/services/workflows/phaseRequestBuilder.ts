import { env } from '../../config.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';
import { createProjectRepository } from '../../repositories/projectRepository.js';
import {
  getFeatureEngineeringGateState,
  loadRagSnippets
} from '../../routes/llm/shared.js';
import { FEATURE_METHODS } from '../featureEngineering.js';
import { createLlmClient } from '../llm/llmClient.js';
import { resolvePreprocessingControllerTurn } from '../llm/preprocessing/controller.js';
import {
  buildFeatureEngineeringRequest,
  buildTrainingRequest
} from '../llm/prompts/index.js';
import { LLM_ALL_TOOLS, LLM_FEATURE_ENGINEERING_TOOLS } from '../llm/toolRegistry.js';
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

  if (!dataset) {
    return {
      nextStep: 'fail',
      errorMessage: 'datasetId is required for this workflow phase.',
      errorCode: 'DATASET_REQUIRED'
    };
  }

  if (turn.phase === 'feature_engineering') {
    return {
      nextStep: 'invoke_model',
      request: buildFeatureEngineeringRequest({
        dataset,
        targetColumn: turn.targetColumn,
        prompt: turn.prompt,
        projectPlan,
        ragSnippets,
        toolResults: state.toolResultHistory,
        toolCallHistory,
        toolResultHistory,
        featureMethods: [...FEATURE_METHODS],
        toolDefinitions: LLM_FEATURE_ENGINEERING_TOOLS,
        reasoningEffort: turn.reasoningEffort
      }),
      run: {
        ...state.run,
        currentNode: state.iteration === 0 ? 'plan_feature_pipeline' : 'continue_feature_pipeline',
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
