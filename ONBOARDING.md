# Onboarding Guide

Welcome to the Agentic AutoML Platform. This guide covers environment setup and available tasks. Read `README.md` and `CLAUDE.md` first for project context.

---

## Part 1: Environment Setup

### 1.1 Prerequisites

Install the following on macOS:

- **Node.js 22 LTS** (via nvm or Homebrew)
- **Docker Desktop** (required for the sandboxed Python runtime)
- **Git** (comes with Xcode Command Line Tools)
- **glab CLI** (GitLab CLI — via Homebrew: `brew install glab`)

### 1.2 GitLab (glab) Setup

This project uses a self-hosted GitLab instance, **not** gitlab.com.

- Instance: `gitlab.csi.miamioh.edu`
- Authenticate glab against this hostname (not the default gitlab.com)
- After auth, verify you can list issues and create branches
- Remote URL: `git@gitlab.csi.miamioh.edu:2026-senior-design-projects/ai-augmented-automl-toolchain/ai-augmented-auto-ml-toolchain.git`

### 1.3 Clone and Branch Setup

- Clone the repository
- Checkout the `sprint9` branch — this is the current working branch
- **Never push directly to `sprint9`.** Always create a sub-branch off `sprint9` for your work (e.g., `zarif/structured-logging`), then open a Merge Request into `sprint9` for review.

### 1.4 Environment Variables

Both `backend/` and `frontend/` have `.env.example` files. Copy each to `.env` in the same directory.

**Backend (`backend/.env`):**
- Most values have sensible defaults. The two you need to fill in:
  - `DATABASE_URL` — Format: `postgres://user:password@localhost:5433/automl`. The dev script auto-provisions a Docker Postgres container, so you can use `postgres://automl:automl@localhost:5433/automl` as a starting point.
  - `OPENAI_API_KEY` — You've been given a key. Paste it here. This powers the LLM features (preprocessing, NL-to-SQL, training chat).
- Leave everything else at defaults unless you have a reason to change it.

**Frontend (`frontend/.env`):**
- Copy from `.env.example`. The default `VITE_API_BASE=http://localhost:4000/api` is correct for local dev.

### 1.5 Docker

Docker Desktop must be **running** before you start the dev server. The platform uses Docker for two things:

1. **Postgres database** — The dev script (`npm run dev`) automatically creates and starts a Postgres 16 container.
2. **Python runtime** — Sandboxed Docker containers execute notebook cells. The runtime image (`automl-python-runtime:latest`) is auto-built on first run from `backend/docker/Dockerfile.python-runtime`.

Make sure Docker has sufficient resources allocated (at least 4 GB memory recommended).

### 1.6 Starting the Dev Environment

Run the dev orchestrator from the repo root. It handles everything in sequence: Docker Postgres startup, dependency installation, database migrations, and launching both the backend (port 4000) and frontend (port 5173) dev servers.

If the dev script reports that a port is already in use, kill the existing process on that port.

### 1.7 Verify It Works

Once the dev servers are running:

- Open the frontend in your browser. You should see a login/signup page.
- Create an account (local auth, no email verification needed in dev).
- Create a new project.
- Upload a test dataset from `testing/fixtures/` (see Section 1.8 below).
- Navigate through the phases: Upload → Explore → Preprocess. If EDA charts render and the preprocessing chat responds, your LLM integration is working.

### 1.8 Test Data for Manual QA

Pre-built fixtures live in `testing/fixtures/`. Use these for manual testing:

**Quick test (single file):**
- `testing/fixtures/mock_customer_churn_clean.csv` — 250-row customer churn dataset. Good for a fast end-to-end test of upload → explore → preprocess → train.

**Full test suite (multi-table B2B SaaS scenario):**
- `testing/fixtures/mock-business/` — 5 related CSVs totaling 23K+ rows simulating a B2B SaaS company called "NovaCraft." Includes intentional data quality issues (missing values, duplicates, outliers, constant columns) that exercise the preprocessing pipeline. See `testing/fixtures/mock-business/README.md` for the full data dictionary, ER diagram, and suggested ML tasks.
- `testing/fixtures/mock-business/novacraft_business_context.pdf` — Domain context document. Upload this alongside the CSVs to test the RAG/document Q&A features.

### 1.9 Useful Commands

Read `CLAUDE.md` for the full command reference. The key ones:

- **Dev server:** `npm run dev` (starts everything)
- **Lint:** `npm run lint` (run this before every push — it catches errors across both workspaces)
- **Tests:** `npm run test` (full Vitest suite)
- **Build:** `npm run build` (TypeScript compile + Vite production build — good sanity check)

---

## Part 2: AI Agent Skills

### 2.1 Custom Project Skills (Claude Code)

The repo includes custom slash-command skills in `.claude/skills/`. These work in Claude Code — invoke them with `/<skill-name>`.

