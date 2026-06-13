# API Reference

The backend API is served by Express under `/api`. The active source of truth is `backend/src/app.ts` plus the routers in `backend/src/routes`.

## Request Conventions

- JSON routes expect `Content-Type: application/json`.
- Upload routes use `multipart/form-data`.
- Authenticated routes require `Authorization: Bearer <accessToken>` once database-backed auth is enabled.
- Project-scoped routes enforce project ownership through middleware.
- Error responses use JSON, usually with an `error` message and route-specific details.
- Long-running LLM and NL-to-SQL operations stream events rather than waiting for one final response.

Common status codes:

| Status | Meaning |
| --- | --- |
| `400` | Invalid request, validation failure, unsafe SQL, or malformed payload. |
| `401` | Missing/invalid/expired auth token or deployment API key. |
| `403` | Authenticated user does not own or cannot access the resource. |
| `404` | Resource not found, sometimes used intentionally to avoid leaking ownership details. |
| `409` | Conflict such as incompatible state, lock, or duplicate operation. |
| `413` | Upload exceeds configured size limit. |
| `429` | Rate limit exceeded, especially deployment prediction traffic. |
| `503` | Required service unavailable, commonly database/runtime configuration. |

## Health

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Reports API, database, Docker/runtime, and memory health. |

## Authentication

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create a user. |
| POST | `/api/auth/login` | Create access/refresh tokens. |
| POST | `/api/auth/refresh` | Refresh an access token. |
| POST | `/api/auth/logout` | Revoke a refresh token. |
| GET | `/api/auth/me` | Return the current user. |
| POST | `/api/auth/forgot-password` | Start password reset flow. |
| POST | `/api/auth/reset-password` | Complete password reset flow. |
| PATCH | `/api/auth/profile` | Update profile fields. |
| GET/POST | `/api/auth/google*` | Google OAuth start/callback flow. |

## Projects

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/projects` | List accessible projects. |
| POST | `/api/projects` | Create a project. |
| GET | `/api/projects/:id` | Read one project. |
| PATCH | `/api/projects/:id` | Update project metadata/current phase. |
| DELETE | `/api/projects/:id` | Delete a project. |
| DELETE | `/api/projects/reset` | Reset project state for development/test flows. |

## Datasets and Documents

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/upload/dataset` | Upload CSV, JSON, or XLSX dataset. |
| GET | `/api/datasets` | List datasets, optionally by project. |
| GET | `/api/datasets/:datasetId/sample` | Fetch a dataset sample. |
| GET | `/api/datasets/:datasetId/rows` | Fetch paged rows. |
| PATCH/PUT | `/api/datasets/:datasetId/*` | Rename/update column metadata where supported. |
| DELETE | `/api/datasets/:datasetId` | Delete dataset metadata/files. |
| POST | `/api/upload/doc` | Upload a context document. |
| GET | `/api/documents` | List project documents. |
| GET | `/api/documents/:documentId/download` | Download a document. |
| DELETE | `/api/documents/:documentId` | Delete a document. |
| GET | `/api/docs/search` | Search indexed document chunks. |

Example dataset upload fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `file` | file | yes | CSV, JSON, XLSX. |
| `projectId` | string | no | Associates upload with a project. |

Important limits:

- dataset uploads default to `300MB`;
- document uploads are memory-backed and capped at `25MB`;
- dataset row paging defaults to `200` rows and caps at `1000`;
- CSV, JSON, and XLSX are the supported dataset formats; legacy `.xls` is rejected.

## Query and NL-to-SQL

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/query/sql` | Execute read-only SQL. |
| POST | `/api/query/nl` | Generate/execute SQL from natural language. |
| POST | `/api/query/nl/stream` | Stream schema, planning, SQL generation, validation, execution, repair, and result events. |
| GET | `/api/query/cache/config` | Inspect query cache settings. |

SQL request:

```json
{
  "projectId": "project-uuid",
  "sql": "select * from table_name limit 20"
}
```

Query limits:

- read-only SELECT/CTE SQL only;
- multiple statements and blocked application/system tables are rejected;
- default SQL limit is `200`;
- maximum returned rows default to `1000`;
- statement timeout defaults to `5000ms`.

NL request:

```json
{
  "projectId": "project-uuid",
  "query": "Which rows have the highest churn risk?",
  "tableName": "optional_default_table"
}
```

## LLM Workflows and MCP

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/workflows/turns/stream` | Stream onboarding, preprocessing, feature-engineering, or training workflow turns. |
| POST | `/api/workflows/:runId/interrupt` | Interrupt a running workflow. |
| GET | `/api/workflows` | List workflow runs. |
| GET | `/api/workflows/:runId` | Read a workflow run snapshot. |
| GET | `/api/llm/tools` | List registered LLM tools. |
| GET | `/api/llm/models` | List configured model catalog. |
| POST | `/api/mcp` | MCP Streamable HTTP endpoint. |

