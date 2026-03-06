import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';

const BACKEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function resolveBackendPath(value: string): string {
  return isAbsolute(value) ? value : resolve(BACKEND_ROOT, value);
}

loadEnv();
loadEnv({ path: resolve(BACKEND_ROOT, '.env') });

const DEFAULT_GEMINI_MODEL = 'gemini-3.1-pro-preview-customtools';
const DEFAULT_NL2SQL_MODEL = 'gemini-3-flash-preview';
const RESOLVED_LLM_MODEL = process.env.LLM_MODEL ?? DEFAULT_GEMINI_MODEL;
const RESOLVED_GEMINI_MODEL = process.env.GEMINI_MODEL ?? RESOLVED_LLM_MODEL;
const RESOLVED_GEMINI_THINKING_MODEL = process.env.GEMINI_THINKING_MODEL ?? RESOLVED_LLM_MODEL;
const RESOLVED_NL2SQL_MODEL = process.env.NL2SQL_MODEL ?? DEFAULT_NL2SQL_MODEL;

const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:4173'
];

function parseOrigins(value: string | undefined): string[] {
  if (!value) return DEFAULT_ORIGINS;
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parsePort(value: string | undefined): number {
  const fallback = 4000;
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseFloatValue(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parsePort(process.env.PORT),
  allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
  storagePath: resolveBackendPath(process.env.STORAGE_PATH ?? 'storage/projects.json'),
  preprocessingRunsPath: resolveBackendPath(process.env.PREPROCESSING_RUNS_PATH ?? 'storage/preprocessing/runs.json'),
  datasetStorageDir: resolveBackendPath(process.env.DATASET_STORAGE_DIR ?? 'storage/datasets/files'),
  datasetUploadMaxMb: parseInteger(process.env.DATASET_UPLOAD_MAX_MB, 300),
  documentStorageDir: resolveBackendPath(process.env.DOCUMENT_STORAGE_DIR ?? 'storage/documents/files'),
  datasetMetadataPath: resolveBackendPath(process.env.DATASET_METADATA_PATH ?? 'storage/datasets/metadata.json'),
  modelStorageDir: resolveBackendPath(process.env.MODEL_STORAGE_DIR ?? 'storage/models/artifacts'),
  modelMetadataPath: resolveBackendPath(process.env.MODEL_METADATA_PATH ?? 'storage/models/metadata.json'),
  databaseUrl: process.env.DATABASE_URL,
  pgSslMode: process.env.PGSSLMODE ?? 'disable',
  pgPoolMin: parseInteger(process.env.PG_POOL_MIN, 0),
  pgPoolMax: parseInteger(process.env.PG_POOL_MAX, 10),
  sqlStatementTimeoutMs: parseInteger(process.env.SQL_STATEMENT_TIMEOUT_MS, 5000),
  sqlMaxRows: parseInteger(process.env.SQL_MAX_ROWS, 1000),
  sqlDefaultLimit: parseInteger(process.env.SQL_DEFAULT_LIMIT, 200),
  queryCacheTtlMs: parseInteger(process.env.QUERY_CACHE_TTL_MS, 5 * 60 * 1000),
  queryCacheMaxEntries: parseInteger(process.env.QUERY_CACHE_MAX_ENTRIES, 500),
  docChunkSize: parseInteger(process.env.DOC_CHUNK_SIZE, 500),
  docChunkOverlap: parseInteger(process.env.DOC_CHUNK_OVERLAP, 50),
  answerCacheTtlMs: parseInteger(process.env.ANSWER_CACHE_TTL_MS, 2 * 60 * 1000),

  // Execution Environment
  executionTimeoutMs: parseInteger(process.env.EXECUTION_TIMEOUT_MS, 30000),
  executionMaxMemoryMb: parseInteger(process.env.EXECUTION_MAX_MEMORY_MB, 2048),
  executionMaxCpuPercent: parseInteger(process.env.EXECUTION_MAX_CPU_PERCENT, 100),
  executionTmpfsMb: parseInteger(process.env.EXECUTION_TMPFS_MB, 1024),
  executionDockerPlatform: process.env.EXECUTION_DOCKER_PLATFORM ?? '',
  dockerEnabled: process.env.DOCKER_ENABLED !== 'false',
  dockerImage: process.env.DOCKER_IMAGE ?? 'automl-python-runtime:latest',
  executionNetwork: process.env.EXECUTION_NETWORK ?? 'bridge',
  executionAutoBuildImage: process.env.EXECUTION_AUTO_BUILD_IMAGE !== 'false',
  executionWorkspaceDir: resolveBackendPath(process.env.EXECUTION_WORKSPACE_DIR ?? 'storage/workspaces'),

  // Authentication
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
  bcryptRounds: parseInteger(process.env.BCRYPT_ROUNDS, 12),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',

  // Email (SMTP)
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: parseInteger(process.env.SMTP_PORT, 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPassword: process.env.SMTP_PASSWORD ?? '',
  smtpFrom: process.env.SMTP_FROM ?? 'AutoML Toolchain <noreply@example.com>',

  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:5173/auth/google/callback',

  // LLM Providers
  llmProvider: process.env.LLM_PROVIDER ?? 'gemini',
  llmApiKey: process.env.LLM_API_KEY ?? '',
  llmBaseUrl: process.env.LLM_BASE_URL ?? '',
  llmModel: RESOLVED_LLM_MODEL,
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModel: RESOLVED_GEMINI_MODEL,
  geminiThinkingModel: RESOLVED_GEMINI_THINKING_MODEL,
  llmTimeoutMs: parseInteger(process.env.LLM_TIMEOUT_MS, 60000),
  preprocessingLlmTimeoutMs: parseInteger(process.env.PREPROCESSING_LLM_TIMEOUT_MS, 120000),
  preprocessingThinkingLlmTimeoutMs: parseInteger(process.env.PREPROCESSING_THINKING_LLM_TIMEOUT_MS, 180000),
  nl2sqlModel: RESOLVED_NL2SQL_MODEL,
  nl2sqlEnableThinking: process.env.NL2SQL_ENABLE_THINKING === 'true',
  nl2sqlTimeoutMs: parseInteger(process.env.NL2SQL_TIMEOUT_MS, 25000),
  nl2sqlMaxTablesContext: parseInteger(process.env.NL2SQL_MAX_TABLES_CONTEXT, 8),
  nl2sqlMaxColumnsPerTable: parseInteger(process.env.NL2SQL_MAX_COLUMNS_PER_TABLE, 40),
  nl2sqlWarnConfidenceThreshold: parseFloatValue(process.env.NL2SQL_WARN_CONFIDENCE_THRESHOLD, 0.72),

  // Notebook System
  notebookOutputDir: resolveBackendPath(process.env.NOTEBOOK_OUTPUT_DIR ?? 'storage/outputs'),
  notebookOutputMaxSize: parseInteger(process.env.NOTEBOOK_OUTPUT_MAX_SIZE, 10 * 1024), // 10KB threshold
  notebookLockTimeoutMs: parseInteger(process.env.NOTEBOOK_LOCK_TIMEOUT_MS, 60000), // 1 minute auto-release

  // WebSocket
  wsHeartbeatMs: parseInteger(process.env.WS_HEARTBEAT_MS, 30000),
  wsReconnectMaxAttempts: parseInteger(process.env.WS_RECONNECT_MAX_ATTEMPTS, 5)
};
