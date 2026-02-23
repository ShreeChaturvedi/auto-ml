import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

import { Router, type Response } from 'express';
import { z } from 'zod';

import { env } from '../config.js';
import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { createProjectRepository } from '../repositories/projectRepository.js';
import { searchDocuments } from '../services/documentSearchService.js';
import { FEATURE_METHODS } from '../services/featureEngineering.js';
import {
  createLlmClient,
  createThinkingLlmClient,
  type LlmClient,
  type LlmRequest,
  type LlmThinkingLevel
} from '../services/llm/llmClient.js';
import { buildFeatureEngineeringRequest, buildOnboardingRequest, buildTrainingRequest } from '../services/llm/prompts.js';
import { LLM_ALL_TOOLS, LLM_ONBOARDING_TOOLS, LLM_RENDER_UI_TOOL, LLM_TOOL_DEFINITIONS } from '../services/llm/toolRegistry.js';
import { listMcpToolsForLlm, executeMcpTool } from '../services/mcp/mcpAdapter.js';
import { AskUserPayloadSchema, ToolCallSchema } from '../types/llm.js';
import type { LlmEnvelope } from '../types/llm.js';
import { UiSchema } from '../types/llmUi.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const projectRepository = createProjectRepository(env.storagePath);

const toolResultSchema = z.object({
  id: z.string().min(1),
  tool: ToolCallSchema.shape.tool,
  output: z.unknown().optional(),
  error: z.string().optional()
});

const thinkingLevelSchema = z.enum(['dynamic', 'low', 'medium', 'high']);

const planSchema = z.object({
  projectId: z.string().min(1),
  datasetId: z.string().optional(),
  targetColumn: z.string().optional(),
  prompt: z.string().optional(),
  toolCalls: z.array(ToolCallSchema).optional(),
  toolResults: z.array(toolResultSchema).optional(),
  featureSummary: z.string().optional(),
  enableThinking: z.boolean().optional(),
  thinkingLevel: thinkingLevelSchema.optional(),
  model: z.string().optional()
});

const onboardingSchema = z.object({
  projectId: z.string().min(1),
  userIntent: z.string().optional(),
  questionAnswers: z
    .array(
      z.object({
        questionId: z.string(),
        answer: z.union([z.string(), z.array(z.string())])
      })
    )
    .optional(),
  toolCalls: z.array(ToolCallSchema).optional(),
  toolResults: z.array(toolResultSchema).optional(),
  round: z.number().int().min(0).max(5).default(0),
  enableThinking: z.boolean().optional(),
  thinkingLevel: thinkingLevelSchema.optional(),
  model: z.string().optional()
});

function shouldUseThinkingClient(enableThinking?: boolean, thinkingLevel?: LlmThinkingLevel): boolean {
  if (enableThinking) {
    return true;
  }

  return thinkingLevel !== undefined && thinkingLevel !== 'dynamic';
}

const executeToolsSchema = z.object({
  projectId: z.string().min(1),
  toolCalls: z.array(ToolCallSchema)
});

export function createLlmRouter() {
  const router = Router();
  console.log('[DEBUG] createLlmRouter called, router created');
  const llmClient = createLlmClient();
  const thinkingLlmClient = createThinkingLlmClient();

  router.post('/llm/tools/execute', async (req, res) => {
    const parsed = executeToolsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid tool payload', details: parsed.error.issues });
    }

    const { projectId, toolCalls } = parsed.data;

    // Execute tools via MCP protocol
    const results = await Promise.all(
      toolCalls.map(async (call) => {
        const result = await executeMcpTool(projectId, call.tool, call.args ?? {});
        return {
          id: call.id,
          tool: call.tool,
          output: result.output,
          error: result.error
        };
      })
    );

    return res.json({ results });
  });

  router.get('/llm/tools', (_req, res) => {
    return res.json({ tools: LLM_TOOL_DEFINITIONS });
  });

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
      enableThinking: parsed.data.enableThinking,
      thinkingLevel: parsed.data.thinkingLevel
    });

    // Resolve model: 'auto' or absent = default, otherwise use override
    const modelOverride = parsed.data.model && parsed.data.model !== 'auto'
      ? parsed.data.model
      : undefined;
    const client = shouldUseThinkingClient(parsed.data.enableThinking, parsed.data.thinkingLevel)
      ? (modelOverride ? createThinkingLlmClient(modelOverride) : thinkingLlmClient)
      : (modelOverride ? createLlmClient(modelOverride) : llmClient);
    await streamLlmResponse(res, client, request, 'onboarding');
  });

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
      enableThinking: parsed.data.enableThinking,
      thinkingLevel: parsed.data.thinkingLevel
    });

    // Use thinking client if enabled; support per-request model override
    const modelOverride = parsed.data.model && parsed.data.model !== 'auto'
      ? parsed.data.model
      : undefined;
    const client = shouldUseThinkingClient(parsed.data.enableThinking, parsed.data.thinkingLevel)
      ? (modelOverride ? createThinkingLlmClient(modelOverride) : thinkingLlmClient)
      : (modelOverride ? createLlmClient(modelOverride) : llmClient);
    await streamLlmResponse(res, client, request, 'feature_engineering');
  });

  router.post('/llm/training/stream', async (req, res) => {
    const parsed = planSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    }

    if (!parsed.data.datasetId) {
      return res.status(400).json({ error: 'datasetId is required' });
    }

    console.log('[DEBUG][training/stream] enableThinking:', parsed.data.enableThinking, 'toolCalls count:', parsed.data.toolCalls?.length ?? 0);

    const dataset = await datasetRepository.getById(parsed.data.datasetId);
    if (!dataset) {
      return res.status(404).json({ error: 'Dataset not found' });
    }

    const ragSnippets = await loadRagSnippets(parsed.data.projectId, parsed.data.prompt ?? dataset.filename);
    const project = await projectRepository.getById(parsed.data.projectId);
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
      enableThinking: parsed.data.enableThinking,
      thinkingLevel: parsed.data.thinkingLevel
    });

    // Use thinking client if enabled; support per-request model override
    const modelOverride = parsed.data.model && parsed.data.model !== 'auto'
      ? parsed.data.model
      : undefined;
    const client = shouldUseThinkingClient(parsed.data.enableThinking, parsed.data.thinkingLevel)
      ? (modelOverride ? createThinkingLlmClient(modelOverride) : thinkingLlmClient)
      : (modelOverride ? createLlmClient(modelOverride) : llmClient);
    await streamLlmResponse(res, client, request, 'training');
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

  // Print all registered routes
  console.log('[DEBUG] Routes registered:', router.stack.map((r: { route?: { path?: string } }) => r.route?.path).filter(Boolean));

  return router;
}

