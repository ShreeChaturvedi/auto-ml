import { apiRequest } from './client';
import type { AvailableTable } from '@/types/preprocessing';

export async function listAvailableTables(projectId?: string): Promise<{ tables: AvailableTable[] }> {
  const url = projectId 
    ? `/preprocessing/tables?projectId=${projectId}` 
    : '/preprocessing/tables';
  return apiRequest<{ tables: AvailableTable[] }>(url, { method: 'GET' });
}
