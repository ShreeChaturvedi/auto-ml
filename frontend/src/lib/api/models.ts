import { apiRequest, getApiBaseUrl } from './client';
import type { ModelRecord, ModelTemplate, TrainModelRequest } from '@/types/model';

export async function listModelTemplates() {
  return apiRequest<{ templates: ModelTemplate[] }>('/models/templates', { method: 'GET' });
}

export async function listModels(projectId?: string) {
  const query = projectId ? `?projectId=${projectId}` : '';
  return apiRequest<{ models: ModelRecord[] }>(`/models${query}`, { method: 'GET' });
}

export async function trainModel(request: TrainModelRequest) {
  return apiRequest<{ model: ModelRecord; success: boolean; message: string }>(
    '/models/train',
    {
      method: 'POST',
      body: JSON.stringify(request)
    }
  );
}


export function getModelArtifactUrl(modelId: string) {
  return `${getApiBaseUrl()}/models/${modelId}/artifact`;
}
