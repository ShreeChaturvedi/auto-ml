# Agentic AutoML Platform

The Agentic AutoML Platform is a full-stack TypeScript application for moving from raw datasets and domain context to evaluated, deployable machine-learning models. It combines a React workspace, an Express API, PostgreSQL metadata/search storage, Docker-sandboxed Python execution, and LLM-orchestrated workflow agents.

The product is organized around the ML lifecycle:

1. Upload datasets and project context.
2. Explore data with profiling, SQL, natural-language querying, and document search.
3. Preprocess data with LLM-generated transformation plans and human approval.
4. Engineer features in workbook-style pipelines.
5. Train models in notebook-backed Python runtimes.
6. Compare experiments, explain errors, and tune candidates.
7. Deploy selected models with prediction, monitoring, logs, and drift tooling.

## Current System

| Area | Current implementation |
| --- | --- |
| Frontend | React 19, Vite, TypeScript, Zustand, React Router, Tailwind, shadcn/ui, Radix primitives, Monaco editor |
| Backend | Express 5, TypeScript, Zod validation, JWT auth, OpenAI SDK integration, LangGraph-style workflow orchestration, MCP-compatible tool routes |
| Persistence | PostgreSQL for auth, query cache, documents, embeddings, notebooks, workflows, experiments, models, and deployments; file-backed storage for project/dataset/model artifacts |
| ML runtime | Dockerized Python 3.11 execution, Jupyter-style notebook sessions, package management, kernel completions/hover/signatures, and resource limits |
| Evaluation | Vitest unit/integration suites, Playwright benchmark flows, NL-to-SQL/RAG eval runner, API load benchmarks |

## Wiki Map

- [Product Documentation](Product-Documentation): what the product does and how users move through it.
- [User Guide](Product-Documentation/User-Guide): phase-by-phase operating guide.
- [New Team Handoff](Product-Documentation/New-Team-Handoff): IDE setup, first-day setup, common tasks, troubleshooting, and handoff checklist.
- [Architecture](Product-Documentation/Architecture): system design, data flow, and major runtime boundaries.
- [Backend and API](Product-Documentation/Backend-and-API): Express routes, services, persistence, notebooks, LLM, MCP, and deployment APIs.
- [API Reference](Product-Documentation/API-Reference): concrete endpoint groups, request conventions, streaming behavior, and example payloads.
- [Frontend Architecture](Product-Documentation/Frontend-Architecture): routing, stores, API clients, workflow UI, and design system.
- [Developer Operations](Product-Documentation/Developer-Operations): setup, commands, environment variables, and local services.
- [Testing and Evaluation](Product-Documentation/Testing-and-Evaluation): test strategy, benchmark assets, evaluation commands, and quality gates.
- [Deployment and Runtime](Product-Documentation/Deployment-and-Runtime): runtime services, model deployment, prediction proxying, and operational considerations.
- [Constraints and Limitations](Product-Documentation/Constraints-and-Limitations): product, security, runtime, data, LLM, and deployment constraints.
- [Project Documentation](Project-Documentation): charter, working agreement, risks, milestones, and standards.

## Quick Start

Prerequisites:

- Node.js 22 LTS and npm 10+
- Docker
- PostgreSQL 16 or the managed local Postgres container started by `npm run dev`

```bash
npm run install:all
npm run dev
```

The managed development command starts the backend on `http://localhost:4000`, the frontend on `http://localhost:5173`, runs database migrations, and starts or reuses a compatible local Postgres container.

Useful verification commands:

```bash
npm run build
npm run test
npm run lint
npm run benchmark
npm run eval
npm run benchmark:api
```
