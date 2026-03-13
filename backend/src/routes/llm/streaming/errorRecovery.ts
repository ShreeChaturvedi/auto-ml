import { normalizeLlmStreamErrorMessage } from '../streamErrors.js';
import { buildFeatureEngineeringFallbackEnvelope } from '../uiNormalization.js';

import type { EventWriter, StreamContext, StreamHooks } from './types.js';

const EMPTY_LLM_RESPONSE_FALLBACK_MESSAGE =
  'LLM did not return actionable output for this turn. Please retry with a more specific instruction.';

/**
 * Emits the final envelope for the "no tool calls / no UI" branches:
 *   - blank text tokens
 *   - preprocessing text-only (error)
 *   - non-empty token text as message
 *   - completely empty response
 *
 * Returns `true` when the stream was already closed inside this function
 * (caller should skip its own `closeStream`).
 */
export function emitFallbackEnvelope(ctx: StreamContext, writer: EventWriter): boolean {
  if (ctx.tokenChars > 0) {
    const trimmedPreview = ctx.tokenPreview.trim();

    if (!trimmedPreview) {
      if (ctx.kind === 'feature_engineering') {
        writer.writeEvent({ type: 'envelope', envelope: buildFeatureEngineeringFallbackEnvelope('blank_text') });
      } else {
        writer.writeEvent({
          type: 'envelope',
          envelope: {
            version: '1',
            kind: ctx.kind,
            message: EMPTY_LLM_RESPONSE_FALLBACK_MESSAGE,
            controller: ctx.controllerSummary,
            ui: null
          }
        });
      }
      writer.closeStream();
      return true;
    }

    if (ctx.kind === 'preprocessing' && !ctx.allowTextOnlyResponse) {
      writer.writeEvent({
        type: 'error',
        message: 'Model returned text without tool calls, so no preprocessing action was executed. Please retry the action.'
      });
      writer.closeStream();
      return true;
    }

    writer.writeEvent({
      type: 'envelope',
      envelope: {
        version: '1',
        kind: ctx.kind,
        message: trimmedPreview,
        tool_calls: undefined,
        controller: ctx.controllerSummary,
        ui: null
      }
    });
    return false;
  }

  // Completely empty response
  console.warn(`[llm] ${ctx.kind} ${ctx.requestId} empty response`, { tokenChars: ctx.tokenChars });
  if (ctx.kind === 'preprocessing' && !ctx.allowTextOnlyResponse) {
    writer.writeEvent({
      type: 'error',
      message: ctx.sawToollessTextAttempt
        ? 'Model returned text without tool calls, so no preprocessing action was executed. Please retry the action.'
        : 'Model returned no actionable preprocessing output, so no preprocessing action was executed. Please retry the action.'
    });
    writer.closeStream();
    return true;
  }

  if (ctx.kind === 'feature_engineering') {
    writer.writeEvent({ type: 'envelope', envelope: buildFeatureEngineeringFallbackEnvelope('empty_response') });
  } else {
    writer.writeEvent({
      type: 'envelope',
      envelope: {
        version: '1',
        kind: ctx.kind,
        message: EMPTY_LLM_RESPONSE_FALLBACK_MESSAGE,
        controller: ctx.controllerSummary,
        ui: null
      }
    });
  }
  return false;
}

/**
 * Handles a caught streaming error: normalizes the message, calls the
 * error hook, and writes the error event to the client.
 */
export async function handleStreamError(
  error: unknown,
  ctx: StreamContext,
  writer: EventWriter,
  hooks?: StreamHooks
): Promise<void> {
  if (ctx.streamClosed) {
    return;
  }

  const normalizedMessage = normalizeLlmStreamErrorMessage(error, ctx.kind);

  try {
    await hooks?.onError?.(normalizedMessage);
  } catch (hookError) {
    console.error('[llm] Failed to persist stream interruption state:', hookError);
  }

  writer.writeEvent({ type: 'error', message: normalizedMessage });
  writer.closeStream();
}
