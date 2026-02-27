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
import { executePreprocessingTool, isPreprocessingToolName } from '../services/llm/preprocessingGraph.js';
import {
  buildFeatureEngineeringRequest,
  buildOnboardingRequest,
  buildPreprocessingRequest,
  buildTrainingRequest
} from '../services/llm/prompts.js';
import {
  LLM_ALL_TOOLS,
  LLM_FEATURE_ENGINEERING_TOOLS,
  LLM_ONBOARDING_TOOLS,
  LLM_PREPROCESSING_TOOLS,
  LLM_RENDER_UI_TOOL,
  LLM_TOOL_DEFINITIONS
} from '../services/llm/toolRegistry.js';
import { listMcpToolsForLlm, executeMcpTool } from '../services/mcp/mcpAdapter.js';
import { AskUserPayloadSchema, PlanExitPayloadSchema, ToolCallSchema } from '../types/llm.js';
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
  notebookId: z.string().optional(),
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

    const { projectId, notebookId, toolCalls } = parsed.data;

    const results = [];
    for (const call of toolCalls) {
      const result = isPreprocessingToolName(call.tool)
        ? await executePreprocessingTool(projectId, call.tool, call.args ?? {})
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
      enableThinking: parsed.data.enableThinking,
      thinkingLevel: parsed.data.thinkingLevel
    });

    const modelOverride = parsed.data.model && parsed.data.model !== 'auto'
      ? parsed.data.model
      : undefined;
    const client = shouldUseThinkingClient(parsed.data.enableThinking, parsed.data.thinkingLevel)
      ? (modelOverride ? createThinkingLlmClient(modelOverride) : thinkingLlmClient)
      : (modelOverride ? createLlmClient(modelOverride) : llmClient);
    await streamLlmResponse(res, client, request, 'preprocessing');
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

function getFeatureEngineeringGateState(metadata: unknown): {
  requiresApproval: boolean;
  hasApprovedVersion: boolean;
} {
  if (!metadata || typeof metadata !== 'object') {
    return { requiresApproval: false, hasApprovedVersion: false };
  }

  const record = metadata as Record<string, unknown>;
  const requiresApproval = record.feWorkflowVersion === 2;
  if (!requiresApproval) {
    return { requiresApproval: false, hasApprovedVersion: false };
  }

  const versions = Array.isArray(record.pipelineVersions) ? record.pipelineVersions : [];
  const hasApprovedVersion = versions.some((version) => {
    if (!version || typeof version !== 'object') {
      return false;
    }

    return (version as Record<string, unknown>).status === 'approved';
  });

  return { requiresApproval, hasApprovedVersion };
}

const EMPTY_RENDER_UI_FALLBACK_MESSAGE =
  'AI plan finished without visible output. Try again or refine your goal.';
const EMPTY_LLM_RESPONSE_FALLBACK_MESSAGE =
  'LLM did not return actionable output for this turn. Please retry with a more specific instruction.';
const FEATURE_ENGINEERING_FALLBACK_MESSAGE =
  'The model response was incomplete, so I generated a safe fallback feature-engineering summary.';

function buildFeatureEngineeringFallbackEnvelope(
  reason: 'empty_render_ui' | 'empty_response' | 'blank_text'
): LlmEnvelope {
  const reasonText = reason === 'empty_render_ui'
    ? 'The model returned an empty UI payload.'
    : reason === 'blank_text'
      ? 'The model emitted text tokens, but they were blank after trimming.'
      : 'The model did not emit usable tokens, tools, or UI.';

  return {
    version: '1',
    kind: 'feature_engineering',
    message: FEATURE_ENGINEERING_FALLBACK_MESSAGE,
    ui: {
      version: '1',
      kind: 'feature_engineering',
      title: 'Feature Engineering Fallback',
      sections: [
        {
          id: 'fallback-fe-summary',
          title: 'Recovered Guidance',
          layout: 'column',
          items: [
            {
              type: 'report',
              id: 'fallback-fe-report',
              title: 'What happened',
              content: `${reasonText}\n\nUse the quick actions below to continue without losing progress:\n1. Ask for candidate features.\n2. Ask for leakage-safe validation checks.\n3. Ask for a training-ready feature summary.`,
              format: 'markdown'
            },
            {
              type: 'callout',
              tone: 'info',
              text: 'No data was modified. You can immediately retry with the suggestion pills.'
            }
          ]
        }
      ]
    }
  };
}