| Skill | Command | Description |
|-------|---------|-------------|
| **issue** | `/issue [description]` | Creates a GitLab issue with proper labels and formatting. Reads recent issues to match the team's style, detects the current sprint from the branch name, and picks labels from the existing label set. |
| **fix-issue** | `/fix-issue [number]` | Fixes a GitLab issue by number. Reads the issue, explores the relevant code, plans the fix, implements it, runs lint and tests, then summarizes what changed. Does not auto-commit. |
| **now-fix** | `/now-fix` | Immediately fixes the issue that was just created with `/issue` in the same session. Uses the context already gathered instead of re-fetching from GitLab. |
| **frontend-design** | `/frontend-design` | Generates production-grade, visually distinctive frontend UI. Emphasizes bold creative direction, avoids generic AI aesthetics. Use when building or redesigning UI components. |

For **Codex**, these skills aren't invoked as slash commands. Instead, read the skill file (e.g., `.claude/skills/issue/SKILL.md`) and follow the steps described in it, or paste the relevant instructions into your prompt.

### 2.2 Recommended Extensions and MCP Servers

Install these to improve your agent's capabilities:

| Tool | What it does | Why it's useful |
|------|-------------|-----------------|
| **Playwright MCP** | Browser automation via MCP protocol | Automate E2E testing, take screenshots, interact with the running app for QA |
| **TypeScript LSP** | TypeScript language server via MCP | Get type checking, go-to-definition, find-references, and diagnostics inside your agent |
| **Superpowers** | Enhanced Claude Code workflows (brainstorming, TDD, debugging, planning) | Structured approach to complex tasks — brainstorm designs, write implementation plans, debug systematically |
| **Context7** | Library documentation lookup via MCP | Get up-to-date docs for React, Express, Tailwind, shadcn/ui, etc. without relying on training data |
| **feature-dev** | Feature development agent suite | Code review, architecture design, and codebase exploration agents for building features systematically |

---

## Part 3: Tasks

These tasks are ordered from most isolated to most involved. **Do them one at a time, incrementally.** Each task should be a separate branch and MR. Don't rush through multiple tasks — thoroughness matters more than volume.

### Task 1: Structured Logging

**What:** Replace all `console.log` / `console.error` / `console.warn` calls in the backend with a structured logging library (pino is recommended for Express).

**Why:** The backend currently uses bare `console.*` calls scattered across routes, services, and repositories. There's no structured format, no log levels, no request correlation. This makes debugging production issues difficult.

**Scope:**
- Install and configure pino (or winston) with JSON output in production and pretty-print in development
- Create a shared logger instance in a central module (e.g., `backend/src/lib/logger.ts`)
- Replace every `console.log`, `console.error`, and `console.warn` in `backend/src/` with the appropriate log level (`logger.info`, `logger.error`, `logger.warn`)
- Add request-scoped logging via Express middleware (attach a request ID to each log line)
- Make sure log output doesn't break existing tests

**What "done" looks like:**
- Zero `console.log/error/warn` calls remain in `backend/src/` (except in test files)
- Logs are structured JSON in production, human-readable in dev
- Each HTTP request gets a unique request ID that appears in all log lines during that request
- `npm run lint` passes
- `npm run test` passes

---

### Task 2: Enhanced Health Endpoint

**What:** Expand the existing `GET /api/health` endpoint to report the status of all system dependencies.

**Why:** The current health check returns a static `{ status: 'ok', uptime, timestamp, hostname }`. It doesn't actually verify that the database is reachable, Docker is running, or the Python runtime image exists. A real health check should tell you what's actually working.

**Scope:**
- Keep the existing response shape but add a `checks` object with individual component statuses
- Check: Postgres connectivity (run a simple `SELECT 1` query)
- Check: Docker daemon reachable (verify the Docker socket or run a version command)
- Check: Python runtime image exists locally
- Check: Memory usage (process RSS and heap)
- The overall `status` should be `ok` only if all critical checks pass, `degraded` if non-critical checks fail, or `error` if critical checks fail
- Add appropriate error handling so a failed check doesn't crash the endpoint

**What "done" looks like:**
- `GET /api/health` returns detailed component statuses
- The endpoint responds within a reasonable timeout even if Docker is down
- Add or update the health route test to cover the new checks
- `npm run lint` and `npm run test` pass

---

### Task 3: API Request Timing Middleware

**What:** Add Express middleware that measures and logs the response time for every API request, using the structured logger from Task 1.

**Why:** There's no visibility into which endpoints are slow. Adding timing data to every request log makes it possible to identify performance bottlenecks from log output alone.

**Scope:**
- Create middleware that records the start time at request entry and calculates duration at response finish
- Log: method, path, status code, response time in milliseconds, and request ID (from Task 1)
- Optionally add a `X-Response-Time` header to responses
- Do NOT add external monitoring dependencies (no Prometheus, no StatsD) — this is log-based only
- Wire the middleware into `app.ts` early in the middleware chain

