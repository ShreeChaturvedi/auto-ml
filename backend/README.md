# AI-Augmented AutoML Toolchain – Backend

Express + TypeScript API for the AutoML platform. Provides project CRUD, dataset ingestion, feature engineering apply, Python execution runtime (Docker), query execution with EDA, document ingestion/search, and preprocessing analysis.

## Prerequisites

- Node.js 22 LTS
- npm 10+
- Postgres 16+ (required for auth, query/doc/answer, preprocessing endpoints)

## Getting Started

```bash
npm install
npm run dev     # watch mode
npm run build   # compile to build/
npm run start   # run compiled output
```

The server listens on `PORT` (default `4000`) and serves all routes under `/api`.

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed:

```
PORT=4000
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:4173
STORAGE_PATH=storage/projects.json
DATASET_METADATA_PATH=storage/datasets/metadata.json
DATASET_STORAGE_DIR=storage/datasets/files
DOCUMENT_STORAGE_DIR=storage/documents/files
MODEL_METADATA_PATH=storage/models/metadata.json
MODEL_STORAGE_DIR=storage/models/artifacts
DATABASE_URL=postgres://postgres:automl@localhost:5433/automl
PGSSLMODE=disable
PG_POOL_MIN=0
PG_POOL_MAX=10
SQL_STATEMENT_TIMEOUT_MS=5000
SQL_MAX_ROWS=1000
SQL_DEFAULT_LIMIT=200
QUERY_CACHE_TTL_MS=300000
QUERY_CACHE_MAX_ENTRIES=500
DOC_CHUNK_SIZE=500
DOC_CHUNK_OVERLAP=50
ANSWER_CACHE_TTL_MS=120000
DOCKER_ENABLED=true
DOCKER_IMAGE=automl-python-runtime
EXECUTION_NETWORK=none
EXECUTION_AUTO_BUILD_IMAGE=true
EXECUTION_TIMEOUT_MS=30000
EXECUTION_MAX_MEMORY_MB=2048
EXECUTION_MAX_CPU_PERCENT=100
EXECUTION_WORKSPACE_DIR=storage/runtime
JWT_SECRET=dev-secret-change-in-production
BCRYPT_ROUNDS=12
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:5173
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=Agentic AutoML Platform <noreply@example.com>
GOOGLE_AUTH_ENABLED=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:5173/auth/google/callback
LLM_PROVIDER=openai
```

`LLM_PROVIDER=mock` is supported only in non-production and only for preprocessing workflow testing. It leaves NL→SQL, experiments, and other non-preprocessing callsites on the normal OpenAI client.

## Database & Migrations

When `DATABASE_URL` is set, run:

```bash
npm run db:migrate
```

This creates tables for datasets, documents, chunks, embeddings, query cache, and auth scaffolding. The backend will log a connection check on startup.

If you are running from the repo root, `npm run dev` will spin up or reuse the managed local Postgres container and run migrations automatically. Containers created or started by that invocation are stopped on shutdown, while compatible containers that were already running are left running.

## Benchmarking

Run the API benchmark script against a running server:

```bash
npm run benchmark:api
```

For no-OpenAI preprocessing validation, run the backend with `LLM_PROVIDER=mock`, then use the repo helpers:

```bash
LLM_PROVIDER=mock npm run benchmark:preprocessing:mock
LLM_PROVIDER=mock BENCHMARK_AUTH_BYPASS=true npm run test:preprocessing:burnin
```

`BENCHMARK_AUTH_BYPASS=true` is non-production-only and exists solely for benchmark and burn-in harnesses that drive authenticated backend requests with `x-benchmark-user-*` headers. The backend ignores this flag when `NODE_ENV=production`; production must keep the bypass unset. Do not use legacy auth-bypass aliases.

Environment overrides:

```
AUTOML_BENCH_BASE_URL=http://localhost:4000
AUTOML_BENCH_CONNECTIONS=20
AUTOML_BENCH_DURATION=10
AUTOML_BENCH_PIPELINING=1
```

## API Surface (Current)

### Core
- `GET /api/health`
- `GET/POST/PATCH/DELETE /api/projects`

### Datasets
- `GET /api/datasets`
- `POST /api/upload/dataset`
- `GET /api/datasets/:datasetId/sample`
- `DELETE /api/datasets/:datasetId`

### Query & EDA (Postgres required)
- `POST /api/query/sql`
- `POST /api/query/nl` (template-based stub)
- `GET /api/query/cache/config`

### Documents & Answering (Postgres required)
- `POST /api/upload/doc`
- `GET /api/docs/search`
- `POST /api/answer`

### Preprocessing (Postgres required)
- `GET /api/preprocessing/tables`
- `POST /api/llm/preprocessing/stream` (authoritative orchestration path)

Legacy preprocessing endpoints remain mounted only as deprecated guards and return `410 Gone`:
- `POST /api/preprocessing/analyze`
- `POST /api/preprocessing/refine`
- `POST /api/preprocessing/execute`

### Feature Engineering
- `POST /api/feature-engineering/apply`

### Models
- `GET /api/models/templates`
- `GET /api/models`
- `GET /api/models/:id`
- `GET /api/models/:id/artifact`
- `POST /api/models/train`

### Execution (Docker required)
- `POST /api/execute`
- `POST /api/execute/session`
- `GET /api/execute/session/:id`
- `DELETE /api/execute/session/:id`
- `POST /api/execute/packages`
- `GET /api/execute/packages/:sessionId`
- `GET /api/execute/runtimes`
- `GET /api/execute/health`

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `PATCH /api/auth/profile`

## Beta Deploy Notes

- Set `FRONTEND_URL` and `ALLOWED_ORIGINS` to the public Vercel origin, not localhost.
- Configure real SMTP credentials (`SMTP_*`) before launching signup or password-reset flows.
- Leave `GOOGLE_AUTH_ENABLED=false` for the zero-paid beta so the frontend can surface the "coming soon" CTA while backend Google routes stay disabled.
- Deployment responses now derive public endpoint URLs from the incoming request origin, so production traffic should reach the backend through your DuckDNS+Caddy hostname.

## Notes

- Dataset profiling uses the first 5,000 rows for column stats and sampling; row counts reflect the full parsed file.
- Embeddings use `pgvector` for semantic search in Postgres-backed environments.
- NL→SQL is deterministic and only intended as a placeholder.
