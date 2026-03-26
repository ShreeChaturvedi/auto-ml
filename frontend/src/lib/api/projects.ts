import type { Phase } from '@/types/phase';

import { apiRequest } from './client';

export interface ApiProjectMetadata {
  unlockedPhases?: Phase[];
  completedPhases?: Phase[];
  currentPhase?: Phase;
  customInstructions?: string;
  [key: string]: unknown;
}

export interface ApiProject {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: ApiProjectMetadata;
}

export interface ApiProjectPayload {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  metadata?: ApiProjectMetadata;
}

export async function listProjects() {
  return apiRequest<{ projects: ApiProject[] }>('/projects');
}

export async function createProject(payload: ApiProjectPayload) {
  return apiRequest<{ project: ApiProject }>('/projects', {
    method: 'POST',
    body: payload
  });
}

export async function updateProject(id: string, payload: Partial<ApiProjectPayload>) {
  return apiRequest<{ project: ApiProject }>(`/projects/${id}`, {
    method: 'PATCH',
    body: payload
  });
}

export async function deleteProject(id: string) {
  return apiRequest<void>(`/projects/${id}`, {
    method: 'DELETE',
    parseJson: false
  });
}