**What "done" looks like:**
- Every API request gets a log line with its response time
- Slow requests (>1s) are logged at `warn` level
- `npm run lint` and `npm run test` pass

---

### Task 4: Backend Test Coverage

**What:** Identify backend routes and services that lack test coverage and write tests for them.

**Why:** The test suite has 44 test files but there are gaps. Writing tests forces you to understand the code, making this a great way to learn the codebase while contributing something valuable.

**Scope:**
- Audit existing test files against the route and service files to find gaps
- Prioritize routes that handle user-facing operations: datasets, notebooks, workflows, experiments
- Follow the existing test patterns (Vitest + supertest for routes, `vi.mock()` for service dependencies, `describeRouteSuite` wrapper)
- Write tests that cover both happy paths and error cases (bad input, missing auth, not-found resources)
- Each test file should follow the naming convention: `<module>.test.ts` alongside the source file

**What "done" looks like:**
- At least 3 new test files for previously untested or under-tested modules
- Tests cover meaningful scenarios, not just "returns 200"
- All tests pass: `npm run test`
- `npm run lint` passes

---

### Task 5: Settings API (Backend)

**What:** Create a backend API for user-configurable application settings, persisted in Postgres.

**Why:** Many useful configuration values are currently hardcoded as environment variables (query cache TTL, SQL execution limits, execution timeout, LLM model selection). Making these runtime-configurable lets users tune the platform without restarting the server.

**Scope:**
- Create a new migration to add a `user_settings` table (user_id FK, setting key, value, updated_at)
- Create a settings repository (`backend/src/repositories/settingsRepository.ts`)
- Create settings routes: `GET /api/settings` (read current user's settings), `PATCH /api/settings` (update)
- Define which settings are user-configurable with validation schemas (using Zod):
  - Query cache TTL (min: 0, max: 3600000 ms)
  - SQL max rows (min: 10, max: 10000)
  - SQL default limit (min: 10, max: 1000)
  - Execution timeout (min: 5000, max: 120000 ms)
  - Execution max memory (min: 256, max: 4096 MB)
- Settings should fall back to env var defaults when a user hasn't overridden them
- Wire settings into the services that use these values (query executor, code execution service)

**What "done" looks like:**
- Migration creates the table
- API endpoints work with proper auth
- Settings are validated with Zod
- Services read from user settings with env var fallback
- Tests cover the new routes and repository
- `npm run lint` and `npm run test` pass

---

### Task 6: Settings Page (Frontend)

**What:** Extend the existing Settings/Profile page to include the configurable settings from Task 5.

**Why:** The current settings page (`frontend/src/components/auth/ProfileSettings.tsx`) only has profile info and password change. After Task 5, there are backend endpoints for runtime settings — this task adds the UI.

**Scope:**
- Add new sections to the existing ProfileSettings page (or create a tabbed layout):
  - **Query Settings**: Cache TTL, max rows, default limit
  - **Execution Settings**: Timeout, max memory
- Use the existing form patterns (react-hook-form + Zod + SaveButton component)
- Fetch current settings on page load, show defaults when no user override exists
- Include helpful descriptions for each setting so users understand what they control
- Match the existing design language (shadcn/ui components, consistent spacing)

**What "done" looks like:**
- Settings page shows all configurable settings with current values
- Users can modify and save individual settings
- Changes persist and take effect on subsequent API calls
- Responsive layout works on mobile
- `npm run lint` and `npm run test` pass

---

### Task 7: Dataset Filtering Optimization

**What:** Move dataset list filtering from in-memory JavaScript to database-level queries.

**Why:** In `backend/src/routes/datasets.ts`, dataset listing loads all datasets then filters with `datasets.filter(d => d.projectId === projectId)` in JavaScript. This is inefficient at scale — the database should do the filtering.

**Scope:**
- Trace how datasets are stored and retrieved (file-backed via `datasetRepository`)
- Modify the repository method to accept a `projectId` filter parameter
- If datasets are file-backed (JSON), add indexing or restructure the data to support efficient project-scoped lookups
- If datasets are in Postgres, add a `WHERE` clause to the query
- Update the route handler to use the filtered query instead of post-fetch filtering
- Verify no other callers are affected

**What "done" looks like:**
- Dataset listing for a project no longer loads all datasets into memory
- Behavior is identical from the API consumer's perspective
- Tests cover the filtered and unfiltered cases
- `npm run lint` and `npm run test` pass

---

## Part 4: Workflow Reminders

- **One branch per task.** Name branches descriptively: `zarif/structured-logging`, `zarif/health-endpoint`, etc.
- **Open MRs into `sprint9`** for review. Include a clear description of what changed and how to test it.
- **Run lint and tests before pushing.** `npm run lint && npm run test`. Fix what you break.
- **Don't batch tasks.** Each task is its own MR. Get one merged before starting the next.
- **Ask questions.** If something is unclear or you're stuck, ask rather than guessing.
