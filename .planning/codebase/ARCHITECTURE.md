# Architecture

**Analysis Date:** 2026-03-13

## Pattern Overview

**Overall:** Layered client-server with real-time streaming and containerized code execution.

**Key Characteristics:**
- Monorepo with separate frontend (React 19/Vite) and backend (Express 5/TypeScript) workspaces
- Phase-based workflow for ML projects (upload → explore → preprocess → features → training → experiments)
- LangGraph orchestration for multi-step preprocessing and training workflows
- WebSocket streaming for real-time notebook cell execution and state updates
- Docker containers for sandboxed Python code execution with resource isolation
- Postgres metadata store with file-backed repositories for projects/datasets
- JWT authentication with refresh tokens

## Layers

**Presentation Layer (Frontend):**
- Purpose: React SPA with phase-based UI, real-time updates, and agentic chat
- Location: `frontend/src/`
- Contains: React components, Zustand stores, route handlers, API client wrappers
- Depends on: Backend API via fetch/WebSocket, local auth tokens
- Used by: Browser clients

**API Layer (Backend Routes):**
- Purpose: Express routers handling HTTP requests and WebSocket connections
- Location: `backend/src/routes/`
- Contains: Route handlers with validation, streaming response setup, parameter parsing
- Depends on: Domain services, middleware, database connections
- Used by: Frontend, testing harness

**Domain Logic Layer (Services):**
- Purpose: Core business logic orchestration and tool implementation
- Location: `backend/src/services/`
- Contains: LangGraph preprocessing, notebook execution, feature engineering, ML model training, NL→SQL conversion, answer generation
- Depends on: Repositories, LLM clients, container managers, utilities
- Used by: Routes, other services

**Data Access Layer (Repositories):**
- Purpose: Abstraction over persistence (file-backed or Postgres)
- Location: `backend/src/repositories/`
- Contains: ProjectRepository, DatasetRepository, NotebookRepository with pluggable backends (file, in-memory, Postgres)
- Depends on: Database connection, file system
- Used by: Services, routes

**Container/Execution Layer:**
- Purpose: Sandboxed Python code execution with resource limits
- Location: `backend/src/services/container/`, `backend/docker/Dockerfile.python-runtime`
- Contains: Docker image management, container lifecycle, Jupyter Kernel Gateway protocol
- Depends on: Docker daemon, system resources
- Used by: Cell execution service, feature engineering, model training

**Real-time Communication:**
- Purpose: Bidirectional updates for notebook changes and execution results
- Location: `backend/src/services/websocket/wsServer.ts`
- Contains: WebSocket server (on `/ws/notebook`), client subscription tracking, message broadcasting
- Depends on: HTTP server, services for state changes
- Used by: Notebook cell execution, notebook CRUD operations

## Data Flow

**Project Initialization Flow:**

1. Frontend: `useProjectStore.initialize()` → API fetch to `/api/projects`
2. Backend: `getProjectRoutes` → `projectRepository.listProjects()` → file (or Postgres) backend
3. Backend: Returns array of projects with phase state metadata
4. Frontend: Zustand store normalizes and caches projects with localStorage persistence

**Data Upload & Profiling Flow:**

1. Frontend: `UploadArea` component → multipart form to `/api/datasets/upload`
2. Backend: `dataLoading/fileParser.ts` → detect file type (CSV/JSON/XLSX)
3. Backend: `dataLoading/schemaInference.ts` → infer column types and statistics
4. Backend: `datasetRepository.saveDatasetProfile()` → store metadata, return dataset ID
5. Frontend: Store dataset in Zustand `dataStore`, navigate to explore phase

**Preprocessing Workflow (LangGraph):**

