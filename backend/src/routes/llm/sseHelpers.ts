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

import { normalizePlanExitPayload } from './planValidation.js';
import { normalizeLlmStreamErrorMessage } from './streamErrors.js';
import { buildFeatureEngineeringFallbackEnvelope, normalizeUiPayload } from './uiNormalization.js';

/* ── re-exports so existing consumers keep working ── */
export { createLlmClient };
export type { LlmClient, LlmRequest };
export { extractNormalizedPlanMarkdown, normalizePlanFilename, normalizePlanExitPayload } from './planValidation.js';
export { buildFeatureEngineeringFallbackEnvelope, coerceLegacyUiItems, normalizeUiPayload } from './uiNormalization.js';
export { normalizeLlmStreamErrorMessage } from './streamErrors.js';

const EMPTY_RENDER_UI_FALLBACK_MESSAGE =
  'AI plan finished without visible output. Try again or refine your goal.';
const EMPTY_LLM_RESPONSE_FALLBACK_MESSAGE =
  'LLM did not return actionable output for this turn. Please retry with a more specific instruction.';

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
