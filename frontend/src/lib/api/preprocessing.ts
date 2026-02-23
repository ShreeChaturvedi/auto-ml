/**
 * Preprocessing API Client
 */

import { apiRequest } from './client';
import type { PreprocessingResponse, AvailableTable } from '@/types/preprocessing';

export interface AnalyzeRequest {
  projectId: string;
  datasetId: string;
  sampleSize?: number;
}

export async function analyzeForPreprocessing(request: AnalyzeRequest): Promise<PreprocessingResponse> {
  return apiRequest<PreprocessingResponse>('/preprocessing/analyze', {
    method: 'POST',
    body: JSON.stringify(request)
  });
}

export async function listAvailableTables(projectId?: string): Promise<{ tables: AvailableTable[] }> {
  const url = projectId 
    ? `/preprocessing/tables?projectId=${projectId}` 
    : '/preprocessing/tables';
  return apiRequest<{ tables: AvailableTable[] }>(url, { method: 'GET' });
}



