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
EXECUTION_NETWORK=bridge
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
SMTP_FROM=AutoML Toolchain <noreply@example.com>
```

## Database & Migrations

When `DATABASE_URL` is set, run:

```bash
npm run db:migrate
```

This creates tables for datasets, documents, chunks, embeddings, query cache, and auth scaffolding. The backend will log a connection check on startup.

If you are running from the repo root, `npm run dev` will spin up a local Postgres container and run migrations automatically.

## Benchmarking

Run the API benchmark script against a running server:

```bash
npm run benchmark:api
```

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
- `POST /api/preprocessing/analyze`
- `GET /api/preprocessing/tables`

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

## Notes

- Dataset profiling uses the first 5,000 rows for column stats and sampling; row counts reflect the full parsed file.
- Embeddings are lightweight hash-based vectors (no pgvector yet).
- NL→SQL is deterministic and only intended as a placeholder.
