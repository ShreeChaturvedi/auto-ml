<p align="center">
  <img src="docs/branding/readme.svg" width="800" alt="Agentic AutoML Platform">
</p>

<p align="center">
  <img src="https://gitlab.csi.miamioh.edu/2026-senior-design-projects/ai-augmented-automl-toolchain/ai-augmented-auto-ml-toolchain/badges/main/pipeline.svg?style=flat-square" alt="pipeline">
  <img src="https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square" alt="license">
  <img src="https://img.shields.io/badge/node-22%20LTS-brightgreen?style=flat-square&logo=nodedotjs" alt="node">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="typescript">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="react">
  <img src="https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express&logoColor=white" alt="express">
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="postgresql">
</p>

---

**Agentic AutoML Platform** turns datasets and domain documents into production ML models through LLM-orchestrated pipelines. An agentic core powered by LangGraph and MCP tools handles everything from data exploration to deployment, with human-in-the-loop approval gates at every step.

## Workflow

Seven phases mirror the ML lifecycle. Each phase is driven by an LLM agent that proposes actions, generates code, and validates results while the operator approves or edits before execution.

### Upload & Planning

<p align="center">
  <img src="docs/screenshots/upload.png" width="100%" alt="Data upload with project plan created by LLM agent">
</p>

Ingest datasets (CSV, JSON, XLSX) and domain documents (PDF, DOCX, Markdown) into a project workspace. The LLM agent analyzes uploaded data and creates a structured project plan with recommended preprocessing steps, feature engineering strategies, and modeling approaches.

### Data Exploration

<p align="center">
  <img src="docs/screenshots/eda.png" width="100%" alt="Automated EDA with statistical profiling and distribution charts">
</p>

Automated statistical profiling generates distribution charts, correlation matrices, and missing-value analysis on dataset upload. Column-level statistics, data quality scoring, and interactive visualizations surface patterns and issues before any modeling begins.

### NL-to-SQL Querying

<p align="center">
  <img src="docs/screenshots/nl-to-sql.png" width="100%" alt="Natural language to SQL query interface with results">
</p>

Query datasets with natural language or raw SQL. A 4-phase pipeline handles intent classification, query generation, execution, and result formatting. Failed queries trigger automatic repair with error context fed back to the LLM.

### Preprocessing

<p align="center">
  <img src="docs/screenshots/preprocessing.png" width="100%" alt="LLM-driven preprocessing with approval gates and tool calls">
</p>

The LLM agent analyzes raw data and generates Python preprocessing code in notebook cells. Each transformation is proposed, reviewed, executed, and validated through MCP tool calls. Bounded auto-repair retries failed cells with error context rather than silently producing bad output.

### Training

<p align="center">
  <img src="docs/screenshots/training.png" width="100%" alt="Model training workspace with LLM chat and notebook">
</p>

Train models through an interactive notebook workspace. The agent generates training code, executes cells in sandboxed Docker containers, and reports metrics. Persistent kernel state maintains variables across cell executions within a session.

### Experiments

<p align="center">
  <img src="docs/screenshots/experiments.png" width="100%" alt="Experiment leaderboard with model comparison and metrics">
</p>

Compare trained models on a leaderboard with automatic champion detection and a natural language filter bar. Run Optuna hyperparameter optimization studies with real-time progress streaming. Analyze model errors with decision tree attribution and explore interpretability with SHAP.

### Deployment

Deploy trained models through a dedicated deployment phase with readiness checks, build orchestration, prediction playgrounds, logs, monitoring, and real-time status updates.

## Under the Hood

**LangGraph Orchestration.** A state-machine engine coordinates multi-step ML pipelines through MCP tool calls, with phase-aware routing that selects the right tools for each workflow stage.

**RAG with Hybrid Search.** Ingest domain documents to ground LLM responses in your data. Combines embedding similarity with keyword search for cited, context-aware answers.

**Interactive Notebooks.** Monaco editor with Jedi-powered Python completions, hover documentation, and syntax highlighting. WebSocket sync with savepoints for checkpoint/restore. Kernel HTML output rendered in isolated Shadow DOM.

