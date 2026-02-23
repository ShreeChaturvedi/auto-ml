# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-Augmented AutoML Toolchain: A TypeScript monorepo implementing an automated data science platform with React frontend, Express backend, and Postgres-backed query/RAG services. Built by the CSE 448 capstone team at Miami University.

### Architecture

**Monorepo structure** with three workspaces:
- `frontend/` – Vite + React SPA (TypeScript, Tailwind, shadcn/ui, Zustand)
- `backend/` – Express + TypeScript API with Postgres integration
- `testing/` – Playwright E2E benchmarks and eval runner

**Data flow**: React SPA → Express REST API → Postgres + file-based storage

See `ARCHITECTURE.md` for detailed system design, `README.md` for getting started, `PROGRESS.md` for feature status, and `DECISIONS.md` for architectural decisions.

## Common Development Commands

### Running the Application

```bash
# Full stack (frontend + backend together)
npm --prefix frontend run dev

# Frontend only (port 5173)
npm --prefix frontend run dev:ui

# Backend only (port 4000, requires Postgres)
npm --prefix backend run dev
```

**Note**: The user's global instructions specify "don't run npm run dev" to avoid spawning dev servers. Use build/test commands when performing functionality checks without needing live servers.

### Building

```bash
# Backend compile (outputs to build/)
npm --prefix backend run build

# Frontend build (type-check + production bundle)
npm --prefix frontend run build
```

### Testing & Quality

```bash
# Linting
npm --prefix backend run lint
npm --prefix frontend run lint

# E2E benchmark (builds both workspaces, runs Playwright)
npm run benchmark                # headless
npm run benchmark:headed         # with browser UI

# Evaluation suite (NL→SQL + RAG metrics, requires backend running)
EVAL_API_BASE=http://localhost:4000/api npm --prefix testing run eval
```

### Database

```bash
# Apply migrations (safe to run multiple times)
npm --prefix backend run db:migrate

# Local Postgres via Docker (example)
docker run --rm -d --name automl-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=automl \
  -p 5433:5432 postgres:16
```

Then set `DATABASE_URL=postgres://postgres:postgres@localhost:5433/automl` in `backend/.env`.

## Code Architecture

### Backend (Express + TypeScript)

**Entry**: `backend/src/index.ts` → `app.ts` (CORS, routes, middleware)

**Routes** (`/api` prefix):
- `health.ts` – Liveness probe
- `projects.ts` – CRUD for AutoML projects
- `datasets.ts` – Upload/list datasets with profiling
- `documents.ts` – PDF/Markdown ingestion (`/upload/doc`) and search (`/docs/search`)
- `query.ts` – SQL execution (`/query/sql`) and NL→SQL (`/query/nl`) with caching
- `answer.ts` – RAG-based answering with citations

**Services**:
- `datasetProfiler.ts` – CSV/JSON/XLSX parsing, schema inference, sampling
- `sqlExecutor.ts`, `queryCache.ts`, `nlToSql.ts` – Query execution with read-only enforcement and Postgres caching
- `documentParser.ts`, `textChunker.ts`, `embeddingService.ts` – Document parsing, chunking with overlap, lightweight embeddings
- `documentIngestion.ts`, `documentSearchService.ts` – Persist docs/chunks/embeddings to Postgres, cosine + keyword search
- `answerService.ts` – Retrieves chunks, composes answers with citations, caches responses

**Repositories**:
- `projectRepository.ts` – File-backed project store (`storage/projects.json`)
- `datasetRepository.ts` – File-backed dataset metadata (`storage/datasets/metadata.json`)

**Config**: `backend/src/config.ts` centralizes env vars (port, CORS, storage paths, DB URL, caching limits)

### Frontend (React + TypeScript)

**Entry**: `frontend/src/main.tsx` → `App.tsx` (routing, phase-aware workspaces)

**Layout**: `components/layout/AppShell.tsx` – Persistent shell with sidebar, breadcrumbs, theme toggle, phase navigation

**State** (Zustand):
- `stores/projectStore.ts` – Project metadata, workflow phases, backend sync
- `stores/dataStore.ts` – Uploaded files, dataset previews, query artifacts, tabs

