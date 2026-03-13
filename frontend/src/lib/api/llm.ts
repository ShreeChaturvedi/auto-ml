import { apiRequest, getApiBaseUrl } from './client';
import { readNdjsonStream } from './streamReader';
import { LlmEnvelopeSchema, type LlmEnvelope, type ToolCall, type ToolResult } from '@/types/llmUi';
import type { AssistantModelKind, ReasoningEffort } from '@/components/llm/modelOptions';
import type {
  PreprocessingControllerSummary,
  PreprocessingRunSnapshot,
  PreprocessingRunSummary
} from '@/types/preprocessing';

export interface LlmModelCatalogEntry {
  id: string;
  label: string;
  kind: AssistantModelKind;
  description?: string;
  tip?: string;
  featured: boolean;
  reasoningEfforts: ReasoningEffort[];
  defaultReasoningEffort: ReasoningEffort;
}

export interface LlmModelCatalogResponse {
  defaultModel: string;
  defaultReasoningEffort?: ReasoningEffort;
  featured?: LlmModelCatalogEntry[];
  featuredModels?: LlmModelCatalogEntry[];
  models: LlmModelCatalogEntry[];
}

export interface LlmPlanRequest {
  projectId: string;
  datasetId?: string;
  threadId?: string;
  continuation?: boolean;
  targetColumn?: string;
  prompt?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  featureSummary?: string;
  reasoningEffort?: ReasoningEffort;
  model?: string;
}

export interface OnboardingStreamRequest {
  projectId: string;
  userIntent?: string;
  questionAnswers?: Array<{ questionId: string; answer: string | string[] }>;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  round?: number;
  reasoningEffort?: ReasoningEffort;
  model?: string;
}

export type LlmStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'envelope'; envelope: LlmEnvelope }
  | { type: 'ask_user'; questions: NonNullable<LlmEnvelope['ask_user']>['questions'] }
  | { type: 'plan_exit'; planName?: string; planMarkdown: string }
  | { type: 'usage'; usage: Record<string, unknown> }
  | { type: 'error'; message: string }
  | { type: 'done' };

export type { PreprocessingControllerSummary };

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

export async function executeToolCalls(
  projectId: string,
  toolCalls: ToolCall[],
  notebookId?: string,
  executionMode: 'agent' | 'user_approval' = 'agent',
  datasetId?: string
) {
  return apiRequest<{ results: ToolResult[] }>('/llm/tools/execute', {
    method: 'POST',
    body: JSON.stringify({ projectId, toolCalls, notebookId, executionMode, datasetId })
  });
}

export async function listPreprocessingRuns(projectId: string, limit?: number) {
  const query = new URLSearchParams({ projectId });
  if (typeof limit === 'number' && Number.isFinite(limit)) {
    query.set('limit', String(limit));
  }
  return apiRequest<{ projectId: string; count: number; runs: PreprocessingRunSummary[] }>(
    `/llm/preprocessing/runs?${query.toString()}`
  );
}

export async function getPreprocessingRunSnapshot(runId: string, projectId?: string) {
  const query = new URLSearchParams();
  if (projectId) {
    query.set('projectId', projectId);
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiRequest<{ run: PreprocessingRunSnapshot }>(`/llm/preprocessing/runs/${runId}${suffix}`);
}

export async function listLlmModels() {
  return apiRequest<LlmModelCatalogResponse>('/llm/models', {
    method: 'GET'
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

  let sawDone = false;

  for await (const payload of readNdjsonStream<LlmStreamEvent>(response)) {
    try {
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

  if (!sawDone) {
    onEvent({ type: 'done' });
  }
}
