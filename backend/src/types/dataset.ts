export type DatasetFileType = 'csv' | 'json' | 'xlsx';

export interface DatasetProfileColumn {
  name: string;
  dtype: string;
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
}

export interface DatasetProfile {
  datasetId: string;
  projectId?: string;
  filename: string;
  fileType: DatasetFileType;
  size: number;
  nRows: number;
  nCols: number;
  columns: DatasetProfileColumn[];
  sample: Record<string, unknown>[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface DatasetProfileInput {
  projectId?: string;
  filename: string;
  fileType: DatasetFileType;
  size: number;
  profile: {
    nRows: number;
    columns: DatasetProfileColumn[];
    sample: Record<string, unknown>[];
  };
  metadata?: Record<string, unknown>;
}
