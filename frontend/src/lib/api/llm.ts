import { apiRequest, getApiBaseUrl } from './client';
import { LlmEnvelopeSchema, type LlmEnvelope, type ToolCall, type ToolResult } from '@/types/llmUi';

export interface LlmPlanRequest {
  projectId: string;
  datasetId?: string;
  targetColumn?: string;
  prompt?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  featureSummary?: string;
  enableThinking?: boolean;
}

export type LlmStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'envelope'; envelope: LlmEnvelope }
  | { type: 'error'; message: string }
  | { type: 'done' };

export async function streamFeaturePlan(
  request: LlmPlanRequest,
  onEvent: (event: LlmStreamEvent) => void,
  signal?: AbortSignal
) {
  return streamLlm('/llm/feature-plan/stream', request, onEvent, signal);
}

export async function streamTrainingPlan(
  request: LlmPlanRequest,
  onEvent: (event: LlmStreamEvent) => void,
  signal?: AbortSignal
) {
  return streamLlm('/llm/training/stream', request, onEvent, signal);
}

export async function executeToolCalls(projectId: string, toolCalls: ToolCall[]) {
  return apiRequest<{ results: ToolResult[] }>('/llm/tools/execute', {
    method: 'POST',
    body: JSON.stringify({ projectId, toolCalls })
  });
}

async function streamLlm(
  endpoint: string,
  request: LlmPlanRequest,
  onEvent: (event: LlmStreamEvent) => void,
  signal?: AbortSignal
) {
  // DEBUG: Dump payload to backend for verification (silently ignore errors)
  try {
    fetch(`${getApiBaseUrl()}/llm/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, request })
    }).catch(() => { /* debug only */ });
  } catch { /* debug only */ }

  const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify(request),
    signal
  });

  if (!response.ok || !response.body) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `LLM request failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const payload = JSON.parse(trimmed) as LlmStreamEvent;
        if (payload.type === 'envelope') {
          const parsed = LlmEnvelopeSchema.safeParse(payload.envelope);
          if (parsed.success) {
            onEvent({ type: 'envelope', envelope: parsed.data });
          } else {
            onEvent({ type: 'error', message: 'LLM envelope failed validation.' });
          }
          continue;
        }
        onEvent(payload);
      } catch {
        onEvent({ type: 'error', message: 'Failed to parse LLM stream.' });
      }
    }
  }

  if (buffer.trim()) {
    try {
      const payload = JSON.parse(buffer.trim()) as LlmStreamEvent;
      if (payload.type === 'envelope') {
        const parsed = LlmEnvelopeSchema.safeParse(payload.envelope);
        if (parsed.success) {
          onEvent({ type: 'envelope', envelope: parsed.data });
        } else {
          onEvent({ type: 'error', message: 'LLM envelope failed validation.' });
        }
      } else {
        onEvent(payload);
      }
    } catch {
      onEvent({ type: 'error', message: 'Failed to parse LLM stream tail.' });
    }
  }

  onEvent({ type: 'done' });
}
