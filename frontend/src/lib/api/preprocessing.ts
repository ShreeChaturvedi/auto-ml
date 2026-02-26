import { apiRequest } from './client';
import type { 
  AnalyzePreprocessingResponse, 
  AvailableTable,
  RefinePreprocessingRequest,
  RefinePreprocessingResponse,
  ExecutePreprocessingRequest,
  ExecutePreprocessingResponse
} from '@/types/preprocessing';

export interface AnalyzeRequest {
  projectId: string;
  datasetId: string;
  sampleSize?: number;
}

export async function analyzeForPreprocessing(request: AnalyzeRequest): Promise<AnalyzePreprocessingResponse> {
  return apiRequest<AnalyzePreprocessingResponse>('/preprocessing/analyze', {
    method: 'POST',
    body: JSON.stringify(request)
  });
}

export async function refinePreprocessingPipeline(request: RefinePreprocessingRequest): Promise<RefinePreprocessingResponse> {
  return apiRequest<RefinePreprocessingResponse>('/preprocessing/refine', {
    method: 'POST',
    body: JSON.stringify(request)
  });
}

export async function executePreprocessingPipeline(request: ExecutePreprocessingRequest): Promise<ExecutePreprocessingResponse> {
  return apiRequest<ExecutePreprocessingResponse>('/preprocessing/execute', {
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
