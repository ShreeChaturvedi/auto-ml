import type { APIRequestContext } from '@playwright/test';

interface CreateProjectResponse {
  project: {
    id: string;
  };
}

const benchmarkApiBase = process.env.BENCHMARK_API_BASE;

function stripTrailingSlash(value: string) {
  return value.replace(/\/$/, '');
}

export function getApiOrigin() {
  const raw = benchmarkApiBase ?? process.env.AUTOML_API_BASE_URL ?? 'http://127.0.0.1:4000';
  const normalized = stripTrailingSlash(raw);
  return normalized.endsWith('/api') ? normalized.slice(0, -4) : normalized;
}

export function getApiBase() {
  return `${getApiOrigin()}/api`;
}

export function getFrontendBase() {
  return stripTrailingSlash(process.env.AUTOML_FRONTEND_BASE_URL ?? 'http://127.0.0.1:5173');
}

const API_BASE_URL = getApiOrigin();

export async function resetBackendData(request: APIRequestContext) {
  await request.delete(`${API_BASE_URL}/api/projects/reset`);
}

export async function apiCreateProject(request: APIRequestContext, payload: Record<string, unknown>) {
  const response = await request.post(`${API_BASE_URL}/api/projects`, {
    data: payload
  });

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Project creation failed: ${response.status()} - ${text}`);
  }

  return (await response.json()) as CreateProjectResponse;
}
