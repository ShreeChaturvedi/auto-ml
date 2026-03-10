import { Router } from 'express';

import { env } from '../../config.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';
import { createProjectRepository } from '../../repositories/projectRepository.js';
import { buildTrainingRequest } from '../../services/llm/prompts.js';
import { LLM_ALL_TOOLS } from '../../services/llm/toolRegistry.js';
import { listMcpToolsForLlm } from '../../services/mcp/mcpAdapter.js';

import {
  getFeatureEngineeringGateState,
  loadRagSnippets,
  normalizeReasoningEffortInput,
  planSchema
} from './shared.js';
import { createLlmClient, streamLlmResponse } from './sseHelpers.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const projectRepository = createProjectRepository(env.storagePath);

async function resolveLlmToolDefinitions() {
  try {
    return await listMcpToolsForLlm();
  } catch {
    return LLM_ALL_TOOLS;
  }
}

export function createTrainingHandlerRouter(): Router {
  const router = Router();
  const llmClient = createLlmClient();

  router.post('/llm/training/stream', async (req, res) => {
    const parsed = planSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    }

    if (!parsed.data.datasetId) {
      return res.status(400).json({ error: 'datasetId is required' });
    }

    const dataset = await datasetRepository.getById(parsed.data.datasetId);
    if (!dataset) {
      return res.status(404).json({ error: 'Dataset not found' });
    }

    const ragSnippets = await loadRagSnippets(parsed.data.projectId, parsed.data.prompt ?? dataset.filename);
    const project = await projectRepository.getById(parsed.data.projectId);
    const feGate = getFeatureEngineeringGateState(project?.metadata);
    if (feGate.requiresApproval && !feGate.hasApprovedVersion) {
      return res.status(409).json({
        code: 'FE_PIPELINE_APPROVAL_REQUIRED',
        error: 'Training is blocked until an approved feature engineering pipeline is available.'
      });
    }

    const projectPlan = typeof project?.metadata?.projectPlan === 'string'
      ? project.metadata.projectPlan
      : undefined;
    const toolDefinitions = await resolveLlmToolDefinitions();

    const toolCallHistory = parsed.data.toolCalls?.map((call) => ({
      name: call.tool,
      args: call.args ?? {},
      thoughtSignature: call.thoughtSignature
    }));
    const toolResultHistory = parsed.data.toolResults?.map((result) => ({
      name: result.tool,
      response: result.error ? { error: result.error } : { output: result.output }
    }));
    const request = buildTrainingRequest({
      dataset,
      targetColumn: parsed.data.targetColumn,
      prompt: parsed.data.prompt,
      projectPlan,
      ragSnippets,
      toolResults: parsed.data.toolResults,
      featureSummary: parsed.data.featureSummary,
      toolCallHistory,
      toolResultHistory,
      toolDefinitions,
      reasoningEffort: normalizeReasoningEffortInput(parsed.data),
      enableThinking: parsed.data.enableThinking,
      thinkingLevel: parsed.data.thinkingLevel
    });

    const modelOverride = parsed.data.model && parsed.data.model !== 'auto'
      ? parsed.data.model
      : undefined;
    const client = modelOverride ? createLlmClient(modelOverride) : llmClient;
    await streamLlmResponse(res, client, request, 'training');
  });

  return router;
}
