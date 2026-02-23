import { apiRequest } from './client';
import type { UploadDatasetResponse } from './datasets';
import type { FeatureSpec } from '@/types/feature';
import type { PythonVersion } from '@/lib/api/execution';

export interface ApplyFeatureEngineeringRequest {
  projectId: string;
  datasetId: string;
  outputName?: string;
  outputFormat?: 'csv' | 'json' | 'xlsx';
  pythonVersion?: PythonVersion;
  features: FeatureSpec[];
}

export async function applyFeatureEngineering(
  request: ApplyFeatureEngineeringRequest
): Promise<UploadDatasetResponse> {
  return apiRequest<UploadDatasetResponse>('/feature-engineering/apply', {
    method: 'POST',
    body: JSON.stringify(request)
  });
}
