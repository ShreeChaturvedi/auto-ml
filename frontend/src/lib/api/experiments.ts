import { apiRequest, getApiBaseUrl } from './client';
import type {
  EvaluationResult,
  ShapResult,
  ErrorAnalysisResult,
  ComparisonResult
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
  body: { modelId: string; nTrials: number; metric: string; timeoutSeconds?: number },
  signal?: AbortSignal
): Promise<Response> {
  const response = await fetch(`${getApiBaseUrl()}/experiments/${projectId}/tune`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
  if (!response.ok) throw new Error(`Tuning request failed: ${response.status}`);
  return response;
}

export async function compareModels(
  projectId: string,
  modelIds: string[]
): Promise<ComparisonResult> {
  return apiRequest<ComparisonResult>(`/experiments/${projectId}/compare`, {
    method: 'POST',
    body: JSON.stringify({ modelIds })
  });
}

/** Returns raw Response for NDJSON streaming. */
export async function fetchInsights(
  projectId: string,
  body: { type: string; context: Record<string, unknown> }
): Promise<Response> {
  const response = await fetch(`${getApiBaseUrl()}/experiments/${projectId}/insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Insights request failed: ${response.status}`);
  return response;
}