**API Integration**: `lib/api/` – Typed fetch wrappers with error handling

**UI Components**:
- `components/ui/` – shadcn/ui + Radix primitives
- `components/projects/` – Project CRUD dialogs
- `components/data/` – TanStack Table, dataset viewer
- `components/upload/` – Drag-drop file upload (react-dropzone)

### Testing

**E2E**: `testing/tests/benchmark.spec.ts` – Canonical project creation + dataset upload flow

**Eval**: `testing/tests/evalRunner.ts` – NL→SQL + RAG evaluation against fixtures (`testing/fixtures/*.json`)

## Data Persistence

**File-based** (backend/storage/):
- `projects.json` – Project definitions
- `datasets/metadata.json` – Dataset profiles
- `datasets/files/<datasetId>/<filename>` – Raw dataset binaries
- `documents/files/<documentId>/` – Uploaded context documents

**Postgres** (Sprint 3+):
- `projects`, `datasets`, `documents`, `chunks`, `embeddings` – Relational mirrors + RAG metadata
- `query_results`, `query_cache` – SQL audit log and caching
- Migrations: `backend/migrations/001_init.sql` (run via `npm --prefix backend run db:migrate`)

## Key Technical Patterns

**Control Panel UI Philosophy**: Users interact with AI decisions via UI controls (toggles, sliders), not by editing generated code. LLMs output JSON rendered as polished components.

**Dual Workflow**: "Express Lane" (accept automation) vs "Interactive Path" (manual control at each phase).

**RAG Integration**: Business documents are chunked, embedded, and stored in Postgres. Document search uses cosine similarity + keyword reranking. Answer service composes responses with citation metadata.

**Query Engine**: Dual-mode (natural language + SQL). NL→SQL service generates SQL from user queries. Both modes cache results in Postgres per `{projectId}:{hash(sql)}`.

## Environment Variables

Copy `backend/.env.example` to `backend/.env` to customize:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `4000` | Backend HTTP port |
| `DATABASE_URL` | _unset_ | Postgres connection string (required for query/RAG features) |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | CORS allowlist |
| `SQL_STATEMENT_TIMEOUT_MS` | `5000` | Query timeout |
| `QUERY_CACHE_TTL_MS` | `300000` | Cache TTL (5 min) |
| `DOC_CHUNK_SIZE` / `DOC_CHUNK_OVERLAP` | `500` / `50` | Document chunking params |

See `backend/src/config.ts` for full list.

## Git Workflow

**Main branch**: Protected, requires merge requests with approval.

**Current branch**: `sprint3-direct-sql`

**Merge request rules**:
- Requires 1+ approval
- Author/contributors cannot approve their own MRs
- Commit author email must be from `miamioh.edu`

**Issue templates**: `.gitlab/issue_templates/` (user stories, ML epics, debug reports)

## Tech Stack

**Frontend**: React 19, TypeScript 5.8, Vite 7, Tailwind CSS 3.4, shadcn/ui, Zustand 5, TanStack Table 8, react-dropzone, @dnd-kit

**Backend**: Express 5, TypeScript 5.6, Node 22 LTS, Postgres (pg 8), multer, pdf-parse, xlsx, csv-parse

**Testing**: Playwright 1.56, tsx (eval runner)

**Build**: npm workspaces, tsx watch (backend hot reload), concurrently (frontend dev script launches both workspaces)

## Development Notes

- **Node version**: 22 LTS (managed via fnm)
- **Postgres required** for query/document/answer endpoints. File-based storage used for projects/datasets.
- **DuckDB**: `frontend/src/lib/duckdb/` contains in-browser SQL engine integration (experimental).
- **Migration safety**: `npm --prefix backend run db:migrate` uses `CREATE ... IF NOT EXISTS`, safe to re-run.
- **Benchmark workflow**: Builds both workspaces, spins up backend (port 4000), serves frontend preview (port 4173), runs Playwright.
- **Evaluation**: Requires backend running. Run with `EVAL_API_BASE=http://localhost:4000/api npm --prefix testing run eval`.
- **User preference**: Avoid running dev servers (`npm run dev`) when just checking functionality—use build/test commands instead.