**Sandboxed Execution.** Docker containers with read-only root filesystem, non-root user, and configurable memory/CPU limits. Jupyter Kernel Gateway maintains Python kernel state across cell executions.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TypeScript, Zustand, shadcn/ui, Radix, Tailwind CSS, Monaco Editor |
| Backend | Express 5, TypeScript, LangGraph, MCP SDK, OpenAI SDK, Zod |
| Database | PostgreSQL 16 (metadata, embeddings, notebooks, workflows) |
| Execution | Docker (Python 3.11, scikit-learn, pandas, numpy, Optuna, SHAP) |
| Testing | Vitest (unit), Playwright (E2E), custom eval runner (NL-to-SQL + RAG) |

## Quick Start

**Prerequisites:** Node.js 22 LTS, Docker

```bash
npm run install:all    # Install backend + frontend + testing + landing + video dependencies
npm run dev            # Boot managed Postgres, run migrations, start dev servers
```

The dev server starts the backend at `localhost:4000` and frontend at `localhost:5173`.
If `npm run dev` creates or starts the managed `automl-postgres-<port>` container, it will stop that container on shutdown. Compatible containers that were already running are left running.

## Development

### Repository Layout

```
backend/              Express 5 + TypeScript API server
  src/routes/         Express routers mounted under /api
  src/services/       Domain logic (LLM, notebook, websocket)
  src/repositories/   File + DB-backed data stores
  migrations/         SQL migration files
frontend/             Vite + React 19 SPA
  src/components/     UI components (shadcn/ui + custom)
  src/stores/         Zustand state management
  src/lib/api/        Typed fetch wrappers
landing/              Astro marketing site + public workspace preview
video/                Remotion-based product and branding videos
scripts/dev/          Dev orchestrator (Docker + migrations + servers)
testing/              Playwright E2E benchmarks + eval runner
docs/                 Branding assets, API contracts, design system
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run install:all` | Install backend, frontend, testing, landing, and video dependencies |
| `npm run audit` | Audit root, backend, frontend, and testing dependencies |
| `npm run dev` | Start development environment (managed Postgres + migrations + servers) |
| `npm run build` | Build backend (tsc) + frontend (Vite) |
| `npm run build:landing` | Build the Astro landing site |
| `npm run test` | Run backend + frontend Vitest suites |
| `npm run test:landing` | Run the landing Vitest suite |
| `npm run lint` | Lint backend, frontend, and video |
| `npm run lint:landing` | Lint the landing workspace |
| `npm run db:migrate` | Run pending migrations (idempotent) |
| `npm run benchmark` | Playwright E2E benchmarks (headless) |
| `npm run eval` | NL-to-SQL + RAG evaluation suite |
| `npm run benchmark:api` | API load benchmarking (autocannon) |
| `npm run vercel:landing:pull:preview` | Pull preview settings for the Vercel landing project |
| `npm run vercel:landing:pull:production` | Pull production settings for the Vercel landing project |
| `npm run vercel:landing:build` | Build the landing app with Vercel's Build Output API |
| `npm run vercel:landing:deploy:preview` | Deploy a preview-safe prebuilt landing artifact to Vercel |
| `npm run vercel:landing:deploy:production` | Promote a prebuilt landing artifact to Vercel production |
| `npm run vercel:frontend:pull:preview` | Pull preview settings for the frontend Vercel project (rooted at `frontend/`) |
| `npm run vercel:frontend:pull:production` | Pull production settings for the frontend Vercel project |
| `npm run vercel:frontend:build` | Build the frontend app with Vercel's Build Output API |
| `npm run vercel:frontend:deploy:preview` | Deploy a preview-safe prebuilt frontend artifact to Vercel |
| `npm run vercel:frontend:deploy:production` | Promote the prebuilt frontend artifact to Vercel production |

## Documentation

- [`docs/api-contracts.md`](docs/api-contracts.md) - Request/response contracts
- [`docs/design-system.md`](docs/design-system.md) - UI guidelines and component patterns
- [`docs/beta-zero-paid-deploy.md`](docs/beta-zero-paid-deploy.md) - zero-paid beta deploy runbook (Vercel + DuckDNS + single-host backend)

## License

[GPL-3.0](LICENSE)
