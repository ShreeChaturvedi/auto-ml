import { apiFetch, apiRequest } from './client';
import type {
  EvaluationResult,
  ShapResult,
  ErrorAnalysisResult,
  FilterPredicate,
  ExperimentInsightType,
} from '@/types/experiments';

export async function fetchEvaluation(modelId: string): Promise<EvaluationResult> {
  return apiRequest<EvaluationResult>(`/experiments/${modelId}/evaluation`);
}

export async function fetchShap(modelId: string): Promise<ShapResult> {
  return apiRequest<ShapResult>(`/experiments/${modelId}/shap`);
}

export async function fetchErrorAnalysis(modelId: string): Promise<ErrorAnalysisResult> {
  return apiRequest<ErrorAnalysisResult>(`/experiments/${modelId}/error-analysis`);
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
