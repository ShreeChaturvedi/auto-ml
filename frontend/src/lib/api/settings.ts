import { apiRequest } from './client';

export interface RuntimeSettings {
  queryCacheTtlMs: number;
  sqlMaxRows: number;
  sqlDefaultLimit: number;
  executionTimeoutMs: number;
  executionMaxMemoryMb: number;
}

export async function fetchSettings(): Promise<RuntimeSettings> {
  const res = await apiRequest<{ settings: RuntimeSettings }>('/settings');
  return res.settings;
}

export async function patchSettings(settings: Partial<RuntimeSettings>): Promise<RuntimeSettings> {
  const res = await apiRequest<{ settings: RuntimeSettings }>('/settings', {
    method: 'PATCH',
    body: { settings },
  });
  return res.settings;
}
