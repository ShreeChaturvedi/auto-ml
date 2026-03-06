# API Contracts – Query, Documents, Answering

This document gives the definitive request/response schemas for the Sprint 3 + Sprint 4 endpoints so the frontend and backend stay in sync.

## `/api/query/sql` (POST)

**Request**

```ts
interface SqlQueryRequest {
  projectId: string; // UUID
  sql: string;       // Read-only SELECT/CTE
}
```

**Response**

```ts
interface SqlQueryResponse {
  query: {
    queryId: string;
    sql: string;
    columns: Array<{ name: string; dataTypeID?: number }>;
    rows: Array<Record<string, unknown>>;
    rowCount: number;
    executionMs: number;
    eda?: {
      numericColumns: Array<{ column: string; min: number; max: number; mean: number; stdDev: number }>;
      histogram?: { column: string; buckets: Array<{ start: number; end: number; count: number }> };
      scatter?: { xColumn: string; yColumn: string; points: Array<{ x: number; y: number }> };
      correlations?: Array<{ columnA: string; columnB: string; coefficient: number }>;
    };
    cached: boolean;
    cacheTimestamp?: string;
  };
}
```

Notes: non-SELECT statements are rejected (`400`). When Postgres is unavailable the API returns `503`.

## `/api/query/nl` (POST)

**Request**

```ts
interface NlQueryRequest {
  projectId: string;
  query: string; // natural language prompt
  tableName?: string; // optional default table to target
}
```

**Response**

```ts
interface NlQueryResponse {
  nl: {
    sql: string;
    rationale: string;
    explanation: {
      intentSummary: string;
      selectedTables: string[];
      joinPlan: Array<{
        leftTable: string;
        leftColumn: string;
        rightTable: string;
        rightColumn: string;
        joinType: 'inner' | 'left' | 'right' | 'full';
        confidence: number;
        reason: string;
      }>;
      filters: string[];
      aggregations: string[];
      assumptions: string[];
      validationNotes: string[];
      confidence: number;
      warningLevel: 'none' | 'low' | 'medium' | 'high';
      confidenceMode: 'model' | 'repair';
      reliabilityTier: 'high' | 'medium' | 'low';
    };
    queryId: string;
    cached: boolean;
    query: SqlQueryResponse['query'] | null;
    queryExecutionError?: string | null; // present when generation succeeded but initial execution failed
  };
}
```

## `/api/query/nl/stream` (POST, NDJSON stream)

Same request payload as `/api/query/nl`.

**Response (application/x-ndjson)**

```ts
type NlQueryStreamEvent =
  | {
      type: 'phase_started' | 'phase_progress' | 'phase_completed' | 'phase_failed';
      phaseId:
        | 'schema_context'
        | 'planning'
        | 'sql_generation'
        | 'validation'
        | 'initial_execution'
        | 'repair'
        | 'done';
      summary: string;
      timestamp: string;
      details?: Record<string, unknown>;
    }
  | { type: 'result'; nl: NlQueryResponse['nl'] }
  | { type: 'done' };
```

Notes:
- `phase_*` events stream model and execution progress in order.
- `result` emits the same final `nl` payload shape as `/api/query/nl`.
- `done` always terminates the stream.

---

## `/api/upload/dataset` (POST, multipart/form-data)

Form fields:

| Field      | Type          | Notes                                    |
| ---------- | ------------- | ---------------------------------------- |
| `file`     | File          | Required. Accepts `csv`, `json`, `xlsx`. |
| `projectId`| String (UUID) | Optional; associates dataset with project. |

**Response**

```ts
interface UploadDatasetResponse {
  dataset: {
    datasetId: string;
    projectId?: string;
    filename: string;
    fileType: string;
    size: number;
    n_rows: number;
    n_cols: number;
    columns: string[];
    dtypes: Record<string, string>;
    null_counts: Record<string, number>;
    sample: Array<Record<string, unknown>>;
    createdAt: string;
    tableName: string;
  };
}
```

## `/api/datasets` (GET)

Query parameters:

| Param      | Description                      |
| ---------- | -------------------------------- |
| `projectId`| Optional UUID filter             |

**Response**

```ts
interface DatasetListResponse {
  datasets: Array<{
    datasetId: string;
    projectId?: string;
    filename: string;
    fileType: string;
    size: number;
    nRows: number;
    nCols: number;
    columns: Array<{ name: string; dtype: string; nullCount: number }>;
    sample: Array<Record<string, unknown>>;
    createdAt: string;
    updatedAt: string;
    tableName?: string;
    metadata?: {
      tableName?: string;
      rowsLoaded?: number;
    };
  }>;
}
```

---

## `/api/feature-engineering/apply` (POST)

**Request**

```ts
interface FeatureSpec {
  id?: string;
  projectId?: string;
  sourceColumn: string;
  secondaryColumn?: string;
  featureName: string;
  method: string;
  params?: Record<string, unknown>;
  enabled?: boolean;
}

interface FeatureEngineeringApplyRequest {
  projectId: string;
  datasetId: string;
  outputName?: string;
  outputFormat?: 'csv' | 'json' | 'xlsx';
  pythonVersion?: '3.10' | '3.11';
  features: FeatureSpec[];
}
```

