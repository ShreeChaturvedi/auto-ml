import { useAuthStore } from '@/stores/authStore';
import { decodeJwtPayload } from '@/lib/auth/jwt';
import { apiFetch, apiRequest, refreshAccessToken } from './client';
import { readNdjsonStream } from './streamReader';
import type { LlmEnvelope, LlmUsage, ToolCall, ToolResult } from '@/types/llmUi';
import type { AssistantModelKind, ReasoningEffort } from '@/components/llm/modelOptions';
import type {
  PreprocessingControllerSummary,
  PreprocessingRunSnapshot,
  PreprocessingRunSummary
} from '@/types/preprocessing';
import type {
  WorkflowArtifact,
  WorkflowErrorEvent,
  WorkflowPhase,
  WorkflowPauseEvent,
  WorkflowState,
  WorkflowToolExecutedEvent
} from '@/types/workflow';
import { emitParsedLlmStreamEvent } from './llmStreamParser';

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
  runId?: string;
  threadId?: string;
  notebookId?: string;
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
  | { type: 'workflow_state'; state: WorkflowState }
  | WorkflowToolExecutedEvent
  | { type: 'artifact_updated'; artifact: WorkflowArtifact; state?: WorkflowState }
  | WorkflowPauseEvent
  | WorkflowErrorEvent
  | { type: 'ask_user'; questions: NonNullable<LlmEnvelope['ask_user']>['questions'] }
  | { type: 'plan_exit'; planName?: string; planMarkdown: string }
  | { type: 'usage'; usage: LlmUsage }
  | { type: 'error'; message: string }
  | { type: 'done' };

export type { PreprocessingControllerSummary };

export interface WorkflowTurnRequest extends LlmPlanRequest {
  phase: WorkflowPhase;
}

export async function streamWorkflowTurn(
  request: WorkflowTurnRequest,
  onEvent: (event: LlmStreamEvent) => void,
  signal?: AbortSignal
) {
  return streamLlm('/workflows/turns/stream', request, onEvent, signal);
}

export async function interruptWorkflowRun(runId: string, reason?: string) {
  return apiRequest<{ run: WorkflowState }>(`/workflows/${runId}/interrupt`, {
    method: 'POST',
    body: reason ? { reason } : {}
  });
}

export async function streamFeaturePlan(
  request: LlmPlanRequest,
  onEvent: (event: LlmStreamEvent) => void,
  signal?: AbortSignal
) {
  return streamWorkflowTurn({ ...request, phase: 'feature_engineering' }, onEvent, signal);
}

export async function streamTrainingPlan(
  request: LlmPlanRequest,
  onEvent: (event: LlmStreamEvent) => void,
  signal?: AbortSignal
) {
  return streamWorkflowTurn({ ...request, phase: 'training' }, onEvent, signal);
}

export async function streamPreprocessingPlan(
  request: LlmPlanRequest,
  onEvent: (event: LlmStreamEvent) => void,
  signal?: AbortSignal
) {
  return streamWorkflowTurn({ ...request, phase: 'preprocessing' }, onEvent, signal);
}

export async function streamOnboardingPlan(
  request: OnboardingStreamRequest,
  onEvent: (event: LlmStreamEvent) => void,
  signal?: AbortSignal
) {
  return streamWorkflowTurn(
    { ...request, projectId: request.projectId, phase: 'onboarding' as WorkflowPhase },
    onEvent,
    signal
  );
}

export async function listPreprocessingRuns(projectId: string, limit?: number) {
  const query = new URLSearchParams({ projectId });
  if (typeof limit === 'number' && Number.isFinite(limit)) {
    query.set('limit', String(limit));
  }
  return apiRequest<{ projectId: string; count: number; runs: PreprocessingRunSummary[] }>(
    `/preprocessing/runs?${query.toString()}`
  );
}

export async function getPreprocessingRunSnapshot(runId: string, projectId?: string) {
  const query = new URLSearchParams();
  if (projectId) {
    query.set('projectId', projectId);
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiRequest<{ run: PreprocessingRunSnapshot }>(`/preprocessing/runs/${runId}${suffix}`);
}

export async function listLlmModels() {
  return apiRequest<LlmModelCatalogResponse>('/llm/models', {
    method: 'GET'
  });
}

const PRE_STREAM_REFRESH_THRESHOLD_SEC = 120;

async function ensureFreshToken() {
  const { accessToken, refreshToken } = useAuthStore.getState();
  if (!accessToken || !refreshToken) return;
  const payload = decodeJwtPayload(accessToken);
  if (!payload?.exp) return;
  const remaining = payload.exp - Math.floor(Date.now() / 1000);
  if (remaining < PRE_STREAM_REFRESH_THRESHOLD_SEC) {
    await refreshAccessToken(refreshToken);
  }
}

async function streamLlm(
  endpoint: string,
  request: LlmPlanRequest | OnboardingStreamRequest,
  onEvent: (event: LlmStreamEvent) => void,
  signal?: AbortSignal
) {
  await ensureFreshToken();

  const response = await apiFetch(endpoint, {
    method: 'POST',
    headers: { Accept: 'application/x-ndjson' },
    body: request,
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
      if (payload.type === 'done') {
        sawDone = true;
      }
      emitParsedLlmStreamEvent(payload, onEvent);
    } catch {
      onEvent({ type: 'error', message: 'Failed to parse LLM stream.' });
    }
  }

  if (!sawDone) {
    onEvent({ type: 'done' });
  }
}
