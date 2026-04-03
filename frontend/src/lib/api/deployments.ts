import { apiRequest } from './client';
import type {
  DeploymentRecord,
  DeploymentApiKeyInfo,
  DeploymentSchema,
  DeploymentStatsHourly,
  DriftReport,
  PredictionLog,
  PredictionLogFilters,
  PredictionResult,
} from '@/types/deployment';

export async function listDeployments(projectId: string) {
  return apiRequest<{ deployments: DeploymentRecord[] }>(`/deployments?projectId=${projectId}`, { method: 'GET' });
}

export async function createDeployment(modelId: string, projectId: string, name: string) {
  return apiRequest<{ deployment: DeploymentRecord }>('/deployments', {
    method: 'POST',
    body: { modelId, projectId, name },
  });
}

export async function getDeployment(deploymentId: string) {
  return apiRequest<{ deployment: DeploymentRecord }>(`/deployments/${deploymentId}`, { method: 'GET' });
}

export async function deleteDeployment(deploymentId: string) {
  return apiRequest<void>(`/deployments/${deploymentId}`, { method: 'DELETE' });
}

export async function stopDeployment(deploymentId: string) {
  return apiRequest<{ deployment: DeploymentRecord }>(`/deployments/${deploymentId}`, {
    method: 'PATCH',
    body: { action: 'stop' },
  });
}

export async function startDeployment(deploymentId: string) {
  return apiRequest<{ deployment: DeploymentRecord }>(`/deployments/${deploymentId}`, {
    method: 'PATCH',
    body: { action: 'start' },
  });
}

export async function predict(deploymentId: string, input: Record<string, unknown>, explain?: boolean) {
  const query = explain ? '?explain=true' : '';
  return apiRequest<PredictionResult>(`/deployments/${deploymentId}/predict${query}`, {
    method: 'POST',
    body: input,
  });
}

export async function getDeploymentSchema(deploymentId: string) {
  return apiRequest<DeploymentSchema>(`/deployments/${deploymentId}/schema`, { method: 'GET' });
}

export async function getPredictionLogs(deploymentId: string, filters?: PredictionLogFilters) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.startTime) params.set('startTime', filters.startTime);
  if (filters?.endTime) params.set('endTime', filters.endTime);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<{ logs: PredictionLog[]; total: number }>(`/deployments/${deploymentId}/logs${query}`, { method: 'GET' });
}

export async function getDeploymentStats(deploymentId: string, timeRange: string) {
  return apiRequest<{ stats: DeploymentStatsHourly[]; range: string }>(`/deployments/${deploymentId}/stats?range=${timeRange}`, { method: 'GET' });
}

export async function runDriftDetection(deploymentId: string) {
  return apiRequest<DriftReport>(`/deployments/${deploymentId}/drift`, { method: 'POST' });
}

export async function createApiKey(deploymentId: string, name: string) {
  return apiRequest<{ key: DeploymentApiKeyInfo; rawKey: string }>(`/deployments/${deploymentId}/api-keys`, {
    method: 'POST',
    body: { name },
  });
}

export async function listApiKeys(deploymentId: string) {
  return apiRequest<{ keys: DeploymentApiKeyInfo[] }>(`/deployments/${deploymentId}/api-keys`, { method: 'GET' });
}

export async function revokeApiKey(deploymentId: string, keyId: string) {
  return apiRequest<void>(`/deployments/${deploymentId}/api-keys/${keyId}`, { method: 'DELETE' });
}

export async function submitFeedback(deploymentId: string, logId: number, feedback: 'positive' | 'negative') {
  return apiRequest<{ ok: boolean }>(`/deployments/${deploymentId}/logs/${logId}/feedback`, {
    method: 'POST',
    body: { feedback },
  });
}

export async function getContainerLogs(deploymentId: string) {
  return apiRequest<{ stdout: string; stderr: string }>(`/deployments/${deploymentId}/container-logs`, { method: 'GET' });
}
