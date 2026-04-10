// Mock deployment overview + logs + monitoring history.

export interface DeploymentOverview {
  id: string;
  modelName: string;
  modelFamily: string;
  endpoint: string;
  status: 'healthy' | 'degraded' | 'error';
  version: string;
  deployedAt: string;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  rps: number;
  errorRate: number;
}

export const mockDeployment: DeploymentOverview = {
  id: 'dep_churn_prod_v3',
  modelName: 'xgboost_v3',
  modelFamily: 'XGBoost',
  endpoint: 'https://api.agentic-automl.dev/models/novacraft-churn/v3/predict',
  status: 'healthy',
  version: 'v3.2.1',
  deployedAt: '2026-03-12T11:02:44Z',
  p50Ms: 24,
  p95Ms: 58,
  p99Ms: 112,
  rps: 184,
  errorRate: 0.0012,
};

export const mockLogs: { timestamp: string; level: 'INFO' | 'WARN' | 'ERROR'; message: string }[] = [
  { timestamp: '12:41:08', level: 'INFO',  message: 'POST /predict 200 (24ms) customer_id=NC-01492' },
  { timestamp: '12:41:08', level: 'INFO',  message: 'POST /predict 200 (18ms) customer_id=NC-02103' },
  { timestamp: '12:41:08', level: 'INFO',  message: 'POST /predict 200 (31ms) customer_id=NC-00847' },
  { timestamp: '12:41:07', level: 'INFO',  message: 'POST /predict 200 (22ms) customer_id=NC-01736' },
  { timestamp: '12:41:07', level: 'WARN',  message: 'Feature "recency_days" imputed (missing from request)' },
  { timestamp: '12:41:07', level: 'INFO',  message: 'POST /predict 200 (19ms) customer_id=NC-00421' },
  { timestamp: '12:41:06', level: 'INFO',  message: 'POST /predict 200 (28ms) customer_id=NC-02298' },
  { timestamp: '12:41:06', level: 'INFO',  message: 'POST /predict 200 (21ms) customer_id=NC-01175' },
  { timestamp: '12:41:05', level: 'INFO',  message: 'POST /predict 200 (17ms) customer_id=NC-00639' },
  { timestamp: '12:41:05', level: 'INFO',  message: 'POST /predict 200 (34ms) customer_id=NC-02041' },
  { timestamp: '12:41:04', level: 'INFO',  message: 'POST /predict 200 (23ms) customer_id=NC-00512' },
  { timestamp: '12:41:04', level: 'ERROR', message: 'POST /predict 400 missing field "customer_id"' },
  { timestamp: '12:41:03', level: 'INFO',  message: 'POST /predict 200 (26ms) customer_id=NC-01889' },
  { timestamp: '12:41:03', level: 'INFO',  message: 'POST /predict 200 (20ms) customer_id=NC-00284' },
  { timestamp: '12:41:02', level: 'INFO',  message: 'POST /predict 200 (25ms) customer_id=NC-01661' },
  { timestamp: '12:41:02', level: 'INFO',  message: 'Health check OK' },
];

export const mockLatencyHistory = Array.from({ length: 60 }).map((_, i) => ({
  t: i,
  p50: 22 + Math.round(Math.sin(i / 5) * 3 + Math.random() * 2),
  p95: 54 + Math.round(Math.sin(i / 7) * 6 + Math.random() * 4),
}));

export const mockRpsHistory = Array.from({ length: 60 }).map((_, i) => ({
  t: i,
  rps: 180 + Math.round(Math.cos(i / 4) * 18 + Math.random() * 6),
}));

export const mockErrorHistory = Array.from({ length: 60 }).map((_, i) => ({
  t: i,
  rate: Math.max(0, 0.0008 + Math.sin(i / 11) * 0.0005 + Math.random() * 0.0003),
}));