Workflow turn request shape is phase-dependent but commonly includes `projectId`, `phase`, prompt/context, optional `runId`, `threadId`, `datasetId`, `notebookId`, model, and reasoning effort.

Workflow constraints:

- one active workflow per project/phase;
- a run older than 10 minutes is treated as stale;
- workflow turns cap at 48 iterations;
- tool-call guards limit repeated tool usage.

## Preprocessing and Feature Engineering

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/preprocessing/tables` | List available project tables. |
| POST | `/api/preprocessing/step-decision` | Record/apply preprocessing step decisions. |
| POST | `/api/preprocessing/check-compatibility` | Check dataset/workbook compatibility. |
| GET | `/api/preprocessing/runs` | List preprocessing runs. |
| GET | `/api/preprocessing/runs/:runId` | Read preprocessing run snapshot. |
| POST | `/api/feature-engineering/apply` | Apply enabled feature specs to create a derived dataset. |
| GET | `/api/feature-engineering/runs` | List feature pipeline runs. |
| GET | `/api/feature-engineering/runs/:runId` | Read a feature run. |

Feature apply requests include `projectId`, `datasetId`, optional output settings, Python version, and enabled feature specs.

## Execution and Notebooks

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/execute` | Execute Python code. |
| POST | `/api/execute/session` | Create an execution session. |
| GET | `/api/execute/session/:id` | Inspect a session. |
| DELETE | `/api/execute/session/:id` | Destroy a session. |
| POST | `/api/execute/packages` | Install a Python package. |
| GET | `/api/execute/packages/:sessionId` | List installed packages. |
| GET | `/api/execute/runtimes` | List runtime options. |
| GET | `/api/execute/health` | Check execution runtime health. |
| GET/POST | `/api/projects/:projectId/notebooks` | List/create notebooks. |
| GET/POST | `/api/notebooks/:notebookId/cells` | List/create cells. |
| PATCH/DELETE | `/api/cells/:cellId` | Update/delete a cell. |
| POST | `/api/cells/:cellId/run` | Run a notebook cell. |
| POST | `/api/cells/:cellId/interrupt` | Interrupt a running cell. |
| POST/GET | `/api/notebooks/:notebookId/savepoints` | Create/list savepoints. |
| POST | `/api/notebooks/:notebookId/savepoints/:savepointId/restore` | Restore a savepoint. |
| POST | `/api/python/completions` | Python editor completions. |
| POST | `/api/python/hover` | Python hover documentation. |
| POST | `/api/python/signatures` | Python signature help. |
| POST | `/api/python/diagnostics` | Python diagnostics. |

## Models, Experiments, and Deployments

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/models/templates` | List model templates. |
| GET | `/api/models` | List project models. |
| POST | `/api/models/train` | Train/register a model. |
| GET | `/api/models/:id` | Read model detail. |
| GET | `/api/models/:id/artifact` | Download model artifact. |
| DELETE | `/api/models/:id` | Delete model. |
| GET | `/api/experiments/:modelId/evaluation` | Fetch model evaluation. |
| POST | `/api/experiments/:modelId/evaluation/retry` | Retry evaluation. |
| GET | `/api/experiments/:modelId/shap` | Fetch SHAP/importance data. |
| GET | `/api/experiments/:modelId/error-analysis` | Fetch error analysis. |
| POST | `/api/experiments/:projectId/tune` | Start tuning. |
| POST | `/api/experiments/:projectId/compare` | Compare models. |
| POST | `/api/experiments/:projectId/nl-filter` | Parse natural-language experiment filters. |
| POST | `/api/deployments` | Create deployment. |
| GET | `/api/deployments` | List deployments. |
| GET/PATCH/DELETE | `/api/deployments/:id` | Detail/update/delete deployment. |
| GET | `/api/deployments/:id/schema` | Read input schema. |
| POST | `/api/deployments/:id/api-keys` | Create API key. |
| GET | `/api/deployments/:id/api-keys` | List API keys. |
| DELETE | `/api/deployments/:id/api-keys/:keyId` | Revoke API key. |
| GET | `/api/deployments/:id/logs` | Read prediction logs. |
| GET | `/api/deployments/:id/stats` | Read hourly stats. |
| POST | `/api/deployments/:id/drift` | Run drift check. |
| POST | `/api/deployments/:deploymentId/predict` | Proxy prediction request to serving container. |

Experiment/deployment limits:

- model comparison accepts 2 to 5 models;
- tuning supports 1 to 200 trials;
- active deployments are capped at 5 per project;
- prediction proxy rate limit is 60 requests per minute per deployment.

## Frontend API Clients

Frontend wrappers live in `frontend/src/lib/api`. Add or update these clients when changing backend routes so components and stores do not call `fetch` ad hoc.
