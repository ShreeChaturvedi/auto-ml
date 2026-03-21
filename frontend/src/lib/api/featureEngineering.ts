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

// ---------------------------------------------------------------------------
// Feature pipeline run state
// ---------------------------------------------------------------------------

export interface FeatureStepRecord {
  featureId: string;
  name: string;
  method: string;
  rationale?: string;
  sourceColumns?: string[];
  impact?: string;
  code?: string;
  codeHash?: string;
  outputColumns?: string[];
  status: string;
  executionResult?: { succeeded: boolean; stdout?: string; stderr?: string; executionMs?: number };
  validation?: { nullRate?: number; correlationWithTarget?: number; leakageRisk?: string; distributionNotes?: string };
  registeredAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeaturePipelineRunState {
  runId: string;
  projectId: string;
  features: Record<string, FeatureStepRecord>;
  createdAt: string;
  updatedAt: string;
}

interface FeatureRunsListResponse {
  projectId: string;
  count: number;
  runs: FeaturePipelineRunState[];
}

interface FeatureRunResponse {
  run: FeaturePipelineRunState;
}

export async function fetchFeatureRuns(projectId: string): Promise<FeatureRunsListResponse> {
  return apiRequest<FeatureRunsListResponse>(
    `/feature-engineering/runs?projectId=${encodeURIComponent(projectId)}`
  );
}

export async function fetchFeatureRun(runId: string): Promise<FeatureRunResponse> {
  return apiRequest<FeatureRunResponse>(
    `/feature-engineering/runs/${encodeURIComponent(runId)}`
  );
}
