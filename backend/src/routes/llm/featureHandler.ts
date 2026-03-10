import { Router } from 'express';

import { env } from '../../config.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';
import { createProjectRepository } from '../../repositories/projectRepository.js';
import { FEATURE_METHODS } from '../../services/featureEngineering.js';
import { buildFeatureEngineeringRequest } from '../../services/llm/prompts.js';
import { LLM_FEATURE_ENGINEERING_TOOLS } from '../../services/llm/toolRegistry.js';

import { loadRagSnippets, normalizeReasoningEffortInput, planSchema } from './shared.js';
import { createLlmClient, streamLlmResponse } from './sseHelpers.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const projectRepository = createProjectRepository(env.storagePath);

export function createFeatureHandlerRouter(): Router {
  const router = Router();
  const llmClient = createLlmClient();

  router.post('/llm/feature-plan/stream', async (req, res) => {
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
    const projectPlan = typeof project?.metadata?.projectPlan === 'string'
      ? project.metadata.projectPlan
      : undefined;
    const toolDefinitions = LLM_FEATURE_ENGINEERING_TOOLS;
    const toolCallHistory = parsed.data.toolCalls?.map((call) => ({
      name: call.tool,
      args: call.args ?? {},
      thoughtSignature: call.thoughtSignature
    }));
    const toolResultHistory = parsed.data.toolResults?.map((result) => ({
      name: result.tool,
      response: result.error ? { error: result.error } : { output: result.output }
    }));
    const request = buildFeatureEngineeringRequest({
      dataset,
      targetColumn: parsed.data.targetColumn,
      prompt: parsed.data.prompt,
      projectPlan,
      ragSnippets,
      toolResults: parsed.data.toolResults,
      toolCallHistory,
      toolResultHistory,
      featureMethods: [...FEATURE_METHODS],
      toolDefinitions,
      reasoningEffort: normalizeReasoningEffortInput(parsed.data),
      enableThinking: parsed.data.enableThinking,
      thinkingLevel: parsed.data.thinkingLevel
    });

    const modelOverride = parsed.data.model && parsed.data.model !== 'auto'
      ? parsed.data.model
      : undefined;
    const client = modelOverride ? createLlmClient(modelOverride) : llmClient;
    await streamLlmResponse(res, client, request, 'feature_engineering');
  });

  return router;
}
