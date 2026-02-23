# AGENTS.md — AI-Augmented AutoML Toolchain

> Agentic coding guide. CSE 448 capstone (Miami University).
> Stack: React 19 + Vite 7 + Tailwind 3.4 + shadcn/ui | Express 5 + Node 22 LTS + Postgres 16 | Playwright 1.56

## Project Layout

```
backend/          Express + TypeScript API (port 4000)
  src/            routes/, services/, repositories/, utils/, config.ts
  migrations/     SQL migration files (run sequentially)
  storage/        local file-backed data (projects.json, datasets/)
  docker/         Python runtime image (build-runtime.sh)
frontend/         Vite + React SPA (port 5173)
  src/            components/, hooks/, stores/, types/, lib/ (api/, duckdb/)
  src/assets/     static assets
testing/          Playwright benchmark suite + eval runner
docs/             API contracts, design system, sprint reports (reference)
```

## Build, Dev & Run Commands

```bash
# Install all workspace dependencies (run once)
npm run install:all                       # or: npm --prefix <workspace> install

# Development
npm run dev                               # backend (watch) + frontend (Vite) together
npm --prefix frontend run dev:ui          # frontend only (no backend watcher)
npm --prefix backend run dev              # backend only (tsx watch, port 4000)

# Production build
npm --prefix backend run build            # tsc → build/
npm --prefix frontend run build           # tsc -b && vite build → dist/
npm run build                             # both workspaces

# Lint
npm --prefix backend run lint             # eslint src/**/*.ts
npm --prefix frontend run lint            # eslint **/*.{ts,tsx}
npm run lint                              # both workspaces
```

## Testing Commands

```bash
# Backend unit/integration (Vitest, environment: node)
npm --prefix backend run test             # run all backend tests
npx vitest run src/services/textChunker.test.ts          # single test file (from backend/)
npx vitest run -t "splits text"                          # single test by name (from backend/)
npm --prefix backend run test:watch       # watch mode
npm --prefix backend run test:coverage    # with v8 coverage

# Frontend unit (Vitest, environment: jsdom, globals: true)
npm --prefix frontend run test            # run all frontend tests
npx vitest run src/stores/__tests__/authStore.test.ts    # single test (from frontend/)
npm --prefix frontend run test:watch
npm --prefix frontend run test:coverage

# E2E / Playwright benchmarks (requires built artifacts)
npm run benchmark                         # headless
npm run benchmark:headed                  # with browser UI
npm run benchmark:api                     # API-only benchmark

# Eval runner (LLM evaluation)
EVAL_API_BASE=http://localhost:4000/api npm --prefix testing run eval

# Database
npm --prefix backend run db:migrate       # requires DATABASE_URL
```

## Code Style & Conventions

### TypeScript & Modules
- **ESM everywhere** — `"type": "module"` in all package.json files.
- Backend: target ES2022, `moduleResolution: NodeNext`. **All local imports must use `.js` extension** (e.g., `import { foo } from './utils/bar.js'`).
- Frontend: uses `@/` path alias mapping to `src/` (e.g., `import { Button } from '@/components/ui/button'`).
- `strict: true` in both tsconfigs. Prefer `const` over `let`; use `type` keyword for type-only imports.
- Explicit return types on exported functions; inferred types on internal helpers.

### Import Order (enforced by eslint-plugin-import in backend)
```ts
// 1. Node builtins
import { readFile } from 'node:fs/promises';

// 2. Third-party packages
import express, { Router } from 'express';
import { z } from 'zod';

// 3. Local modules (alphabetized, .js extension in backend)
import { validateDataset } from '../services/datasetProfiler.js';
import type { Dataset } from '../types.js';
```
Frontend uses `@/` aliases instead of relative paths; group order is the same.

### Naming Conventions
| Element | Convention | Example |
|---|---|---|
| Variables, functions | lowerCamelCase | `getUserData`, `isLoading` |
| Module-level constants | UPPER_SNAKE_CASE | `MAX_ROWS`, `DEFAULT_OPTIONS` |
| React components | PascalCase filename + export | `TrainingPanel.tsx` |
| Hooks | `use*` prefix | `useProjectStore` |
| Zustand stores | `stores/<feature>Store.ts` | `dataStore.ts`, `projectStore.ts` |
| Backend routes | `routes/<resource>.ts` | `datasets.ts`, `models.ts` |
| Backend services | `services/<domain>.ts` | `datasetProfiler.ts` |
| Test files (backend) | co-located `*.test.ts` | `textChunker.test.ts` beside `textChunker.ts` |
| Test files (frontend) | `__tests__/*.test.ts(x)` | `components/ui/__tests__/button.test.tsx` |