1. Frontend: User starts preprocessing → POST `/api/preprocessing/start`
2. Backend: `createPreprocessingLangGraphRuntime()` creates runtime instance
3. Backend: `createPreprocessingLangGraphSynchronizer()` wires tools and state bindings
4. Backend: LangGraph executes nodes: `check_quality` → `handle_missing` → `handle_duplicates` → `handle_outliers` → `validation`
5. Backend: Each node invokes tool from `services/llm/preprocessingTools/` (datasetTools, transformationTools, etc.)
6. Backend: State checkpoint saved to `preprocessingRunRepository` after each step
7. Frontend: Server-sent events stream step summaries, UI updates timeline

**Notebook Cell Execution:**

1. Frontend: Editor sends cell code → POST `/api/notebooks/:notebookId/cells/:cellId/execute`
2. Backend: `cellExecutionService` gets or creates container via `getOrEnsureContainer()`
3. Backend: Container image pre-built from `Dockerfile.python-runtime` (numpy, pandas, scikit-learn, etc.)
4. Backend: Code executes in sandbox via Jupyter Kernel Gateway protocol
5. Backend: Output captured (stdout, stderr, MIME types) and stored in `outputStorage.ts`
6. Backend: WebSocket broadcasts result to all subscribed clients on notebook channel
7. Frontend: Receives via WebSocket store, renders in notebook UI

**Feature Engineering Flow:**

1. Frontend: User defines features → POST `/api/features/generate`
2. Backend: `featureEngineering/codeGenerator.ts` synthesizes Python code from specifications
3. Backend: Code executes in container against active dataset
4. Backend: Generated features appended to working dataset
5. Backend: Feature metadata stored in Zustand store with versioning

**LLM Query Processing (Agentic):**

1. Frontend: User sends natural language query → `/api/llm/preprocessing` (or similar)
2. Backend: `llmClient.ts` sends to OpenAI with MCP tool registry
3. Backend: LLM selects tools, backend invokes via MCP contract
4. Backend: Tools return structured results (data, metadata, validation)
5. Backend: Server-sent event stream sends tokens and tool results
6. Frontend: Accumulates text tokens, renders markdown, displays tool UI overlays

**State Management:**

**Frontend (Zustand):**
- `projectStore`: Projects list, active project, phase unlocking logic
- `dataStore`: Dataset metadata, column profiles
- `preprocessingStore`: Preprocessing run state, checkpoints, timeline steps
- `featureStore`: Generated features, versions
- `notebookStore`: Open notebooks, active cell, execution states
- All stores support localStorage persistence

**Backend (Hybrid):**
- File-backed: Projects (projects.json), dataset metadata, preprocessing runs
- Postgres: User accounts, query cache, embeddings, notebook cells
- In-memory (runtime): Container references, WebSocket client subscriptions, LangGraph execution state

## Key Abstractions

**ProjectRepository (Pluggable):**
- Purpose: Abstract project persistence with multiple backends
- Examples: `backend/src/repositories/project/fileBackend.ts`, `postgres.ts`, `inMemory.ts`
- Pattern: Strategy pattern; `createProjectRepository(path)` returns correct implementation

**DatasetRepository:**
- Purpose: Abstract dataset metadata storage
- Examples: `backend/src/repositories/datasetRepository.ts` (file-backed with ID-based lookup)
- Pattern: Single instance per app, caches metadata in memory for perf

**NotebookRepository:**
- Purpose: Notebook CRUD and cell execution tracking
- Examples: `backend/src/repositories/notebook/notebookCrud.ts`, `cellExecution.ts`, `cellLocking.ts`
- Pattern: Segmented by concern; composed helper functions

**LLM Tools (MCP Contracts):**
- Purpose: Define structured tool schemas for LLM to invoke
- Examples: `backend/src/services/llm/tools.ts`, preprocessing tool handlers
- Pattern: Each tool has input schema (Zod), handler function, metadata

**PreprocessingTools:**
- Purpose: Modular, composable data cleaning and transformation steps
- Examples: `backend/src/services/llm/preprocessingTools/datasetTools.ts`, `transformationTools.ts`
- Pattern: Each tool returns `{ step, derivedDatasetId?, metadata }` for checkpoint/replay