async function resolveLlmToolDefinitions() {
  try {
    return await listMcpToolsForLlm();
  } catch {
    return LLM_ALL_TOOLS;
  }
}

async function listProjectDocuments(projectId: string) {
  if (!hasDatabaseConfiguration()) {
    return [];
  }
  const pool = getDbPool();
  const result = await pool.query(
    `SELECT document_id, filename, mime_type FROM documents WHERE project_id = $1 ORDER BY created_at DESC`,
    [projectId]
  );
  return result.rows.map((row) => ({
    documentId: row.document_id as string,
    filename: row.filename as string,
    mimeType: row.mime_type as string
  }));
}

async function loadRagSnippets(projectId: string, query: string) {
  if (!hasDatabaseConfiguration()) return [];
  if (!query.trim()) return [];
  const results = await searchDocuments({ projectId, query, limit: 4 });
  return results.map((result) => ({
    filename: result.filename,
    snippet: result.snippet
  }));
}

async function streamLlmResponse(
  res: Response,
  client: LlmClient,
  request: LlmRequest,
  kind: 'feature_engineering' | 'training' | 'onboarding'
) {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const requestId = randomUUID().slice(0, 8);
  const toolCalls: z.infer<typeof ToolCallSchema>[] = [];
  let askUserPayload: z.infer<typeof AskUserPayloadSchema> | null = null;
  let uiEnvelope: LlmEnvelope | null = null;
  let tokenChars = 0;
  let tokenPreview = '';

  const writeEvent = (payload: Record<string, unknown>) => {
    res.write(`${JSON.stringify(payload)}\n`);
  };

  try {
    await client.stream(request, {
      onToken: (token) => {
        // DEBUG: Log actual token content to see if newlines are present
        console.log('[DEBUG][onToken] Token received:', JSON.stringify(token));
        tokenChars += token.length;
        if (tokenPreview.length < 600) {
          tokenPreview = `${tokenPreview}${token}`.slice(0, 600);
        }
        writeEvent({ type: 'token', text: token });
      },
      onThinking: (text) => {
        writeEvent({ type: 'thinking', text });
      },
      onToolCall: (call) => {
        if (call.name === 'ask_user') {
          const parsedAskUser = AskUserPayloadSchema.safeParse(call.args);
          if (!parsedAskUser.success) {
            writeEvent({ type: 'error', message: 'ask_user payload failed validation.' });
            return;
          }
          askUserPayload = parsedAskUser.data;
          return;
        }

        if (call.name === LLM_RENDER_UI_TOOL.name) {
          const rawArgs = call.args ?? {};
          let uiPayload: unknown = undefined;

          // Step 1: Prefer payload (stringified JSON) - this is the expected path now
          if (typeof rawArgs.payload === 'string' && rawArgs.payload.trim()) {
            try {
              uiPayload = JSON.parse(rawArgs.payload);
            } catch (parseErr) {
              console.warn('[llm] render_ui payload JSON parse failed:', parseErr);
            }
          }

          // Step 2: Fallback to ui object if payload parsing failed
          if (!uiPayload && rawArgs.ui) {
            uiPayload = rawArgs.ui;
          }

          // Step 3: Check if rawArgs itself looks like a UI schema (defensive)
          if (!uiPayload && typeof rawArgs === 'object' && rawArgs !== null) {
            const maybeUi = rawArgs as Record<string, unknown>;
            if ('version' in maybeUi && 'sections' in maybeUi) {
              uiPayload = rawArgs;
            }
          }

          // Step 4: If uiPayload is still a string, try parsing again
          if (typeof uiPayload === 'string') {
            try {
              uiPayload = JSON.parse(uiPayload);
            } catch {
              console.warn('[llm] render_ui double-string parse failed');
              uiPayload = undefined;
            }
          }
          const normalizedUi = normalizeUiPayload(uiPayload, kind);
          const parsed = z
            .object({
              ui: UiSchema,
              message: z.string().optional()
            })
            .safeParse({
              ui: normalizedUi,
              message: typeof rawArgs.message === 'string' ? rawArgs.message : undefined
            });
          if (!parsed.success) {
            console.warn(`[llm] ${kind} render_ui validation failed`, {
              error: parsed.error.issues.map((issue) => issue.message),
              payloadPreview: JSON.stringify(call.args).slice(0, 1200)
            });
            writeEvent({ type: 'error', message: 'LLM render_ui payload failed validation.' });
            return;
          }
          uiEnvelope = {
            version: '1',
            kind,
            message: parsed.data.message,
            ui: parsed.data.ui
          };
          return;
        }

        const normalizedArgs =
          call.args && typeof call.args === 'object' ? { ...(call.args as Record<string, unknown>) } : {};
        const rationale =
          typeof normalizedArgs.rationale === 'string' ? normalizedArgs.rationale : undefined;
        if ('rationale' in normalizedArgs) {
          delete normalizedArgs.rationale;
        }
        const parsed = ToolCallSchema.safeParse({
          id: randomUUID(),
          tool: call.name,
          args: normalizedArgs,
          rationale,
          thoughtSignature: call.thoughtSignature
        });
        if (!parsed.success) {
          writeEvent({ type: 'error', message: `Unsupported tool call: ${call.name}` });
          return;
        }
        toolCalls.push(parsed.data);
      }
    });

    // DEBUG: Log what we're about to send
    console.log(`[DEBUG][llm.ts] Response summary: uiEnvelope=${!!uiEnvelope}, toolCalls=${toolCalls.length}, tokenChars=${tokenChars}`);
    if (toolCalls.length > 0) {
      console.log(`[DEBUG][llm.ts] Tool calls to send:`, JSON.stringify(toolCalls, null, 2));
    }

    if (askUserPayload) {
      writeEvent({
        type: 'envelope',
        envelope: {
          version: '1',
          kind,
          ask_user: askUserPayload,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          ui: null
        }
      });
    } else if (uiEnvelope) {
      console.log(`[DEBUG][llm.ts] Sending UI envelope`);
      writeEvent({ type: 'envelope', envelope: uiEnvelope });
    } else if (toolCalls.length > 0) {
      console.log(`[DEBUG][llm.ts] Sending tool_calls envelope with ${toolCalls.length} calls`);
      writeEvent({
        type: 'envelope',
        envelope: {
          version: '1',
          kind,
          tool_calls: toolCalls,
          ui: null
        }
      });
    } else if (tokenChars > 0) {
      // Model responded with text only - send as text message
      console.log(`[DEBUG][llm.ts] Sending text-only envelope (model didn't use tools)`);
      writeEvent({
        type: 'envelope',
        envelope: {
          version: '1',
          kind,
          message: tokenPreview.trim(),
          tool_calls: undefined,
          ui: null
        }
      });
    } else {
      console.warn(`[llm] ${kind} ${requestId} empty response`, { tokenChars });
      writeEvent({ type: 'error', message: 'LLM returned empty response.' });
    }
    writeEvent({ type: 'done' });
    res.end();
  } catch (error) {
    writeEvent({
      type: 'error',
      message: error instanceof Error ? error.message : 'LLM request failed'
    });
    res.end();
  }
}

function normalizeUiPayload(payload: unknown, kind: 'feature_engineering' | 'training' | 'onboarding') {
  if (!payload || typeof payload !== 'object') {
    return { version: '1', kind, sections: [] };
  }
  const candidate = payload as Record<string, unknown>;
  const normalized = {
    version: candidate.version === '1' ? '1' : '1',
    kind: candidate.kind === 'feature_engineering' || candidate.kind === 'training' || candidate.kind === 'onboarding'
      ? candidate.kind
      : kind,
    title: typeof candidate.title === 'string' ? candidate.title : undefined,
    summary: typeof candidate.summary === 'string' ? candidate.summary : undefined,
    sections: Array.isArray(candidate.sections) ? candidate.sections : []
  };

  const parsed = UiSchema.safeParse(normalized);
  if (parsed.success) {
    return parsed.data;
  }

  return { version: '1', kind: normalized.kind, title: normalized.title, summary: normalized.summary, sections: [] };
}