### Error Handling
- Use early returns for validation/error paths — avoid deeply nested `if/else`.
- Backend routes: validate inputs with **zod schemas** defined as module-level constants. Return structured JSON errors with appropriate HTTP status codes.
- Frontend: API wrappers in `lib/api/` throw on non-OK responses; callers handle via try/catch or `.catch()`.
- Backend route tests use **supertest** with a `createTestApp()` factory; a `canListen()` guard skips suites that require socket binding.

### UI & Styling
- Use **shadcn/ui** components (Radix primitives) — don't build custom low-level UI.
- Style with **Tailwind utility classes**; use `cn()` (clsx + tailwind-merge) for conditional classes.
- Semantic color tokens defined in `index.css` (`--background`, `--primary`, etc.) — don't hard-code colors.
- Layout constants: sidebar 288px (`w-72`), top bar 56px (`h-14`), tabs 40px (`h-10`).
- Typography: system sans-serif (Tailwind `font-sans`), `font-mono` for code, `text-sm` for dense UI.
- Dark mode: `.dark` class on root, toggled via theme provider.

### Backend Patterns
- **Router factory pattern**: `export function createXRouter() { const router = Router(); ... return router; }`, mounted on `/api` in `app.ts`.
- **File-backed repos**: `projectRepository` and `datasetRepository` read/write JSON to `storage/`.
- **LLM streaming**: NDJSON over SSE; event types: `token`, `envelope` (contains `tool_calls` or `ui`), `error`, `done`.
- **Gemini integration**: `geminiClient.ts` with thinking mode; `toolChoice: 'auto'` (not `'any'`); handle `MALFORMED_FUNCTION_CALL` gracefully.

## Environment Variables

Set in `backend/.env` (see `.env.example`). Key vars:
- `PORT` (default 4000), `DATABASE_URL` (Postgres connection string)
- `ALLOWED_ORIGINS` (CORS; defaults include localhost:5173)
- `SQL_STATEMENT_TIMEOUT_MS` (5000), `SQL_MAX_ROWS` (1000), `QUERY_CACHE_TTL_MS` (300000)
- `DOCKER_ENABLED`, `DOCKER_IMAGE` (for Python code execution runtime)
- `JWT_SECRET`, `BCRYPT_ROUNDS` (12) — auth wired but route enforcement pending
- `GEMINI_API_KEY`, `GEMINI_MODEL` — LLM provider config
- Frontend: `VITE_API_BASE_URL` overrides backend URL (default `http://localhost:4000/api`)

## Git & CI

- **Branch model**: `main` is protected; requires MR approval.
- **Commit prefixes**: `feat:`, `fix:`, `docs:`, `test:`, `chore:` — imperative mood, ≤72 char subject.
- **CI pipeline** (`.github/workflows/ci.yml`): spins up Postgres service, runs migrations, seeds, starts backend, executes eval runner.
- **Pre-PR checklist**: lint both workspaces, build both, run relevant tests. Note any skipped checks with rationale.
- Never commit `.env`, credentials, or large binaries. Keep `storage/` out of git.

## Architecture Notes

- **Control Panel UI**: LLM outputs structured JSON (tool calls / `render_ui` envelopes) rendered as interactive UI controls — never raw text/code dumps.
- **Dual Workflow**: Express Lane (one-click auto) vs Interactive (step-by-step user control).
- **Query Engine**: Postgres is the active query engine. DuckDB-WASM module exists in `frontend/src/lib/duckdb/` but is **unused** — do not wire it up.
- **RAG**: hash-based embeddings (no pgvector), cosine + keyword hybrid search, no LLM generation layer yet.
- **Code Execution**: Docker-based Python runtime (`backend/docker/`). Build image: `cd backend/docker && ./build-runtime.sh`.
- **Node version**: 22 LTS (managed via fnm). Ensure `node -v` shows v22.x.

## Known Issues & Gotchas

- Route tests auto-skip (`describe.skip`) when the test runner can't bind a socket — this is expected in CI.
- Pre-existing TS build warnings in `auth.ts`, `containerManager.ts`, `documentParser.ts`, `geminiClient.ts`, `llm.ts` — fix opportunistically.
- Upload UI can show false failure until page refresh (frontend optimistic update race).
- Tool calls fail when Gemini Thinking mode is OFF — compare stream payloads when debugging.
- `npm run dev` starts **both** backend and frontend — don't start redundant servers when you only need to check build/lint.
