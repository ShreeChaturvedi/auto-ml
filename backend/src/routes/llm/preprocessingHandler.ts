import fs from 'node:fs';

import { Router } from 'express';
import { z } from 'zod';

import { env } from '../../config.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';
import { createProjectRepository } from '../../repositories/projectRepository.js';
import {
  executePreprocessingTool,
  getPreprocessingRunSnapshot,
  isPreprocessingToolName,
  listPreprocessingRunSnapshots,
  markPreprocessingRunsInterrupted,
  syncPreprocessingLangGraphState
} from '../../services/llm/preprocessingGraph.js';
import { buildPreprocessingRequest } from '../../services/llm/prompts.js';
import { LLM_PREPROCESSING_TOOLS } from '../../services/llm/toolRegistry.js';
import { executeMcpTool } from '../../services/mcp/mcpAdapter.js';
import { ToolCallSchema } from '../../types/llm.js';

import { loadRagSnippets, normalizeReasoningEffortInput, planSchema, toolResultSchema } from './shared.js';
import { createLlmClient, streamLlmResponse } from './sseHelpers.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const projectRepository = createProjectRepository(env.storagePath);

const executeToolsSchema = z.object({
  projectId: z.string().min(1),
  notebookId: z.string().optional(),
  executionMode: z.enum(['agent', 'user_approval']).optional(),
  toolCalls: z.array(ToolCallSchema)
});

const preprocessingRunParamsSchema = z.object({
  runId: z.string().min(1)
});

const preprocessingRunQuerySchema = z.object({
  projectId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function extractPreprocessingRunIdsFromHistory(
  toolCalls: z.infer<typeof ToolCallSchema>[] | undefined,
  toolResults: z.infer<typeof toolResultSchema>[] | undefined
): string[] {
  const runIds = new Set<string>();

  for (const call of toolCalls ?? []) {
    const args = toRecord(call.args);
    const runId = toOptionalString(args?.runId);
    if (runId) {
      runIds.add(runId);
    }
  }

  for (const result of toolResults ?? []) {
    const output = toRecord(result.output);
    const runId = toOptionalString(output?.runId);
    if (runId) {
      runIds.add(runId);
    }
  }

  return [...runIds];
}

export function createPreprocessingHandlerRouter(): Router {
  const router = Router();

  router.post('/llm/tools/execute', async (req, res) => {
    const parsed = executeToolsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid tool payload', details: parsed.error.issues });
    }

    const { projectId, notebookId, toolCalls, executionMode } = parsed.data;

    const results = [];
    for (const call of toolCalls) {
      const preprocessingArgs = {
        ...(call.args ?? {}),
        toolCallId: call.id,
        approvalSource: executionMode === 'user_approval' ? 'user' : 'agent'
      };
      const result = isPreprocessingToolName(call.tool)
        ? await syncPreprocessingLangGraphState(
            projectId,
            call.tool,
            preprocessingArgs,
            await executePreprocessingTool(projectId, call.tool, preprocessingArgs)
          )
        : await executeMcpTool(projectId, call.tool, {
            ...(call.args ?? {}),
            ...(notebookId ? { notebookId } : {})
          });
      results.push({
        id: call.id,
        tool: call.tool,
        output: result.output,
        error: result.error
      });
    }

    return res.json({ results });
  });

  router.get('/llm/preprocessing/runs', async (req, res) => {
    const parsed = preprocessingRunQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    }

    const runs = await listPreprocessingRunSnapshots(parsed.data.projectId, parsed.data.limit);
    return res.json({
      projectId: parsed.data.projectId,
      count: runs.length,
      runs
    });
  });

  router.get('/llm/preprocessing/runs/:runId', async (req, res) => {
    const parsedParams = preprocessingRunParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsedParams.error.issues });
    }

    const run = await getPreprocessingRunSnapshot(parsedParams.data.runId);
    if (!run) {
      return res.status(404).json({ error: 'Preprocessing run not found' });
    }

    const projectIdQuery = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    if (projectIdQuery && run.projectId !== projectIdQuery) {
      return res.status(404).json({ error: 'Preprocessing run not found' });
    }

    return res.json({ run });
  });

  router.post('/llm/preprocessing/stream', async (req, res) => {
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

    const toolCallHistory = parsed.data.toolCalls?.map((call) => ({
      name: call.tool,
      args: call.args ?? {},
      thoughtSignature: call.thoughtSignature
    }));
    const toolResultHistory = parsed.data.toolResults?.map((result) => ({
      name: result.tool,
      response: result.error ? { error: result.error } : { output: result.output }
    }));

    const request = buildPreprocessingRequest({
      dataset,
      prompt: parsed.data.prompt,
      projectPlan,
      ragSnippets,
      toolResults: parsed.data.toolResults,
      toolCallHistory,
      toolResultHistory,
      toolDefinitions: LLM_PREPROCESSING_TOOLS,
      reasoningEffort: normalizeReasoningEffortInput(parsed.data),
      enableThinking: parsed.data.enableThinking,
      thinkingLevel: parsed.data.thinkingLevel
    });
    const hintedRunIds = extractPreprocessingRunIdsFromHistory(parsed.data.toolCalls, parsed.data.toolResults);

    const modelOverride = parsed.data.model && parsed.data.model !== 'auto'
      ? parsed.data.model
      : undefined;
    const client = createLlmClient(
      modelOverride,
      normalizeReasoningEffortInput(parsed.data)
        ? env.preprocessingThinkingLlmTimeoutMs
        : env.preprocessingLlmTimeoutMs
    );

    const markInterruptedRuns = async (
      reason: string,
      source: 'provider_error' | 'stream_aborted'
    ): Promise<void> => {
      if (hintedRunIds.length === 0) {
        return;
      }
      await markPreprocessingRunsInterrupted({
        projectId: parsed.data.projectId,
        runIds: hintedRunIds,
        reason,
        source
      });
    };

    await streamLlmResponse(res, client, request, 'preprocessing', {
      onError: async (message) => {
        await markInterruptedRuns(message, 'provider_error');
      },
      onAborted: async (message) => {
        await markInterruptedRuns(message, 'stream_aborted');
      }
    });
  });

  // DEBUG ENDPOINT
  router.post('/llm/debug', (req, res) => {
    const dumpPath = 'frontend_dump.json';
    try {
      fs.writeFileSync(dumpPath, JSON.stringify(req.body, null, 2));
      console.log('[DEBUG][Frontend Dump] Written to:', dumpPath);
    } catch (err) {
      console.error('[DEBUG][Frontend Dump] Write failed:', err);
    }
    res.status(200).send({ ok: true });
  });

  return router;
}
