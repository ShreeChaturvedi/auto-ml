import { apiRequest, getApiBaseUrl } from './client';
import { LlmEnvelopeSchema, type LlmEnvelope, type ToolCall, type ToolResult } from '@/types/llmUi';

export type ThinkingLevel = 'dynamic' | 'low' | 'medium' | 'high';

export interface LlmPlanRequest {
  projectId: string;
  datasetId?: string;
  targetColumn?: string;
  prompt?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  featureSummary?: string;
  enableThinking?: boolean;
  thinkingLevel?: ThinkingLevel;
  model?: string;
}

export interface OnboardingStreamRequest {
  projectId: string;
  userIntent?: string;
  questionAnswers?: Array<{ questionId: string; answer: string | string[] }>;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  round?: number;
  enableThinking?: boolean;
  thinkingLevel?: ThinkingLevel;
  model?: string;
}

export type LlmStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'envelope'; envelope: LlmEnvelope }
  | { type: 'ask_user'; questions: NonNullable<LlmEnvelope['ask_user']>['questions'] }
  | { type: 'plan_exit'; planName?: string; planMarkdown: string }
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

export async function streamPreprocessingPlan(
  request: LlmPlanRequest,
  onEvent: (event: LlmStreamEvent) => void,
  signal?: AbortSignal
) {
  return streamLlm('/llm/preprocessing/stream', request, onEvent, signal);
}

export async function streamOnboardingPlan(
  request: OnboardingStreamRequest,
  onEvent: (event: LlmStreamEvent) => void,
  signal?: AbortSignal
) {
  return streamLlm('/llm/onboarding/stream', request, onEvent, signal);
}

export async function executeToolCalls(projectId: string, toolCalls: ToolCall[]) {
  return apiRequest<{ results: ToolResult[] }>('/llm/tools/execute', {
    method: 'POST',
    body: JSON.stringify({ projectId, toolCalls })
  });
}

async function streamLlm(
  endpoint: string,
  request: LlmPlanRequest | OnboardingStreamRequest,
  onEvent: (event: LlmStreamEvent) => void,
  signal?: AbortSignal
) {
  const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify(request),
    signal
  });

  if (!response.ok || !response.body) {
    const rawMessage = await response.text().catch(() => '');
    let message = rawMessage;

    if (rawMessage) {
      try {
        const payload = JSON.parse(rawMessage) as { error?: string; message?: string; code?: string };
        const baseMessage = payload.error || payload.message || rawMessage;
        message = payload.code ? `${baseMessage} (${payload.code})` : baseMessage;
      } catch {
        message = rawMessage;
      }
    }

    throw new Error(message || `LLM request failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawDone = false;

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
            if (parsed.data.ask_user?.questions?.length) {
              onEvent({ type: 'ask_user', questions: parsed.data.ask_user.questions });
            }
            if (parsed.data.plan_exit?.planMarkdown) {
              onEvent({
                type: 'plan_exit',
                planName: parsed.data.plan_exit.planName,
                planMarkdown: parsed.data.plan_exit.planMarkdown
              });
            }
          } else {
            onEvent({ type: 'error', message: 'LLM envelope failed validation.' });
          }
          continue;
        }
        if (payload.type === 'done') {
          sawDone = true;
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
          if (parsed.data.ask_user?.questions?.length) {
            onEvent({ type: 'ask_user', questions: parsed.data.ask_user.questions });
          }
          if (parsed.data.plan_exit?.planMarkdown) {
            onEvent({
              type: 'plan_exit',
              planName: parsed.data.plan_exit.planName,
              planMarkdown: parsed.data.plan_exit.planMarkdown
            });
          }
        } else {
          onEvent({ type: 'error', message: 'LLM envelope failed validation.' });
        }
      } else {
        if (payload.type === 'done') {
          sawDone = true;
        }
        onEvent(payload);
      }
    } catch {
      onEvent({ type: 'error', message: 'Failed to parse LLM stream tail.' });
    }
  }

  if (!sawDone) {
    onEvent({ type: 'done' });
  }
}
