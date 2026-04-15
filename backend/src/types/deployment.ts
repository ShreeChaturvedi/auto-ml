export type DeploymentStatus = 'creating' | 'starting' | 'healthy' | 'unhealthy' | 'stopping' | 'stopped' | 'failed';

export interface DeploymentRecord {
  deploymentId: string;
  modelId: string;
  projectId: string;
  name: string;
  status: DeploymentStatus;
  containerId?: string;
  port?: number;
  endpointUrl?: string;
  errorMessage?: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  stoppedAt?: string;
}

export interface PredictionLog {
  id: number;
  deploymentId: string;
  modelId: string;
  projectId: string;
  createdAt: string;
  latencyMs?: number;
  inputFeatures: Record<string, unknown>;
  prediction: Record<string, unknown>;
  status: 'success' | 'error';
  errorMessage?: string;
  feedback?: string;
  feedbackAt?: string;
  metadata: Record<string, unknown>;
}

export interface DeploymentStatsHourly {
  deploymentId: string;
  hourBucket: string;
  requestCount: number;
  errorCount: number;
  latencyP50?: number;
  latencyP95?: number;
  latencyP99?: number;
  latencyAvg?: number;
}

export interface DeploymentApiKey {
  keyId: string;
  deploymentId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  keySalt: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface DriftFeatureResult {
  feature: string;
  type: 'numeric' | 'categorical';
  psi: number;
  status: 'green' | 'yellow' | 'red';
  testStatistic?: number;
  pValue?: number;
  testType: 'ks' | 'chi2';
  baselineDistribution: number[] | Record<string, number>;
  currentDistribution: number[] | Record<string, number>;
}

export interface DriftReport {
  available: boolean;
  reason?: string;
  timestamp?: string;
  overallStatus?: 'green' | 'yellow' | 'red';
  features?: DriftFeatureResult[];
  predictionDrift?: {
    psi: number;
    status: 'green' | 'yellow' | 'red';
    baselineDistribution: number[] | Record<string, number>;
    currentDistribution: number[] | Record<string, number>;
  };
}

export interface DeploymentSchemaResponse {
  featureColumns: string[];
  featureTypes: Record<string, 'float' | 'int' | 'str'>;
  sampleRequest: Record<string, unknown>;
  taskType: 'classification' | 'regression';
  targetColumn: string;
  featureImportance: { name: string; importance: number; std: number }[];
  classLabels?: string[];
  metrics: Record<string, number>;
  featureRanges: Record<string, { min: number; max: number; q25: number; q50: number; q75: number }>;
  categoricalValues: Record<string, string[]>;
  predictionDistribution: { bins: number[]; counts: number[] } | Record<string, number>;
  readiness: {
    cvStable: boolean;
    cvScore: number;
    cvStd: number;
    overfitRisk: 'low' | 'medium' | 'high';
    trainTestGap: number;
    featureImportanceStable: boolean;
    sampleCount: number;
    evaluationComplete: boolean;
  };
}

/** In-memory cache entry for active deployments */
export interface DeploymentCacheEntry {
  deploymentId: string;
  modelId: string;
  projectId: string;
  containerId: string;
  port: number;
  status: DeploymentStatus;
  consecutiveFailures: number;
  lastHealthCheck?: Date;
}

export interface CreateDeploymentRequest {
  modelId: string;
  projectId: string;
  name: string;
}

export interface PredictionLogFilters {
  status?: 'success' | 'error';
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
}

/** WebSocket event types for deployment status updates */
export type DeploymentWSEvent =
  | { type: 'status_change'; deploymentId: string; status: DeploymentStatus; errorMessage?: string }
  | { type: 'health_update'; deploymentId: string; healthy: boolean; latencyMs?: number }
  | { type: 'deployment_snapshot'; deployment: DeploymentRecord };
