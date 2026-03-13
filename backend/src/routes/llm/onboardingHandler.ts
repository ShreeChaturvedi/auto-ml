import { Router } from 'express';

import { env } from '../../config.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';
import { createProjectRepository } from '../../repositories/projectRepository.js';
import { buildOnboardingRequest } from '../../services/llm/prompts.js';
import { LLM_ONBOARDING_TOOLS } from '../../services/llm/toolRegistry.js';

import { listProjectDocuments, loadRagSnippets, normalizeReasoningEffortInput, onboardingSchema } from './shared.js';
import { createLlmClient, streamLlmResponse } from './sseHelpers.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const projectRepository = createProjectRepository(env.storagePath);

export function createOnboardingHandlerRouter(): Router {
  const router = Router();
  const llmClient = createLlmClient();

  router.post('/llm/onboarding/stream', async (req, res) => {
    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    }

    const project = await projectRepository.getById(parsed.data.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const [datasets, documents] = await Promise.all([
      datasetRepository.list(),
      listProjectDocuments(parsed.data.projectId)
    ]);
    const projectDatasets = datasets.filter((dataset) => dataset.projectId === parsed.data.projectId);

    const fileSummaries = [
      ...projectDatasets.map((dataset) => ({
        filename: dataset.filename,
        type: 'dataset' as const,
        stats: {
          datasetId: dataset.datasetId,
          nRows: dataset.nRows,
          nCols: dataset.nCols,
          columns: dataset.columns.map((column) => ({ name: column.name, dtype: column.dtype }))
        }
      })),
      ...documents.map((document) => ({
        filename: document.filename,
        type: 'document' as const,
        stats: {
          documentId: document.documentId,
          mimeType: document.mimeType
        }
      }))
    ];

    const ragQuery = [
      parsed.data.userIntent,
      ...(parsed.data.questionAnswers?.map((entry) =>
        `${entry.questionId}: ${Array.isArray(entry.answer) ? entry.answer.join(', ') : entry.answer}`
      ) ?? [])
    ]
      .filter(Boolean)
      .join('\n')
      .trim();

    const ragSnippets = documents.length > 0
      ? await loadRagSnippets(parsed.data.projectId, ragQuery)
      : [];

    const toolCallHistory = parsed.data.toolCalls?.map((call) => ({
      name: call.tool,
      args: call.args ?? {}
    }));
    const toolResultHistory = parsed.data.toolResults?.map((result) => ({
      name: result.tool,
      response: result.error ? { error: result.error } : { output: result.output }
    }));

    const request = buildOnboardingRequest({
      projectTitle: project.name,
      projectDescription: project.description ?? '',
      fileSummaries,
      userIntent: parsed.data.userIntent,
      questionAnswers: parsed.data.questionAnswers,
      ragSnippets,
      round: parsed.data.round,
      toolCallHistory,
      toolResultHistory,
      toolDefinitions: LLM_ONBOARDING_TOOLS,
      reasoningEffort: normalizeReasoningEffortInput(parsed.data)
    });

    const modelOverride = parsed.data.model && parsed.data.model !== 'auto'
      ? parsed.data.model
      : undefined;
    const client = modelOverride ? createLlmClient(modelOverride) : llmClient;
    await streamLlmResponse(res, client, request, 'onboarding');
  });

  return router;
}