**Response**

```ts
type FeatureEngineeringApplyResponse = UploadDatasetResponse;
```

---

## `/api/execute` (POST)

**Request**

```ts
interface ExecuteRequest {
  projectId: string;
  code: string;
  sessionId?: string;
  pythonVersion?: '3.10' | '3.11';
  timeout?: number; // ms
}
```

**Response**

```ts
interface ExecuteResponse {
  success: boolean;
  result: {
    status: 'pending' | 'running' | 'success' | 'error' | 'timeout';
    stdout: string;
    stderr: string;
    outputs: Array<{
      type: 'text' | 'table' | 'image' | 'html' | 'error' | 'chart';
      content: string;
      data?: unknown;
      mimeType?: string;
    }>;
    executionMs: number;
    error?: string;
  };
}
```

---

## `/api/llm/feature-plan/stream` (POST, NDJSON stream)

**Request**

```ts
interface LlmPlanRequest {
  projectId: string;
  datasetId: string;
  targetColumn?: string;
  prompt?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  featureSummary?: string;
}
```

**Response (application/x-ndjson)**

```ts
type LlmStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'envelope'; envelope: LlmEnvelope }
  | { type: 'error'; message: string }
  | { type: 'done' };
```

Notes:
- The assistant streams text via `token` events.
- UI payloads are delivered via an internal `render_ui` tool call and surface as `envelope.ui`.
- Tool calls are surfaced via `envelope.tool_calls` for explicit user approval and execution.

---

## `/api/llm/training/stream` (POST, NDJSON stream)

Same request/response as `/api/llm/feature-plan/stream`, but the envelope `kind` is `training`.

---

## `/api/llm/tools/execute` (POST)

**Request**

```ts
type ToolCall = {
  id: string;
  tool: 'list_project_files' | 'get_dataset_profile' | 'get_dataset_sample' | 'search_documents' | 'run_python';
  args?: Record<string, unknown>;
  rationale?: string;
};

interface ToolExecuteRequest {
  projectId: string;
  toolCalls: ToolCall[];
}
```

**Response**

```ts
type ToolResult = {
  id: string;
  tool: ToolCall['tool'];
  output?: unknown;
  error?: string;
};

interface ToolExecuteResponse {
  results: ToolResult[];
}
```

## `/api/llm/tools` (GET)

**Response**

```ts
interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface LlmToolsResponse {
  tools: LlmToolDefinition[];
}
```

## `/api/llm/preprocessing/runs` (GET)

Authoritative preprocessing run summaries for UI rehydration.

**Query**

```ts
interface PreprocessingRunsQuery {
  projectId: string;
  limit?: number; // 1..100
}
```

**Response**

```ts
interface PreprocessingRunSummary {
  runId: string;
  projectId: string;
  activeDatasetId?: string;
  stepCount: number;
  eventCount: number;
  latestEventType?: string;
  latestEventAt?: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

interface PreprocessingRunListResponse {
  projectId: string;
  count: number;
  runs: PreprocessingRunSummary[];
}
```

## `/api/llm/preprocessing/runs/:runId` (GET)

Authoritative preprocessing run snapshot for deterministic timeline restoration.

**Params**

```ts
interface PreprocessingRunParams {
  runId: string;
}
```

**Response**

```ts
interface PreprocessingRunSnapshot {
  runId: string;
  projectId: string;
  stateModel: 'hybrid';
  activeDatasetId?: string;
  derivedDatasetIds: string[];
  langGraphRuntime?: 'langgraph';
  langGraphState?: Record<string, unknown>;
  steps: Array<{
    stepId: string;
    title: string;
    rationale?: string;
    intentType: string;
    status: 'pending' | 'running' | 'awaiting_approval' | 'applied' | 'failed' | 'diverged';
    approvalDecision?: 'pending' | 'approved' | 'rejected';
    decisionReason?: string;
    toolCallId?: string;
    linkedFromStepId?: string;
    code?: string;
    codeHash?: string;
    version: number;
    cellIds: string[];
    requiresApproval: boolean;
    validation?: Record<string, unknown>;
    lastExecuteSucceeded: boolean;
    lastValidateSucceeded: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  checkpoints: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
}

interface PreprocessingRunSnapshotResponse {
  run: PreprocessingRunSnapshot;
}
```

Related endpoints:

- `POST /api/execute/session`
- `GET /api/execute/session/:id`
- `DELETE /api/execute/session/:id`
- `POST /api/execute/packages`
- `GET /api/execute/packages/:sessionId`
- `GET /api/execute/runtimes`
- `GET /api/execute/health`

---

## `/api/mcp` (POST, MCP Streamable HTTP)

MCP endpoint exposing project-scoped tools via Streamable HTTP.

- Method: `POST /api/mcp`
- Transport: MCP Streamable HTTP (JSON-RPC over HTTP + SSE)
- Tools: `list_project_files`, `get_dataset_profile`, `get_dataset_sample`, `search_documents`, `run_python`
- Each tool requires a `projectId` in its input schema.

