import { randomUUID } from 'node:crypto';

import type { Response } from 'express';
import { z } from 'zod';

import {
  createLlmClient,
  type LlmClient,
  type LlmRequest,
  type RawLlmUsage
} from '../../services/llm/llmClient.js';
import { LLM_RENDER_UI_TOOL } from '../../services/llm/toolRegistry.js';
import { AskUserPayloadSchema, PlanExitPayloadSchema, ToolCallSchema } from '../../types/llm.js';
import type { LlmEnvelope } from '../../types/llm.js';
import { UiSchema } from '../../types/llmUi.js';

export { createLlmClient };
export type { LlmClient, LlmRequest };

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

const REQUIRED_PLAN_SECTION_PATTERNS = [
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?objective\b[:\s-]*/im,
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?(?:data\s+summary|data\s+overview)\b[:\s-]*/im,
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?approach\b[:\s-]*/im,
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?(?:feature\s+engineering\s+strategy|feature\s+engineering)\b[:\s-]*/im,
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?(?:target\s*(?:&|and)\s*evaluation|evaluation)\b[:\s-]*/im,
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?(?:risks?\s*(?:&|and)\s*assumptions?|assumptions?)\b[:\s-]*/im,
  /^#{2,6}\s*(?:\d+\s*[.)-]\s*)?next\s+steps\b[:\s-]*/im
];

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

function normalizeLlmStreamErrorMessage(
  error: unknown,
  kind: 'feature_engineering' | 'training' | 'onboarding' | 'preprocessing'
): string {
  const fallback = error instanceof Error ? error.message : 'LLM request failed';
  const raw = typeof fallback === 'string' ? fallback : 'LLM request failed';
  const trimmed = raw.trim();

  const parseJsonError = (value: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const parsedRoot = parseJsonError(trimmed);
  const parsedError = parsedRoot && parsedRoot.error && typeof parsedRoot.error === 'object' && !Array.isArray(parsedRoot.error)
    ? parsedRoot.error as Record<string, unknown>
    : null;

  const code = typeof parsedError?.code === 'number'
    ? parsedError.code
    : typeof parsedRoot?.code === 'number'
      ? parsedRoot.code
      : undefined;
  const status = typeof parsedError?.status === 'string'
    ? parsedError.status
    : typeof parsedRoot?.status === 'string'
      ? parsedRoot.status
      : undefined;
  const message = typeof parsedError?.message === 'string'
    ? parsedError.message
    : typeof parsedRoot?.message === 'string'
      ? parsedRoot.message
      : undefined;

  const fingerprint = `${trimmed}\n${status ?? ''}\n${message ?? ''}`.toLowerCase();
  const isQuotaFailure = code === 429
    || fingerprint.includes('resource_exhausted')
    || fingerprint.includes('quota exceeded')
    || fingerprint.includes('rate limit');

  if (isQuotaFailure) {
    if (kind === 'preprocessing') {
      return 'OpenAI rate limit or quota reached (429). This preprocessing request was not completed. Check API quota/billing and retry.';
    }
    return 'OpenAI rate limit or quota reached (429). Check API quota/billing and retry.';
  }

  const isModelUnavailable = code === 503
    || fingerprint.includes('unavailable')
    || fingerprint.includes('high demand')
    || fingerprint.includes('timed out')
    || fingerprint.includes('timeout');
  if (isModelUnavailable) {
    const providerMessage = message?.trim() || raw;
    const guidance = 'Current model is unavailable or timing out. Please choose a different model in the model selector and retry.';
    return `${providerMessage} ${guidance}`.trim();
  }

  if (message && message.trim()) {
    return message.trim();
  }

  return raw;
}

export async function streamLlmResponse(
  res: Response,
  client: LlmClient,
  request: LlmRequest,
  kind: 'feature_engineering' | 'training' | 'onboarding' | 'preprocessing',
  hooks?: {
    onError?: (message: string) => Promise<void> | void;
    onAborted?: (message: string) => Promise<void> | void;
  }
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
  let streamClosed = false;
  let latestUsage: RawLlmUsage | null = null;
  const suppressTokenStreaming = kind === 'preprocessing';

  const collectLlmAttempt = async (attemptRequest: LlmRequest): Promise<void> => {
    await client.stream(attemptRequest, {
      onToken: (token) => {
        tokenChars += token.length;
        if (tokenPreview.length < 600) {
          tokenPreview = `${tokenPreview}${token}`.slice(0, 600);
        }
        if (!suppressTokenStreaming) {
          writeEvent({ type: 'token', text: token });
        }
      },
      onThinking: (text) => {
        writeEvent({ type: 'thinking', text });
      },
      onUsage: (usage) => {
        latestUsage = usage;
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
  };

  const writeEvent = (payload: Record<string, unknown>) => {
    if (streamClosed || res.destroyed || res.writableEnded) {
      return;
    }
    res.write(`${JSON.stringify(payload)}\n`);
  };
  const closeStream = () => {
    if (streamClosed || res.destroyed || res.writableEnded) {
      streamClosed = true;
      return;
    }
    if (latestUsage) {
      writeEvent({ type: 'usage', usage: latestUsage });
    }
    res.write(`${JSON.stringify({ type: 'done' })}\n`);
    streamClosed = true;
    res.end();
  };

  res.on('close', () => {
    if (streamClosed) {
      return;
    }
    streamClosed = true;
    void hooks?.onAborted?.('Preprocessing request stream was aborted before completion.');
  });

  try {
    await collectLlmAttempt(request);

    const shouldRetryNoToolsPreprocessing = kind === 'preprocessing'
      && !uiEnvelope
      && !askUserPayload
      && !planExitPayload
      && toolCalls.length === 0
      && tokenPreview.trim().length > 0;

    if (shouldRetryNoToolsPreprocessing) {
      console.warn('[llm] preprocessing text-only response detected; retrying once with stricter tool-call directive');
      const retryRequest: LlmRequest = {
        ...request,
        messages: [
          ...request.messages,
          {
            role: 'user',
            content: 'Your previous response did not call tools. For preprocessing, you must execute actions via tool/function calls only (no plain markdown/code response). Continue this task now using tools.'
          }
        ]
      };
      await collectLlmAttempt(retryRequest);
    }

    if (terminalToolConflict) {
      closeStream();
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
      writeEvent({ type: 'envelope', envelope: uiEnvelope });
    } else if (toolCalls.length > 0) {
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
        closeStream();
        return;
      }
      if (kind === 'preprocessing') {
        writeEvent({
          type: 'error',
          message: 'Model returned text without tool calls, so no preprocessing action was executed. Please retry the action.'
        });
        closeStream();
        return;
      }
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
    closeStream();
  } catch (error) {
    if (streamClosed) {
      return;
    }
    const normalizedMessage = normalizeLlmStreamErrorMessage(error, kind);
    try {
      await hooks?.onError?.(normalizedMessage);
    } catch (hookError) {
      console.error('[llm] Failed to persist stream interruption state:', hookError);
    }
    writeEvent({
      type: 'error',
      message: normalizedMessage
    });
    closeStream();
  }
}

