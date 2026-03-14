import { randomUUID } from 'node:crypto';

import type { Response } from 'express';

import {
  createLlmClient,
  type LlmClient,
  type LlmRequest
} from '../../services/llm/llmClient.js';

import { emitFallbackEnvelope, handleStreamError } from './streaming/errorRecovery.js';
import { collectLlmAttempt } from './streaming/tokenHandler.js';
import type {
  EventWriter,
  StreamContext,
  StreamHooks,
  StreamKind,
  StreamResponseOptions
} from './streaming/types.js';

/* ── re-exports so existing consumers keep working ── */
export { createLlmClient };
export type { LlmClient, LlmRequest };
export { extractNormalizedPlanMarkdown, normalizePlanFilename, normalizePlanExitPayload } from './planValidation.js';
export { buildFeatureEngineeringFallbackEnvelope, coerceLegacyUiItems, normalizeUiPayload } from './uiNormalization.js';
export { normalizeLlmStreamErrorMessage } from './streamErrors.js';

/* ── orchestrator ─────────────────────────────────────────────── */

export async function streamLlmResponse(
  res: Response,
  client: LlmClient,
  request: LlmRequest,
  kind: StreamKind,
  hooks?: StreamHooks,
  options?: StreamResponseOptions
) {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  /* ── mutable context shared across helpers ── */
  const ctx: StreamContext = {
    kind,
    requestId: randomUUID().slice(0, 8),
    suppressTokenStreaming: options?.suppressTokenStreaming ?? (kind === 'preprocessing'),
    allowTextOnlyResponse: options?.allowTextOnlyResponse ?? false,
    toolCalls: [],
    askUserPayload: null,
    planExitPayload: null,
    terminalToolConflict: false,
    uiEnvelope: null,
    controllerSummary: options?.controllerSummary,
    sawToollessTextAttempt: false,
    sawReasoningOnlyAttempt: false,
    tokenChars: 0,
    tokenPreview: '',
    thinkingChars: 0,
    streamClosed: false,
    latestUsage: null
  };

  /* ── writer / closer tied to this response ── */
  const writer: EventWriter = {
    writeEvent(payload: Record<string, unknown>) {
      if (ctx.streamClosed || res.destroyed || res.writableEnded) return;
      res.write(`${JSON.stringify(payload)}\n`);
    },
    closeStream() {
      if (ctx.streamClosed || res.destroyed || res.writableEnded) {
        ctx.streamClosed = true;
        return;
      }
      if (ctx.latestUsage) {
        writer.writeEvent({ type: 'usage', usage: ctx.latestUsage });
      }
      res.write(`${JSON.stringify({ type: 'done' })}\n`);
      ctx.streamClosed = true;
      res.end();
    }
  };

  res.on('close', () => {
    if (ctx.streamClosed) return;
    ctx.streamClosed = true;
    void hooks?.onAborted?.('Preprocessing request stream was aborted before completion.');
  });

  try {
    await collectLlmAttempt(client, request, ctx, writer);

    /* ── preprocessing retry: text-only response without tool calls ── */
    if (
      kind === 'preprocessing'
      && !ctx.allowTextOnlyResponse
      && !ctx.uiEnvelope
      && !ctx.askUserPayload
      && !ctx.planExitPayload
      && ctx.toolCalls.length === 0
      && ctx.tokenPreview.trim().length > 0
    ) {
      console.warn('[llm] preprocessing text-only response detected; retrying once with stricter tool-call directive');
      ctx.sawToollessTextAttempt = true;
      ctx.tokenChars = 0;
      ctx.tokenPreview = '';
      ctx.latestUsage = null;
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
      await collectLlmAttempt(client, retryRequest, ctx, writer);
    }

    if (
      kind === 'preprocessing'
      && !ctx.allowTextOnlyResponse
      && !ctx.uiEnvelope
      && !ctx.askUserPayload
      && !ctx.planExitPayload
      && ctx.toolCalls.length === 0
      && ctx.tokenPreview.trim().length === 0
      && ctx.thinkingChars > 0
    ) {
      console.warn('[llm] preprocessing reasoning-only response detected; retrying once with strict tool-call directive');
      ctx.sawReasoningOnlyAttempt = true;
      ctx.thinkingChars = 0;
      ctx.latestUsage = null;
      const retryRequest: LlmRequest = {
        ...request,
        messages: [
          ...request.messages,
          {
            role: 'user',
            content: 'You finished reasoning but did not produce any visible answer or tool call. For this preprocessing turn, immediately call exactly one appropriate tool from the allowed set.'
          }
        ]
      };
      await collectLlmAttempt(client, retryRequest, ctx, writer);
    }

    if (ctx.terminalToolConflict) {
      writer.closeStream();
      return;
    }

    /* ── emit the final envelope based on what was collected ── */
    if (ctx.askUserPayload) {
      writer.writeEvent({
        type: 'envelope',
        envelope: {
          version: '1',
          kind,
          ask_user: ctx.askUserPayload,
          tool_calls: ctx.toolCalls.length > 0 ? ctx.toolCalls : undefined,
          controller: ctx.controllerSummary,
          ui: null
        }
      });
    } else if (ctx.planExitPayload) {
      writer.writeEvent({
        type: 'envelope',
        envelope: { version: '1', kind, plan_exit: ctx.planExitPayload, controller: ctx.controllerSummary, ui: null }
      });
    } else if (ctx.uiEnvelope) {
      writer.writeEvent({
        type: 'envelope',
        envelope: {
          ...ctx.uiEnvelope,
          controller: ctx.controllerSummary
        }
      });
    } else if (ctx.toolCalls.length > 0) {
      const message = ctx.tokenPreview.trim() || undefined;
      writer.writeEvent({
        type: 'envelope',
        envelope: {
          version: '1',
          kind,
          message,
          tool_calls: ctx.toolCalls,
          controller: ctx.controllerSummary,
          ui: null
        }
      });
    } else {
      const closedEarly = emitFallbackEnvelope(ctx, writer);
      if (closedEarly) return;
    }

    writer.closeStream();
  } catch (error) {
    await handleStreamError(error, ctx, writer, hooks);
  }
}
