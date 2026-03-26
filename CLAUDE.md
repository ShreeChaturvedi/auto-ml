# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-augmented AutoML platform is a TypeScript monorepo with a React 19 frontend, Express 5 backend, Postgres metadata store, and Docker-containerized Python runtime for sandboxed code execution. Users follow a phase-based workflow: upload → explore → preprocess → features → training → experiments.

## Commands

```bash
# Development
# Assume dev server is running with backend at port 4000 and frontend at port 5173

# Build
npm run build                # Build backend (tsc) + frontend (vite build)

# Test
npm run test                 # All tests (vitest)
npm run lint                 # Lint across workspaces (never run individual lints)

# Database
npm run db:migrate           # Run pending migrations (idempotent)

# Benchmarks & Evaluation
npm run benchmark            # Playwright E2E (headless)
npm run eval                 # NL→SQL + RAG evaluation suite
npm run benchmark:api        # API load benchmarking (autocannon)
```

## Architecture

### Monorepo Layout

- backend: Express 5 + TypeScript API server
- frontend: Vite + React 19 SPA
- testing: Playwright E2E benchmarks and evaluation runner
- migrations: Postgres schema migrations (001–008)
- `scripts/dev/run.mjs`: Dev orchestrator (Docker Postgres → migrations → dev servers)

### Backend (`backend/src/`)

- `routes/`: Express routers mounted under `/api`
- `services/`: Domain logic
- `services/llm/`: OpenAI client, MCP tool registry, LangGraph preprocessing state machine
- `services/notebook/`: Notebook CRUD and cell execution
- `services/websocket/`: WebSocket server for real-time notebook updates
- `repositories/`: File+DB-backed stores (projectRepository, datasetRepository)
- `middleware/`: JWT auth verification

Persistence is split: file-backed (projects.json, dataset metadata) + Postgres (query cache, auth, embeddings, documents, notebooks). Docker containers provide sandboxed Python execution with resource limits.

### Frontend (`frontend/src/`)

- State: Zustand stores with persistence
- Routing: React Router v7, phase-based
- API: Typed fetch wrappers in `lib/api/`
- UI: shadcn/ui + Radix primitives + Tailwind CSS

## Project Theme Color

Use `projectColorClasses` from `@/types/project` with `activeProjectId` from `useProjectStore` for all project-themed UI. See `IconModeToggle` for the reference pattern. Available fields: `text`, `bg`, `hover`, `border`, `borderAccent`, `fill`, `fillMuted`.

## Development Principles

**Code quality.** Reduce bloated files, duplicated logic, and hacky workarounds. Extract shared behavior into well-named utilities or components. Proactively refactor when you see existing technical debt — don't layer new code on top of a mess. Leave the codebase cleaner than it was found.

**UI/UX is a first-class concern.** This project prioritizes an exceptional end-user experience. Think carefully about interaction design, visual polish, loading states, error feedback, responsiveness, and accessibility. Don't just make it work — make it feel great.

**Research and leverage existing libraries and components.** Before building from scratch, investigate whether a well-maintained library or component already solves the problem — whether it's a basic UI primitive, an LLM streaming renderer, a file loader, a notebook widget, or a syncing mechanism. Prefer proven solutions over reinvention.

**Lint after completion.** Use `npm run lint` as a fast feedback loop to catch errors early. If preexisting lint errors surface, don't ignore but systematically resolve them.

**Proactively suggest improvements.** When implementing or fixing a feature, brainstorm and present alternatives: better architectural patterns, more suitable libraries, stronger UI/UX approaches, or performance optimizations. Think critically about the bigger picture.

**Write strong tests.** If all tests pass but the user encounters errors, the tests are useless. Write strong tests that almost guarantee no errors in real QA testing. When running a test suite, never ignore failing tests. Always attempt to fix with my approval.
