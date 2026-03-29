import { apiFetch, apiRequest } from './client';
import type { ColumnDataType, EdaSummary } from '@/types/file';

export interface UploadDatasetResponse {
  dataset: {
    datasetId: string;
    projectId?: string;
    filename: string;
    fileType: string;
    size: number;
    n_rows: number;
    n_cols: number;
    columns: string[];
    dtypes: Record<string, ColumnDataType>;
    null_counts: Record<string, number>;
    sample: Record<string, unknown>[];
    createdAt: string;
    tableName?: string; // Postgres table name for SQL querying
    eda?: EdaSummary;
  };
}

export async function uploadDatasetFile(file: File, projectId?: string) {
  const formData = new FormData();
  formData.append('file', file);
  if (projectId) {
    formData.append('projectId', projectId);
  }

  return apiRequest<UploadDatasetResponse>('/upload/dataset', {
    method: 'POST',
    body: formData
  });
}

export interface DatasetProfile {
  datasetId: string;
  projectId?: string;
  filename: string;
  fileType: string;
  size: number;
  nRows: number;
  nCols: number;
  columns: Array<{
    name: string;
    dtype: ColumnDataType;
    nullCount: number;
    uniqueCount?: number;
    sampleCount?: number;
    topValues?: Array<{ value: string; count: number; percentage: number }>;
    min?: number;
    max?: number;
    mean?: number;
    median?: number;
    stdDev?: number;
    skewness?: number;
    q1?: number;
    q3?: number;
    minDate?: string;
    maxDate?: string;
  }>;
  sample: Record<string, unknown>[];
  createdAt: string;
  updatedAt: string;
  tableName?: string;
  metadata?: {
    tableName?: string;
    rowsLoaded?: number;
    [key: string]: unknown;
  };
}

export async function updateDatasetColumnType(
  datasetId: string,
  columnName: string,
  dtype: ColumnDataType
) {
  return apiRequest<UploadDatasetResponse>(
    `/datasets/${datasetId}/columns/${encodeURIComponent(columnName)}`,
    {
      method: 'PUT',
      body: { dtype }
    }
  );
}

export async function listDatasets(projectId?: string) {
  const url = projectId ? `/datasets?projectId=${projectId}` : '/datasets';
  return apiRequest<{ datasets: DatasetProfile[] }>(url, { method: 'GET' });
}

export async function getDatasetSample(datasetId: string) {
  return apiRequest<{
    sample: Record<string, unknown>[];
    columns: string[];
    rowCount: number;
  }>(`/datasets/${datasetId}/sample`, { method: 'GET' });
}

export async function getDatasetRows(
  datasetId: string,
  options: { offset: number; limit: number }
) {
  const search = new URLSearchParams({
    offset: String(options.offset),
    limit: String(options.limit)
  });

  return apiRequest<{
    rows: Record<string, unknown>[];
    columns: string[];
    rowCount: number;
    offset: number;
    limit: number;
  }>(`/datasets/${datasetId}/rows?${search.toString()}`, { method: 'GET' });
}

export async function renameDataset(datasetId: string, filename: string) {
  return apiRequest<{ dataset: DatasetProfile }>(`/datasets/${datasetId}`, {
    method: 'PATCH',
    body: { filename }
  });
}

export async function deleteDataset(datasetId: string) {
  return apiRequest<{ success: boolean }>(`/datasets/${datasetId}`, { method: 'DELETE' });
}

/**
 * Download raw dataset file content
 */
export async function downloadDataset(datasetId: string): Promise<ArrayBuffer> {
  const response = await apiFetch(`/datasets/${datasetId}/download`);

  if (!response.ok) {
    throw new Error(`Failed to download dataset: ${response.statusText}`);
  }

  return response.arrayBuffer();
}
