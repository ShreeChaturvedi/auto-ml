# Backend and API

The backend is an Express 5 application in `backend/src`. `createApp()` mounts all routes under `/api`, applies CORS, request context/timing, auth/project-access middleware when a database is configured, and wires domain routers to repositories and services.

## Major Route Groups

| Route group | Purpose |
| --- | --- |
| `/api/health` | Service and dependency health. |
| `/api/auth/*` | Register, login, refresh, logout, email verification, password reset, profile, sessions, Google OAuth. |
| `/api/projects` | Project CRUD, reset, active phase metadata, color/icon fields. |
| `/api/upload/dataset`, `/api/datasets/*` | Dataset upload, list, sample, rows, column type updates, rename, download, delete. |
| `/api/upload/doc`, `/api/documents`, `/api/docs/search` | Document upload, list, download, delete, search. |
| `/api/query/sql`, `/api/query/nl`, `/api/query/nl/stream` | SQL execution, natural-language query generation, streamed NL-to-SQL workflow, query cache config. |
| `/api/preprocessing/*` | Available tables, step decisions, compatibility checks, preprocessing run history and snapshots. |
| `/api/feature-engineering/*` | Apply features and inspect feature pipeline runs. |
| `/api/workflows/*` | Streaming workflow turns, interrupt, list runs, get run snapshot. |
| `/api/llm/tools`, `/api/llm/models` | LLM tool catalog and model catalog. |
| `/api/mcp` | MCP-compatible tool interaction endpoint. |
| `/api/models/*` | Model templates, model list/detail/artifact, seed models, training. |
| `/api/experiments/*` | Evaluation, SHAP, error analysis, tuning, model comparison, NL filters, insights. |
| `/api/execute/*` | Docker/Python code execution, sessions, package install/search, runtime health. |
| `/api/projects/:projectId/notebooks`, `/api/notebooks/*`, `/api/cells/*` | Notebook CRUD, cell CRUD, execution, locks, outputs, savepoints, recovery, kernel restart. |
| `/api/python/*` | Python completions, hover, signatures, diagnostics for editor integrations. |
| `/api/deployments/*` | Deployment CRUD, lifecycle, schema, logs, stats, drift, API keys, feedback, container logs. |
| `/api/deployments/:deploymentId/predict` | Prediction proxy with deployment auth, rate limiting, logging, and stats capture. |
| `/api/settings` | Runtime settings fetch/update. |
| `/api/plan-chats/*` | Planning chat records and completion state. |
| `/api/realtime/session` | Realtime session bootstrap. |

`docs/api-contracts.md` contains useful request/response examples for query, upload, and feature-engineering contracts, but the active source mounts in `backend/src/app.ts` and `backend/src/routes` should be treated as authoritative.

## Services

Important service areas:

- `services/dataLoading`: file parsing, sanitization, schema inference, and table insertion.
- `services/eda`: numeric/categorical analysis, visualizations, missing matrix, sampling, summary stats.
- `services/nlToSql`: schema context, prompt building, generation, validation, repair, confidence, progress events.
- `services/llm`: LLM client, prompts, model catalog, preprocessing graph, tool registry.
- `services/featureEngineering`: feature code generation and script building.
- `services/kernel`, `services/container`, `services/execution*`: Docker and Jupyter-style execution.
- `services/notebook`: notebook cell execution and output handling.
- `services/model*`, `services/evaluation*`, `services/experiment*`, `services/tuning*`: model and experiment lifecycle.
- `services/deployment*`: model serving container management, prediction proxy support, drift detection.
- `services/document*`, `services/embedding*`: document parsing, ingestion, embeddings, and search.

## Repositories and Storage

The repository layer separates persistence concerns:

- `projectRepository`: file-backed and Postgres-backed project stores.
- `datasetRepository`: dataset metadata and uploaded file references.
- `notebookRepository` and `repositories/notebook/*`: notebooks, cells, outputs, locks, and savepoints.
- `modelRepository`, `deploymentRepository`, `preprocessingRunRepository`, `featurePipelineRunRepository`, `planChatRepository`, `settingsRepository`, and `userRepository`.

Migrations in `backend/migrations` define tables for auth, ownership, notebooks, workflows, savepoints, experiments, suggestions, models, embeddings, plan chats, deployments, and notebook kinds.

## Auth and Ownership

When `DATABASE_URL` is configured, auth routes are enabled and the API applies:

- JWT auth middleware;
- project access checks;
- route-level project ownership checks where needed;
- deployment ownership checks;
- deployment API key auth for prediction;
- deployment prediction rate limiting.

Without database configuration, protected database-backed areas return service-unavailable responses instead of silently degrading.

## LLM, Workflows, and MCP

LLM workflows use streaming responses for long-running operations. The main workflow endpoint, `POST /api/workflows/turns/stream`, accepts a project, phase, prompt/context, optional run/thread IDs, dataset/notebook IDs, model, and reasoning effort. Supported phases include onboarding, preprocessing, feature engineering, and training.

The workflow graph prepares context, invokes the model, executes tools, pauses for approval when needed, completes successful turns, or records failures. MCP routes expose tool-call style access for workflow tooling and integration.

## Execution and Notebooks

The execution API creates Docker-backed Python sessions, runs code, installs packages, reports installed packages, exposes runtime health, and supports notebook cell execution. Notebook routes persist cells and outputs, while WebSocket services push realtime changes to connected clients.