`GET` and `DELETE` return 405 with a JSON-RPC error payload.

---

## `/api/models/templates` (GET)

**Response**

```ts
interface ModelTemplate {
  id: string;
  name: string;
  taskType: 'classification' | 'regression' | 'clustering';
  description: string;
  library: string;
  parameters: Array<{
    key: string;
    label: string;
    type: 'number' | 'string' | 'boolean' | 'select';
    default: unknown;
    min?: number;
    max?: number;
    step?: number;
    options?: Array<{ value: string; label: string }>;
  }>;
  metrics: string[];
}

interface ModelTemplatesResponse {
  templates: ModelTemplate[];
}
```

## `/api/models/train` (POST)

**Request**

```ts
interface TrainModelRequest {
  projectId: string;
  datasetId: string;
  templateId: string;
  targetColumn?: string; // required for classification/regression
  parameters?: Record<string, unknown>;
  testSize?: number; // 0.05 - 0.5
  name?: string;
}
```

**Response**

```ts
interface ModelRecord {
  modelId: string;
  projectId: string;
  datasetId: string;
  name: string;
  templateId: string;
  taskType: 'classification' | 'regression' | 'clustering';
  library: string;
  algorithm: string;
  parameters: Record<string, unknown>;
  metrics: Record<string, number>;
  status: 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  trainingMs?: number;
  targetColumn?: string;
  featureColumns?: string[];
  sampleCount?: number;
  artifact?: { filename: string; path: string; size: number };
  error?: string;
}

interface TrainModelResponse {
  success: boolean;
  message: string;
  model: ModelRecord;
}
```

## `/api/models` (GET)

Query parameters:

| Param      | Description          |
| ---------- | -------------------- |
| `projectId`| Optional UUID filter |

**Response**

```ts
interface ModelsListResponse {
  models: ModelRecord[];
}
```

## `/api/models/:id` (GET)

**Response**

```ts
interface ModelResponse {
  model: ModelRecord;
}
```

## `/api/models/:id/artifact` (GET)

Downloads the stored model artifact.

---

## `/api/auth/*`

Auth endpoints (JWT access + refresh tokens):

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `PATCH /api/auth/profile`

## `/api/upload/doc` (POST, multipart/form-data)

Form fields:

| Field      | Type                | Notes                                    |
| ---------- | ------------------- | ---------------------------------------- |
| `file`     | File                | Required. Accepts `pdf`, `md`, `txt`.    |
| `projectId`| String (UUID)       | Optional; associates docs with projects. |

**Response**

```ts
interface UploadDocResponse {
  document: {
    documentId: string;
    projectId?: string;
    filename: string;
    mimeType: string;
    chunkCount: number;
    embeddingDimension: number;
  };
}
```

## `/api/docs/search` (GET)

Query parameters:

| Param      | Description                                    |
| ---------- | ---------------------------------------------- |
| `q`        | Required search query                          |
| `projectId`| Optional UUID filter                           |
| `k`        | Optional top-k (default 5, max 20)             |

**Response**

```ts
interface DocsSearchResponse {
  results: Array<{
    chunkId: string;
    documentId: string;
    filename: string;
    score: number;        // cosine + reranker blend
    snippet: string;
    span: { start: number; end: number };
  }>;
}
```

## `/api/answer` (POST)

**Request**

```ts
interface AnswerRequest {
  projectId?: string;
  question: string;
  topK?: number; // default 5, max 10
}
```

**Response**

```ts
interface AnswerResponse {
  answer: {
    status: 'ok' | 'not_found';
    answer: string;
    citations: Array<{
      chunkId: string;
      documentId: string;
      filename: string;
      span: { start: number; end: number };
    }>;
    meta: {
      cached: boolean;
      latencyMs: number;
      chunksConsidered: number;
      cacheTimestamp?: string;
    };
  };
}
```

When the document store cannot produce supporting evidence the endpoint returns `status: "not_found"` with an explanatory message.

---

## `/api/preprocessing/analyze` (POST)
## `/api/preprocessing/refine` (POST)
## `/api/preprocessing/execute` (POST)

Deprecated legacy endpoints. These now return `410 Gone`.

```ts
interface LegacyPreprocessingDeprecatedResponse {
  error: string;
  code: 'PREPROCESSING_LEGACY_ENDPOINT_DEPRECATED';
  migrationPath: '/api/llm/preprocessing/stream';
  message: string;
}
```

## `/api/preprocessing/tables` (GET)

**Response**

```ts
interface PreprocessingTablesResponse {
  tables: Array<{
    name: string;
    sizeBytes: number;
  }>;
}
```

---

👩‍💻 **Integration tips**

- Use `QUERY_CACHE_TTL_MS`, `ANSWER_CACHE_TTL_MS`, and `sqlDefaultLimit` values (available via `/api/query/cache/config`) to drive UI messaging such as “served from cache” badges.
- `/api/upload/doc` may take longer for large PDFs; show progress spinners and handle `413` responses for files larger than 25 MB.
- For staged rollouts, guard new UI panels behind feature flags, but keep payload shapes aligned with the contracts above.
