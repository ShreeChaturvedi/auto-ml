// Mock deployment data: overview, recent requests, logs, monitoring time-series.
// Everything is hand-crafted for visual realism — no runtime randomness so that
// the preview paints deterministically across SSR and client hydration.

export interface DeploymentOverview {
  id: string;
  modelName: string;
  modelFamily: string;
  endpoint: string;
  region: string;
  status: 'healthy' | 'degraded' | 'error';
  version: string;
  deployedAt: string;
  deployedAgo: string;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  rps: number;
  errorRate: number;
  uptime: string;
}

export const mockDeployment: DeploymentOverview = {
  id: 'dep_churn_prod_v3',
  modelName: 'XGBoost_v1',
  modelFamily: 'XGBoost',
  endpoint: 'https://api.agentic-automl.dev/v1/novacraft-churn/predict',
  region: 'us-east-1',
  status: 'healthy',
  version: 'v3.2.1',
  deployedAt: '2026-04-10T11:02:44Z',
  deployedAgo: '3h ago',
  p50Ms: 24,
  p95Ms: 58,
  p99Ms: 112,
  rps: 184,
  errorRate: 0.0012,
  uptime: '99.98%',
};

/* ── Recent requests (Overview mini-table) ─────────────────── */

export interface RecentRequest {
  id: string;
  time: string;
  latencyMs: number;
  status: 200 | 400 | 500;
  prediction: string;
}

export const mockRecentRequests: RecentRequest[] = [
  { id: 'req_a8f21', time: '14:23:01', latencyMs: 22, status: 200, prediction: '0.87 (churn)' },
  { id: 'req_a8f20', time: '14:23:00', latencyMs: 18, status: 200, prediction: '0.12 (retain)' },
  { id: 'req_a8f1f', time: '14:22:59', latencyMs: 31, status: 200, prediction: '0.64 (churn)' },
  { id: 'req_a8f1e', time: '14:22:58', latencyMs: 19, status: 200, prediction: '0.08 (retain)' },
  { id: 'req_a8f1d', time: '14:22:57', latencyMs: 27, status: 200, prediction: '0.91 (churn)' },
];

/* ── Playground ─────────────────────────────────────────────── */

export interface PlaygroundInputField {
  name: string;
  label: string;
  type: 'number' | 'text' | 'select';
  value: string | number;
  options?: string[];
}

export const mockPlaygroundInputs: PlaygroundInputField[] = [
  { name: 'mrr_usd',      label: 'MRR (USD)',        type: 'number', value: 249 },
  { name: 'tenure_months', label: 'Tenure (months)', type: 'number', value: 14 },
  { name: 'api_calls',    label: 'API calls / day',  type: 'number', value: 4820 },
  { name: 'plan_tier',    label: 'Plan tier',        type: 'select', value: 'growth', options: ['starter', 'growth', 'enterprise'] },
];

export const mockPlaygroundResponse = {
  prediction: 'churn',
  churn_probability: 0.8721,
  confidence: 0.94,
  top_features: [
    { name: 'tenure_months',    contribution: -0.31 },
    { name: 'api_calls',        contribution: -0.24 },
    { name: 'mrr_usd',          contribution: +0.18 },
    { name: 'support_tickets',  contribution: +0.11 },
  ],
  model_version: 'v3.2.1',
  latency_ms: 23,
};

/* ── API docs / curl ────────────────────────────────────────── */

export const mockCurlSnippet = `curl -X POST https://api.agentic-automl.dev/v1/novacraft-churn/predict \\
  -H "Authorization: Bearer $AGENTIC_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "mrr_usd": 249,
    "tenure_months": 14,
    "api_calls": 4820,
    "plan_tier": "growth"
  }'`;