**WebSocket Message Protocol:**
- Purpose: Type-safe real-time updates
- Examples: `backend/src/types/notebook.ts` defines `WSClientMessage`, `WSServerMessage`
- Pattern: Discriminated unions by event type (cell_execution_result, notebook_updated, etc.)

## Entry Points

**Backend:**
- Location: `backend/src/index.ts`
- Triggers: `npm run dev:backend` via tsx watch, or `npm run start` via Node
- Responsibilities:
  - Creates HTTP server and Express app
  - Initializes WebSocket server on `/ws/notebook`
  - Starts container manager (cleans orphaned containers)
  - Verifies Postgres connection (non-blocking)
  - Sets up graceful shutdown handlers for SIGTERM/SIGINT

**Frontend:**
- Location: `frontend/src/main.tsx` → `frontend/src/App.tsx`
- Triggers: `npm run dev:ui` via Vite, or compiled output via `vite build`
- Responsibilities:
  - Initializes React 19 app with theme provider (dark by default)
  - Sets up Router with protected routes (auth/login/signup/reset, /project/:id/:phase)
  - Bootstraps auth check via `useAuthBootstrap` hook
  - Pre-loads Monaco editor in background
  - Mounts Zustand stores and Sonner toast notifications

**Dev Orchestrator:**
- Location: `scripts/dev/run.mjs`
- Triggers: `npm run dev` from root
- Responsibilities:
  - Parses DATABASE_URL or creates Postgres Docker container on port 5433
  - Runs migrations via `npm run db:migrate`
  - Spawns backend and frontend dev servers concurrently
  - Waits for both servers to be ready before completion

## Error Handling

**Strategy:** Centralized error boundaries in React, middleware error handlers in Express, explicit validation everywhere.

**Patterns:**

**Frontend Error Boundaries:**
- `<ProtectedRoute>` catches auth failures, redirects to login
- `useProjectStore` errors set `.error` state, UI shows retry button
- API errors trigger toast notifications via Sonner
- Network failures handled in `lib/api/client.ts` with refresh token retry

**Backend Error Handling:**
- Express error middleware catches all throws and returns 500 JSON
- Route handlers use async/await; errors propagate to middleware
- Zod validation failure → 400 with error.flatten() details
- Database errors logged to console, 503 Service Unavailable if not configured
- WebSocket errors logged, client disconnections cleaned up automatically

**Service-Level Error Recovery:**
- LangGraph preprocessing: Checkpoints saved after each step, can resume from last checkpoint
- Container execution: Timeouts enforced per cell, errors captured and returned as output
- Token refresh: Automatic retry on 401 with refresh token before failing request

## Cross-Cutting Concerns

**Logging:**
- Backend: `console.log()` with `[module]` prefix (e.g., `[db]`, `[ws]`, `[server]`)
- Frontend: Minimal; errors logged to browser console
- MCP operations: Logged by LangGraph with event trace

**Validation:**
- Backend: Zod schemas on all POST/PUT/PATCH handlers
- Frontend: React Hook Form + Zod for form validation
- Notebook execution: Python code syntax checked via `pythonIntelligence` service before execution

**Authentication:**
- Mechanism: JWT access token + refresh token in httpOnly cookies
- Flow: `loginForm` → POST `/api/auth/login` → store tokens → wrap subsequent requests with auth header
- Expiry: Access token short-lived, refresh token long-lived; auto-refresh on 401
- Optional: Google OAuth via OIDC callback to `/auth/google/callback`

**Authorization:**
- Pattern: Project-scoped; all dataset/notebook operations scoped to projectId
- No role-based access control yet; single-user or implicit ownership model

**Rate Limiting:** Not implemented; relies on load balancer or reverse proxy

---

*Architecture analysis: 2026-03-13*
