# Developer Operations

For a first-day takeover path, see [New Team Handoff](New-Team-Handoff).

## Prerequisites

- Node.js 22 LTS
- npm 10+
- Docker
- PostgreSQL 16+ if not using the managed local container
- `ffmpeg` on `PATH` when rendering Remotion video artifacts

## Install

From the repository root:

```bash
npm run install:all
```

This installs root, backend, frontend, testing, landing, video, poster, and booklet workspace dependencies.

## Local Development

```bash
npm run dev
```

The root dev runner:

- creates or updates `backend/.env` from `backend/.env.example` when needed;
- defaults an empty local `DATABASE_URL` to `postgres://postgres:postgres@localhost:5433/automl`;
- starts or reuses a compatible `pgvector/pgvector:pg16` local Postgres container named `automl-postgres-5433`;
- creates the internal Docker network `automl-sandbox`;
- runs pending backend migrations;
- starts the backend on port `4000`;
- starts the frontend on port `5173`;
- stops only the managed container it created or started for that invocation.

There are no Docker Compose files in the repository; local orchestration uses Docker CLI through `scripts/dev/`.

Useful direct development commands:

```bash
npm run dev
npm run dev:ui
npm run dev:backend
npm run dev:landing
npm run video:dev
npm run poster:dev
npm run booklet:dev
```

## Core Commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Build backend TypeScript and frontend Vite app. |
| `npm run test` | Run backend and frontend Vitest suites. |
| `npm run lint` | Lint backend, frontend, and video workspaces. |
| `npm run db:migrate` | Run pending backend migrations. |
| `npm run benchmark` | Run Playwright E2E benchmark suite. |
| `npm run benchmark:headed` | Run benchmark suite headed. |
| `npm run eval` | Run NL-to-SQL/RAG evaluation suite. |
| `npm run benchmark:api` | Run API load benchmark against a running backend. |
| `npm run audit` | Audit dependencies across configured workspaces. |
| `npm run build:landing` | Build Astro landing site. |
| `npm run video:build` | Build Remotion video artifacts. |
| `npm run video:build:draft` | Render draft video output. |
| `npm run poster:build` | Typecheck and build poster. |
| `npm run poster:pdf` | Export poster PDF. |
| `npm run booklet:build` | Typecheck and build booklet. |
| `npm run booklet:pdf` | Validate booklet parity and export PDF. |
| `npm run test:landing` | Run landing workspace tests. |

## Backend Environment

Copy `backend/.env.example` to `backend/.env` for local overrides. Key settings:

| Variable | Purpose |
| --- | --- |
| `PORT` | Backend port, default `4000`. |
| `ALLOWED_ORIGINS` | CORS origins for frontend/dev URLs. |
| `DATABASE_URL` | Postgres connection string. |
| `PGSSLMODE`, `PG_POOL_MIN`, `PG_POOL_MAX` | Postgres connection behavior. |
| `STORAGE_PATH`, `DATASET_*`, `DOCUMENT_STORAGE_DIR`, `MODEL_*` | File-backed artifact locations. |
| `SQL_STATEMENT_TIMEOUT_MS`, `SQL_MAX_ROWS`, `SQL_DEFAULT_LIMIT` | Query safety limits. |
| `QUERY_CACHE_*`, `ANSWER_CACHE_TTL_MS` | Cache behavior. |
| `DOCKER_ENABLED`, `DOCKER_IMAGE`, `EXECUTION_*` | Python runtime image, network, timeouts, CPU/memory/tmpfs, workspace. |
| `JWT_SECRET`, `JWT_*`, `BCRYPT_ROUNDS` | Auth configuration. |
| `SMTP_*`, `FRONTEND_URL` | Email verification and password reset links. |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_*_MODEL`, `LLM_*` | LLM provider, model, and timeout settings. |

## Frontend Environment

Copy `frontend/.env.example` to `frontend/.env.local` if needed:

```bash
VITE_API_BASE=http://localhost:4000/api
VITE_LANDING_URL=http://localhost:4321
```

## Database and Migrations

Run migrations manually when needed:

```bash
npm run db:migrate
```

The migration set currently covers auth, project ownership, notebooks, workflows, savepoints, experiments, NL suggestions, models, embeddings, plan chats, deployments, model feature types, email verification, and notebook kinds.

## Testing and Benchmark Commands

```bash
npm run test
npm run test:backend
npm run test:frontend
npm run test:landing
npm --prefix backend run test:coverage
npm --prefix frontend run test:coverage
npm run benchmark
npm run benchmark:headed
npm --prefix testing run benchmark:validate
npm --prefix testing run benchmark:test
npm run eval
EVAL_API_BASE=http://localhost:4000/api npm run eval
npm run benchmark:api
```

Optional API benchmark overrides:

```bash
AUTOML_BENCH_BASE_URL=http://localhost:4000 \
AUTOML_BENCH_CONNECTIONS=20 \
AUTOML_BENCH_DURATION=10 \
AUTOML_BENCH_PIPELINING=1 \
npm run benchmark:api
```

## Development Notes

- Keep secrets in local `.env` files or CI variables.
- Use the root `npm run lint` rather than individual lint commands.
- Prefer the managed `npm run dev` path for day-to-day work because it keeps migrations and local database state aligned.