export interface ApiField {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export const mockRequestSchema: ApiField[] = [
  { name: 'mrr_usd',       type: 'number',  required: true,  description: 'Monthly recurring revenue in USD.' },
  { name: 'tenure_months', type: 'integer', required: true,  description: 'Customer tenure in whole months.' },
  { name: 'api_calls',     type: 'integer', required: true,  description: 'Rolling 24h API call count.' },
  { name: 'plan_tier',     type: 'string',  required: true,  description: 'One of: starter, growth, enterprise.' },
  { name: 'explain',       type: 'boolean', required: false, description: 'Include SHAP feature attributions.' },
];

export const mockResponseSchema: ApiField[] = [
  { name: 'prediction',        type: 'string', required: true, description: 'Predicted class label.' },
  { name: 'churn_probability', type: 'number', required: true, description: 'Probability of churn, [0, 1].' },
  { name: 'confidence',        type: 'number', required: true, description: 'Model confidence in prediction.' },
  { name: 'model_version',     type: 'string', required: true, description: 'Model version that served the request.' },
  { name: 'latency_ms',        type: 'integer', required: true, description: 'Server-side handling latency.' },
];

/* ── Logs (20 static lines) ─────────────────────────────────── */

export interface LogLine {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  requestId: string;
  message: string;
}

export const mockLogs: LogLine[] = [
  { timestamp: '2026-04-10T14:23:08Z', level: 'INFO',  requestId: 'req_a8f28', message: 'POST /predict 200 latency=22ms class=churn p=0.87' },
  { timestamp: '2026-04-10T14:23:07Z', level: 'INFO',  requestId: 'req_a8f27', message: 'POST /predict 200 latency=18ms class=retain p=0.12' },
  { timestamp: '2026-04-10T14:23:07Z', level: 'INFO',  requestId: 'req_a8f26', message: 'POST /predict 200 latency=31ms class=churn p=0.64' },
  { timestamp: '2026-04-10T14:23:06Z', level: 'INFO',  requestId: 'req_a8f25', message: 'POST /predict 200 latency=19ms class=retain p=0.08' },
  { timestamp: '2026-04-10T14:23:05Z', level: 'WARN',  requestId: 'req_a8f24', message: 'feature "tenure_months" missing, imputed with median=12' },
  { timestamp: '2026-04-10T14:23:04Z', level: 'INFO',  requestId: 'req_a8f23', message: 'POST /predict 200 latency=27ms class=churn p=0.91' },
  { timestamp: '2026-04-10T14:23:03Z', level: 'INFO',  requestId: 'req_a8f22', message: 'POST /predict 200 latency=23ms class=retain p=0.19' },
  { timestamp: '2026-04-10T14:23:02Z', level: 'INFO',  requestId: 'req_a8f21', message: 'POST /predict 200 latency=21ms class=retain p=0.14' },
  { timestamp: '2026-04-10T14:23:01Z', level: 'ERROR', requestId: 'req_a8f20', message: 'POST /predict 400 invalid body: missing field "plan_tier"' },
  { timestamp: '2026-04-10T14:23:00Z', level: 'INFO',  requestId: 'req_a8f1f', message: 'POST /predict 200 latency=25ms class=churn p=0.72' },
  { timestamp: '2026-04-10T14:22:59Z', level: 'INFO',  requestId: 'req_a8f1e', message: 'POST /predict 200 latency=17ms class=retain p=0.06' },
  { timestamp: '2026-04-10T14:22:58Z', level: 'INFO',  requestId: 'req_a8f1d', message: 'POST /predict 200 latency=20ms class=churn p=0.55' },
  { timestamp: '2026-04-10T14:22:57Z', level: 'WARN',  requestId: 'req_a8f1c', message: 'p95 latency 62ms exceeded soft SLO (60ms)' },
  { timestamp: '2026-04-10T14:22:56Z', level: 'INFO',  requestId: 'req_a8f1b', message: 'POST /predict 200 latency=28ms class=retain p=0.22' },
  { timestamp: '2026-04-10T14:22:55Z', level: 'INFO',  requestId: 'req_a8f1a', message: 'POST /predict 200 latency=19ms class=churn p=0.84' },
  { timestamp: '2026-04-10T14:22:54Z', level: 'INFO',  requestId: 'req_a8f19', message: 'POST /predict 200 latency=24ms class=retain p=0.11' },
  { timestamp: '2026-04-10T14:22:53Z', level: 'INFO',  requestId: 'req_a8f18', message: 'POST /predict 200 latency=22ms class=churn p=0.69' },
  { timestamp: '2026-04-10T14:22:52Z', level: 'INFO',  requestId: 'req_a8f17', message: 'health check OK (docker.runtime=ready, redis=ready)' },
  { timestamp: '2026-04-10T14:22:51Z', level: 'INFO',  requestId: 'req_a8f16', message: 'POST /predict 200 latency=26ms class=retain p=0.16' },
  { timestamp: '2026-04-10T14:22:50Z', level: 'INFO',  requestId: 'req_a8f15', message: 'POST /predict 200 latency=21ms class=churn p=0.78' },
];

/* ── Monitoring time-series (60 points, one per minute) ────── */

function tick(i: number): string {
  // Build HH:MM labels going back 60 minutes from 14:23.
  const total = 13 * 60 + 23 - (60 - i);
  const hh = Math.floor(total / 60).toString().padStart(2, '0');
  const mm = (total % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

export type LatencyPoint = { t: string; p50: number; p95: number };
export type RpsPoint     = { t: string; rps: number };
export type ErrorPoint   = { t: string; rate: number };

// Hand-tuned deterministic series — sine-based variance, no Math.random.
export const mockLatencyHistory: LatencyPoint[] = Array.from({ length: 60 }, (_, i) => ({
  t: tick(i),
  p50: Math.round(22 + Math.sin(i / 5) * 3 + Math.cos(i / 9) * 2),
  p95: Math.round(54 + Math.sin(i / 7) * 6 + Math.cos(i / 11) * 4),
}));

export const mockRpsHistory: RpsPoint[] = Array.from({ length: 60 }, (_, i) => ({
  t: tick(i),
  rps: Math.round(180 + Math.cos(i / 4) * 18 + Math.sin(i / 13) * 9),
}));

export const mockErrorHistory: ErrorPoint[] = Array.from({ length: 60 }, (_, i) => {
  const base = 0.0009 + Math.sin(i / 11) * 0.0004 + Math.cos(i / 17) * 0.0003;
  return { t: tick(i), rate: Math.max(0, Number(base.toFixed(5))) };
});
