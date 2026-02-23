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
    queryId: string;
    cached: boolean;
    query: SqlQueryResponse['query'];
  };
}
```

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

**Request**

```ts
interface PreprocessingAnalyzeRequest {
  projectId: string;
  tableName: string;
  sampleSize?: number; // default 1000, min 100, max 10000
}
```

**Response**

```ts
interface PreprocessingAnalyzeResponse {
  analysis: {
    rowCount: number;
    columnCount: number;
    duplicateRowCount: number;
    columnProfiles: Array<{
      name: string;
      inferredType: 'numeric' | 'categorical' | 'datetime' | 'boolean' | 'text';
      totalCount: number;
      missingCount: number;
      missingPercentage: number;
      uniqueCount: number;
      uniquePercentage: number;
      min?: number;
      max?: number;
      mean?: number;
      median?: number;
      stdDev?: number;
      skewness?: number;
      kurtosis?: number;
      q1?: number;
      q3?: number;
      outlierCount?: number;
      outlierPercentage?: number;
      topValues?: Array<{ value: string; count: number }>;
      entropy?: number;
    }>;
    suggestions: Array<{
      id: string;
      type: string;
      column: string;
      severity: string;
      title: string;
      description: string;
      method: string;
      methodOptions: string[];
      parameters: Record<string, unknown>;
      uiConfig: {
        renderAs: string;
        options?: Array<{ value: string; label: string }>;
        min?: number;
        max?: number;
        step?: number;
        default: unknown;
      };
      impact: string;
      rationale: string;
      enabled: boolean;
    }>;
  };
  metadata: {
    tableName: string;
    totalRows: number;
    sampledRows: number;
    samplePercentage: number;
  };
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