async function streamLlmResponse(
  res: Response,
  client: LlmClient,
  request: LlmRequest,
  kind: 'feature_engineering' | 'training' | 'onboarding' | 'preprocessing'
) {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const requestId = randomUUID().slice(0, 8);
  const toolCalls: z.infer<typeof ToolCallSchema>[] = [];
  let askUserPayload: z.infer<typeof AskUserPayloadSchema> | null = null;
  let planExitPayload: z.infer<typeof PlanExitPayloadSchema> | null = null;
  let terminalToolConflict = false;
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
          if (planExitPayload) {
            terminalToolConflict = true;
            writeEvent({ type: 'error', message: 'Model emitted both ask_user and plan_exit in one response.' });
            return;
          }

          const parsedAskUser = AskUserPayloadSchema.safeParse(call.args);
          if (!parsedAskUser.success) {
            writeEvent({ type: 'error', message: 'ask_user payload failed validation.' });
            return;
          }
          askUserPayload = parsedAskUser.data;
          return;
        }

        if (call.name === 'plan_exit') {
          if (askUserPayload) {
            terminalToolConflict = true;
            writeEvent({ type: 'error', message: 'Model emitted both ask_user and plan_exit in one response.' });
            return;
          }

          const parsedPlanExit = PlanExitPayloadSchema.safeParse(call.args);
          if (!parsedPlanExit.success) {
            writeEvent({ type: 'error', message: 'plan_exit payload failed validation.' });
            return;
          }

          const normalizedPlanExit = normalizePlanExitPayload(parsedPlanExit.data);
          if (!normalizedPlanExit) {
            writeEvent({ type: 'error', message: 'plan_exit payload does not contain a valid plan.' });
            return;
          }

          planExitPayload = normalizedPlanExit;
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
          console.log(`[DEBUG][llm.ts] normalized render_ui sections=${normalizedUi.sections.length} items=${normalizedUi.sections.reduce((sum, section) => sum + section.items.length, 0)}`);
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
          const uiHasItems = parsed.data.ui.sections.some((section) => section.items.length > 0);
          const hasFallbackMessage = Boolean(parsed.data.message?.trim());
          if (!uiHasItems && !hasFallbackMessage) {
            if (kind === 'feature_engineering') {
              uiEnvelope = buildFeatureEngineeringFallbackEnvelope('empty_render_ui');
              return;
            }
            uiEnvelope = {
              version: '1',
              kind,
              message: EMPTY_RENDER_UI_FALLBACK_MESSAGE,
              ui: null
            };
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

    if (terminalToolConflict) {
      writeEvent({ type: 'done' });
      res.end();
      return;
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
    } else if (planExitPayload) {
      writeEvent({
        type: 'envelope',
        envelope: {
          version: '1',
          kind,
          plan_exit: planExitPayload,
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
      const trimmedPreview = tokenPreview.trim();
      if (!trimmedPreview) {
        if (kind === 'feature_engineering') {
          writeEvent({ type: 'envelope', envelope: buildFeatureEngineeringFallbackEnvelope('blank_text') });
        } else {
          writeEvent({
            type: 'envelope',
            envelope: {
              version: '1',
              kind,
              message: EMPTY_LLM_RESPONSE_FALLBACK_MESSAGE,
              ui: null
            }
          });
        }
        writeEvent({ type: 'done' });
        res.end();
        return;
      }
      // Model responded with text only - send as text message
      console.log(`[DEBUG][llm.ts] Sending text-only envelope (model didn't use tools)`);
      writeEvent({
        type: 'envelope',
        envelope: {
          version: '1',
          kind,
          message: trimmedPreview,
          tool_calls: undefined,
          ui: null
        }
      });
    } else {
      console.warn(`[llm] ${kind} ${requestId} empty response`, { tokenChars });
      if (kind === 'feature_engineering') {
        writeEvent({ type: 'envelope', envelope: buildFeatureEngineeringFallbackEnvelope('empty_response') });
      } else {
        writeEvent({
          type: 'envelope',
          envelope: {
            version: '1',
            kind,
            message: EMPTY_LLM_RESPONSE_FALLBACK_MESSAGE,
            ui: null
          }
        });
      }
    }
    writeEvent({ type: 'done' });
    res.end();
  } catch (error) {
    writeEvent({
      type: 'error',
      message: error instanceof Error ? error.message : 'LLM request failed'
    });
    writeEvent({ type: 'done' });
    res.end();
  }
}

const REQUIRED_PLAN_SECTION_PATTERNS = [
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?objective\b[:\s-]*/im,
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?(?:data\s+summary|data\s+overview)\b[:\s-]*/im,
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?approach\b[:\s-]*/im,
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?(?:feature\s+engineering\s+strategy|feature\s+engineering)\b[:\s-]*/im,
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?(?:target\s*(?:&|and)\s*evaluation|evaluation)\b[:\s-]*/im,
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?(?:risks?\s*(?:&|and)\s*assumptions?|assumptions?)\b[:\s-]*/im,
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?next\s+steps\b[:\s-]*/im
];

function normalizePlanFilename(rawName?: string): string {
  const trimmed = rawName?.trim() ?? '';
  const withoutExtension = trimmed.replace(/\.md$/i, '');
  const slug = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9-\s_]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);

  const fallback = `project-plan-${new Date().toISOString().slice(0, 10)}`;
  return `${slug || fallback}.md`;
}

function extractNormalizedPlanMarkdown(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }

  const markdownFenceMatch = trimmed.match(/```(?:markdown|md)?\s*([\s\S]*?)```/i);
  const unwrapped = markdownFenceMatch?.[1]?.trim() || trimmed;

  const projectPlanHeading = unwrapped.match(/^#\s+Project Plan\b.*$/m);
  const firstHeading = unwrapped.match(/^#\s+.+$/m);
  const headingMatch = projectPlanHeading ?? firstHeading;

  if (!headingMatch || headingMatch.index === undefined) {
    return null;
  }

  const candidate = unwrapped.slice(headingMatch.index).trim();
  if (!candidate.startsWith('#')) {
    return null;
  }

  const hasAllRequiredSections = REQUIRED_PLAN_SECTION_PATTERNS.every((pattern) => pattern.test(candidate));
  if (!hasAllRequiredSections) {
    return null;
  }

  return candidate;
}

function normalizePlanExitPayload(
  payload: z.infer<typeof PlanExitPayloadSchema>
): z.infer<typeof PlanExitPayloadSchema> | null {
  const planMarkdown = extractNormalizedPlanMarkdown(payload.planMarkdown);
  if (!planMarkdown) {
    return null;
  }

  const parsed = PlanExitPayloadSchema.safeParse({
    planName: normalizePlanFilename(payload.planName),
    planMarkdown
  });

  return parsed.success ? parsed.data : null;
}

function coerceLegacyUiItems(items: unknown[]): unknown[] {
  const coerced: unknown[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item || typeof item !== 'object') {
      continue;
    }

    const candidate = item as Record<string, unknown>;
    const type = typeof candidate.type === 'string' ? candidate.type : '';

    if (type === 'report') {
      const title = typeof candidate.title === 'string' ? candidate.title : 'Report';
      const content = typeof candidate.content === 'string' ? candidate.content : '';
      if (!content.trim()) continue;
      coerced.push({
        type: 'report',
        id: typeof candidate.id === 'string' ? candidate.id : `report-${index + 1}`,
        title,
        content,
        format: candidate.format === 'markdown' || candidate.format === 'json' ? candidate.format : 'text'
      });
      continue;
    }

    if (type === 'callout') {
      const text = typeof candidate.text === 'string' ? candidate.text : '';
      if (!text.trim()) continue;
      coerced.push({
        type: 'callout',
        tone: candidate.tone === 'warning' || candidate.tone === 'success' ? candidate.tone : 'info',
        text
      });
      continue;
    }

    if (type === 'code_cell') {
      const content = typeof candidate.content === 'string' ? candidate.content : '';
      if (!content.trim()) continue;
      coerced.push({
        type: 'code_cell',
        id: typeof candidate.id === 'string' ? candidate.id : `code-${index + 1}`,
        title: typeof candidate.title === 'string' ? candidate.title : undefined,
        language: 'python',
        content,
        autoRun: candidate.autoRun === true
      });
      continue;
    }

    if (type === 'feature_suggestion') {
      const featureName = typeof candidate.feature === 'string'
        ? candidate.feature
        : (typeof candidate.title === 'string' ? candidate.title : '');
      const method = typeof candidate.method === 'string' ? candidate.method : 'custom';
      const rationale = typeof candidate.rationale === 'string'
        ? candidate.rationale
        : 'Suggested transformation from model response.';

      const featureObject = candidate.feature && typeof candidate.feature === 'object'
        ? candidate.feature as Record<string, unknown>
        : null;

      const sourceColumn = featureObject && typeof featureObject.sourceColumn === 'string'
        ? featureObject.sourceColumn
        : null;

      const featureTitle = featureObject && typeof featureObject.featureName === 'string'
        ? featureObject.featureName
        : featureName;

      if (featureObject && sourceColumn && featureTitle) {
        const featureObjectRecord = featureObject;
        coerced.push({
          type: 'feature_suggestion',
          id: typeof candidate.id === 'string' ? candidate.id : `feature-${index + 1}`,
          feature: {
            sourceColumn,
            secondaryColumn: typeof featureObjectRecord.secondaryColumn === 'string'
              ? featureObjectRecord.secondaryColumn
              : undefined,
            featureName: featureTitle,
            description: typeof featureObjectRecord.description === 'string'
              ? featureObjectRecord.description
              : rationale,
            method: typeof featureObjectRecord.method === 'string' ? featureObjectRecord.method : method,
            params: featureObjectRecord.params && typeof featureObjectRecord.params === 'object'
              ? featureObjectRecord.params as Record<string, unknown>
              : {}
          },
          rationale,
          impact: candidate.impact === 'high' || candidate.impact === 'low' ? candidate.impact : 'medium'
        });
        continue;
      }

      if (!featureTitle && !rationale.trim()) {
        continue;
      }

      coerced.push({
        type: 'report',
        id: `legacy-feature-${index + 1}`,
        title: featureTitle ? `Suggested feature: ${featureTitle}` : 'Suggested feature',
        content: `Method: ${method}\n\n${rationale}`,
        format: 'markdown'
      });
      continue;
    }
  }

  return coerced;
}

function normalizeUiPayload(payload: unknown, kind: 'feature_engineering' | 'training' | 'onboarding' | 'preprocessing') {
  if (!payload || typeof payload !== 'object') {
    return { version: '1', kind, sections: [] };
  }
  const candidate = payload as Record<string, unknown>;
  const rawSections = Array.isArray(candidate.sections) ? candidate.sections : [];
  const firstSection = rawSections[0];
  const sectionsLooksLikeLegacyItems = Boolean(
    firstSection
    && typeof firstSection === 'object'
    && firstSection !== null
    && typeof (firstSection as Record<string, unknown>).type === 'string'
    && !Array.isArray((firstSection as Record<string, unknown>).items)
  );

  const legacyItems = sectionsLooksLikeLegacyItems ? coerceLegacyUiItems(rawSections) : [];
  const normalizedSections = sectionsLooksLikeLegacyItems
    ? [{
      id: 'generated-section',
      title: typeof candidate.title === 'string' ? candidate.title : 'Feature plan',
      layout: 'column',
      items: legacyItems
    }]
    : rawSections;

  const normalized = {
    version: candidate.version === '1' ? '1' : '1',
    kind: candidate.kind === 'feature_engineering'
      || candidate.kind === 'training'
      || candidate.kind === 'onboarding'
      || candidate.kind === 'preprocessing'
      ? candidate.kind
      : kind,
    title: typeof candidate.title === 'string' ? candidate.title : undefined,
    summary: typeof candidate.summary === 'string' ? candidate.summary : undefined,
    sections: normalizedSections
  };

  const parsed = UiSchema.safeParse(normalized);
  if (parsed.success) {
    return parsed.data;
  }

  console.warn('[llm] normalizeUiPayload failed validation', {
    issues: parsed.error.issues.slice(0, 5).map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message
    })),
    sectionCount: Array.isArray(normalized.sections) ? normalized.sections.length : 0
  });

  return { version: '1', kind: normalized.kind, title: normalized.title, summary: normalized.summary, sections: [] };
}
