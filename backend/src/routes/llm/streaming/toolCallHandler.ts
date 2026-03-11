import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import type { LlmToolCall } from '../../../services/llm/llmClient.js';
import { LLM_RENDER_UI_TOOL } from '../../../services/llm/toolRegistry.js';
import { AskUserPayloadSchema, PlanExitPayloadSchema, ToolCallSchema } from '../../../types/llm.js';
import { UiSchema } from '../../../types/llmUi.js';
import { normalizePlanExitPayload } from '../planValidation.js';
import { buildFeatureEngineeringFallbackEnvelope, normalizeUiPayload } from '../uiNormalization.js';

import type { EventWriter, StreamContext } from './types.js';

const EMPTY_RENDER_UI_FALLBACK_MESSAGE =
  'AI plan finished without visible output. Try again or refine your goal.';

/**
 * Routes a single tool call to the correct handler based on tool name.
 * Mutates the shared {@link StreamContext} accordingly.
 */
export function dispatchToolCall(
  call: LlmToolCall,
  ctx: StreamContext,
  writer: EventWriter
): void {
  if (call.name === 'ask_user') {
    handleAskUser(call, ctx, writer);
    return;
  }

  if (call.name === 'plan_exit') {
    handlePlanExit(call, ctx, writer);
    return;
  }

  if (call.name === LLM_RENDER_UI_TOOL.name) {
    handleRenderUi(call, ctx, writer);
    return;
  }

  handleGenericToolCall(call, ctx, writer);
}

/* ── ask_user ────────────────────────────────────────────────── */

function handleAskUser(
  call: LlmToolCall,
  ctx: StreamContext,
  writer: EventWriter
): void {
  if (ctx.planExitPayload) {
    ctx.terminalToolConflict = true;
    writer.writeEvent({ type: 'error', message: 'Model emitted both ask_user and plan_exit in one response.' });
    return;
  }

  const parsed = AskUserPayloadSchema.safeParse(call.args);
  if (!parsed.success) {
    writer.writeEvent({ type: 'error', message: 'ask_user payload failed validation.' });
    return;
  }
  ctx.askUserPayload = parsed.data;
}

/* ── plan_exit ───────────────────────────────────────────────── */

function handlePlanExit(
  call: LlmToolCall,
  ctx: StreamContext,
  writer: EventWriter
): void {
  if (ctx.askUserPayload) {
    ctx.terminalToolConflict = true;
    writer.writeEvent({ type: 'error', message: 'Model emitted both ask_user and plan_exit in one response.' });
    return;
  }

  const parsed = PlanExitPayloadSchema.safeParse(call.args);
  if (!parsed.success) {
    writer.writeEvent({ type: 'error', message: 'plan_exit payload failed validation.' });
    return;
  }

  const normalized = normalizePlanExitPayload(parsed.data);
  if (!normalized) {
    writer.writeEvent({ type: 'error', message: 'plan_exit payload does not contain a valid plan.' });
    return;
  }

  ctx.planExitPayload = normalized;
}

/* ── render_ui ───────────────────────────────────────────────── */

function handleRenderUi(
  call: LlmToolCall,
  ctx: StreamContext,
  writer: EventWriter
): void {
  const rawArgs = call.args ?? {};
  let uiPayload: unknown = undefined;

  // Step 1: Prefer payload (stringified JSON) — this is the expected path now
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

  const normalizedUi = normalizeUiPayload(uiPayload, ctx.kind);
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
    console.warn(`[llm] ${ctx.kind} render_ui validation failed`, {
      error: parsed.error.issues.map((issue) => issue.message),
      payloadPreview: JSON.stringify(call.args).slice(0, 1200)
    });
    writer.writeEvent({ type: 'error', message: 'LLM render_ui payload failed validation.' });
    return;
  }

  const uiHasItems = parsed.data.ui.sections.some((section) => section.items.length > 0);
  const hasFallbackMessage = Boolean(parsed.data.message?.trim());

  if (!uiHasItems && !hasFallbackMessage) {
    if (ctx.kind === 'feature_engineering') {
      ctx.uiEnvelope = buildFeatureEngineeringFallbackEnvelope('empty_render_ui');
      return;
    }
    ctx.uiEnvelope = {
      version: '1',
      kind: ctx.kind,
      message: EMPTY_RENDER_UI_FALLBACK_MESSAGE,
      ui: null
    };
    return;
  }

  ctx.uiEnvelope = {
    version: '1',
    kind: ctx.kind,
    message: parsed.data.message,
    ui: parsed.data.ui
  };
}

/* ── generic tool calls ──────────────────────────────────────── */

function handleGenericToolCall(
  call: LlmToolCall,
  ctx: StreamContext,
  writer: EventWriter
): void {
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
    writer.writeEvent({ type: 'error', message: `Unsupported tool call: ${call.name}` });
    return;
  }
  ctx.toolCalls.push(parsed.data);
}
