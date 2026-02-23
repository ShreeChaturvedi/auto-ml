export type ModelTaskType = 'classification' | 'regression' | 'clustering';
export type ModelStatus = 'completed' | 'failed';

export interface ModelTemplateParamOption {
  value: string;
  label: string;
}

export interface ModelTemplateParam {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'select';
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: ModelTemplateParamOption[];
}

export interface ModelTemplate {
  id: string;
  name: string;
  taskType: ModelTaskType;
  description: string;
  library: string;
  importPath: string;
  modelClass: string;
  parameters: ModelTemplateParam[];
  defaultParams: Record<string, unknown>;
  metrics: string[];
}

export interface ModelArtifact {
  filename: string;
  path: string;
  size: number;
}

export interface ModelRecord {
  modelId: string;
  projectId: string;
  datasetId: string;
  name: string;
  templateId: string;
  taskType: ModelTaskType;
  library: string;
  algorithm: string;
  parameters: Record<string, unknown>;
  metrics: Record<string, number>;
  status: ModelStatus;
  createdAt: string;
  updatedAt: string;
  trainingMs?: number;
  targetColumn?: string;
  featureColumns?: string[];
  sampleCount?: number;
  artifact?: ModelArtifact;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface TrainModelRequest {
  projectId: string;
  datasetId: string;
  templateId: string;
  targetColumn?: string;
  parameters?: Record<string, unknown>;
  testSize?: number;
  name?: string;
}
