import { ApiError, apiFetch, apiRequest } from './client';
import type {
  EvaluationResult,
  ShapResult,
  ErrorAnalysisResult,
  FilterPredicate,
  ExperimentInsightType,
} from '@/types/experiments';

export async function fetchEvaluation(modelId: string): Promise<EvaluationResult | undefined> {
  const response = await apiFetch(`/experiments/${modelId}/evaluation`);

  if (response.status === 202 || response.status === 204 || response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    const cloned = response.clone();
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = await cloned.text();
    }
    const errorMessage =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : response.statusText || 'Evaluation request failed';
    throw new ApiError(
      `Request to ${response.url} failed with status ${response.status}: ${errorMessage}`,
      response.status,
      payload,
    );
  }

  return (await response.json()) as EvaluationResult;
}

export async function retryEvaluation(modelId: string): Promise<{ ok: boolean; evaluationStatus: string }> {
  return apiRequest<{ ok: boolean; evaluationStatus: string }>(`/experiments/${modelId}/evaluation/retry`, {
    method: 'POST',
  });
}

export async function fetchShap(modelId: string): Promise<ShapResult | undefined> {
  const response = await apiFetch(`/experiments/${modelId}/shap`);

  if (response.status === 202 || response.status === 204 || response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    const cloned = response.clone();
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = await cloned.text();
    }
    const errorMessage =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : response.statusText || 'SHAP request failed';
    throw new ApiError(
      `Request to ${response.url} failed with status ${response.status}: ${errorMessage}`,
      response.status,
      payload,
    );
  }

  return (await response.json()) as ShapResult;
}

export async function fetchErrorAnalysis(modelId: string): Promise<ErrorAnalysisResult | undefined> {
  const response = await apiFetch(`/experiments/${modelId}/error-analysis`);

  if (response.status === 202 || response.status === 204 || response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    const cloned = response.clone();
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = await cloned.text();
    }
    const errorMessage =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : response.statusText || 'Error analysis request failed';
    throw new ApiError(
      `Request to ${response.url} failed with status ${response.status}: ${errorMessage}`,
      response.status,
      payload,
    );
  }

  return (await response.json()) as ErrorAnalysisResult;
}

/** Returns raw Response for NDJSON streaming (apiRequest parses JSON; we need the raw stream). */
export async function startTuning(
  projectId: string,
  body: {
    modelId: string;
    nTrials: number;
    metric: string;
    timeoutSeconds?: number;
    sampler?: 'tpe' | 'random';
  },
  signal?: AbortSignal
): Promise<Response> {
  const response = await apiFetch(`/experiments/${projectId}/tune`, {
    method: 'POST',
    body,
    signal
  });
  if (!response.ok) throw new Error(`Tuning request failed: ${response.status}`);
  return response;
}

export async function parseNlFilter(
  projectId: string,
  query: string,
  signal?: AbortSignal
): Promise<{ predicates: FilterPredicate[] }> {
  return apiRequest<{ predicates: FilterPredicate[] }>(
    `/experiments/${projectId}/nl-filter`,
    { method: 'POST', body: { query }, signal }
  );
}

/** Returns raw Response for NDJSON streaming. */
export async function fetchInsights(
  projectId: string,
  body: { type: ExperimentInsightType; context: Record<string, unknown> }
): Promise<Response> {
  const response = await apiFetch(`/experiments/${projectId}/insights`, {
    method: 'POST',
    body
  });
  if (!response.ok) throw new Error(`Insights request failed: ${response.status}`);
  return response;
}
