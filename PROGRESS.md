# Project Progress

Last verified: 2025-12-18

## Verified Working

### Backend
- Express API with health + project CRUD.
- Dataset upload (CSV/JSON/XLSX) with profiling + disk persistence (full row counts + sample-based stats).
- Optional Postgres ingestion for datasets and query execution (table names include dataset suffix).
- SQL execution endpoint with read-only validation, timeout, caching, and EDA summary.
- Document ingestion (PDF/Markdown/TXT), chunking with overlap, lightweight embeddings, and search.
- Answer endpoint that composes responses from retrieved snippets (no LLM).
- Preprocessing analysis endpoint with heuristic suggestions based on sampled data.
- Auth endpoints wired (register/login/refresh/logout/me/profile) when Postgres is configured.
- Model training API with template-based sklearn runners and file-backed model registry.

### Frontend
- Project creation + workflow phases via AppShell/Sidebar.
- Upload UI with drag-and-drop for datasets and context docs.
- Data Explorer: SQL editor (Monaco), query execution, EDA visualization panels.
- Preprocessing UI: table selector, suggestions, and “express lane” toggles.
- Feature engineering UI + apply flow that generates derived datasets.
- Training UI: model templates + code cells + RAG Q&A (Pyodide + Docker runtime).
- Auth routes + screens (login/signup/forgot/reset/profile) with token refresh handling.
- Experiments panel with model training controls and registry list.

### Testing
- Backend unit tests for core services + routes (health/projects/datasets/query) and dataset loader parsing.
- Playwright benchmark flow (build + UI upload).
- NL→SQL + RAG eval runner with fixtures.

## Partial / In Progress

- NL→SQL: template-based stub, not semantic parsing.
- RAG: retrieval + snippet composition; no LLM generation.
- **Training: hybrid Pyodide/Docker code execution implemented (browser runtime ready, cloud runtime requires Docker).**
- Auth: implemented; end-to-end flows still need validation with Postgres and SMTP configured.
- DuckDB: client library exists but is unused; backend Postgres is active query engine.
- Document uploads: wired for PDF/Markdown/TXT (docx not supported yet).
- Package management UI wired into runtime manager (pip/micropip).
- Deployment phase remains placeholder UI.

## Known Issues (High Priority)

- Backend route tests auto-skip when local socket binding is disallowed (canListen helper); run them in environments that permit `listen`.
- **Docker runtime requires building the image: `cd backend/docker && ./build-runtime.sh`**

## Next Milestones

1. Validate auth flows end-to-end with Postgres + SMTP enabled.
2. ~~Decide NL→SQL strategy and server-side code execution architecture.~~ ✅ Implemented hybrid Pyodide/Docker.
3. Validate Docker runtime image + cloud execution end-to-end.
4. Expand test coverage (backend + frontend + E2E) with realistic flows.
5. Add deeper performance benchmarks (query latency, memory, concurrency).
