# Codebase Structure

**Analysis Date:** 2026-03-13

## Directory Layout

```
[project-root]/
├── backend/                    # Express API server (TypeScript)
│   ├── src/
│   │   ├── index.ts            # Entry point; HTTP + WebSocket server initialization
│   │   ├── app.ts              # Express app factory with all route registration
│   │   ├── config.ts            # Environment variable parsing (Zod)
│   │   ├── db.ts                # Postgres connection pool management
│   │   ├── middleware/          # Express middleware (auth, error handlers)
│   │   ├── routes/              # HTTP endpoint handlers
│   │   ├── services/            # Domain logic (preprocessing, training, execution)
│   │   ├── repositories/        # Data access abstraction (file/Postgres backends)
│   │   ├── types/               # TypeScript type definitions (dataset, notebook, etc.)
│   │   ├── utils/               # Shared utilities (type coercion, hashing)
│   │   ├── scripts/             # One-off scripts (migrations, benchmarks)
│   │   └── tests/               # Test setup and fixtures
│   ├── docker/                  # Docker configuration
│   │   ├── Dockerfile.python-runtime   # Python sandbox image (numpy, pandas, scikit-learn)
│   │   └── build-runtime.sh     # Build script for Python image
│   ├── migrations/              # Postgres schema migrations (001–006)
│   ├── storage/                 # Runtime directory for file-backed data
│   ├── build/                   # Compiled TypeScript output
│   ├── package.json             # Backend dependencies
│   └── tsconfig.json            # TypeScript config
│
├── frontend/                    # React SPA (Vite, TypeScript)
│   ├── src/
│   │   ├── main.tsx             # React DOM render entry point
│   │   ├── App.tsx              # Root component with Router
│   │   ├── pages/               # Page components (HomePage, ProjectWorkspace)
│   │   ├── components/          # Feature-organized components
│   │   │   ├── auth/            # Login, signup, auth flows
│   │   │   ├── layout/          # AppShell, header, sidebar
│   │   │   ├── upload/          # Dataset upload UI
│   │   │   ├── data/            # Data viewer, preview
│   │   │   ├── preprocessing/   # Preprocessing timeline and controls
│   │   │   ├── features/        # Feature engineering UI
│   │   │   ├── training/        # Model training panel
│   │   │   ├── experiments/     # Experiment results view
│   │   │   ├── notebook/        # Notebook editor and cell execution UI
│   │   │   ├── chat/            # Chat input, agentic assistant
│   │   │   ├── llm/             # LLM-specific UI components
│   │   │   ├── docs/            # Documentation pages
│   │   │   └── ui/              # shadcn/ui components (button, dialog, etc.)
│   │   ├── stores/              # Zustand state management
│   │   │   ├── projectStore.ts       # Projects CRUD, phase tracking
│   │   │   ├── dataStore.ts          # Active dataset state
│   │   │   ├── authStore.ts          # JWT tokens, user session
│   │   │   ├── preprocessingStore.ts # Preprocessing run state, timeline
│   │   │   ├── featureStore.ts       # Generated features, versioning
│   │   │   ├── executionStore.ts     # Code execution history
│   │   │   ├── notebookStore.ts      # Notebook references
│   │   │   └── data/                 # Domain-specific store slices
│   │   ├── hooks/               # Custom React hooks
│   │   ├── lib/                 # Utilities and helpers
│   │   │   ├── api/             # Typed API client modules (projects.ts, datasets.ts, etc.)
│   │   │   ├── auth/            # Auth token management
│   │   │   ├── monaco/          # Monaco editor preloading
│   │   │   ├── websocket/       # WebSocket client
│   │   │   ├── llm/             # LLM streaming utilities
│   │   │   └── nlQuery/         # Natural language query helpers
│   │   ├── types/               # TypeScript types (Phase, Project, Dataset, etc.)
│   │   ├── assets/              # Static images, fonts
│   │   └── index.css            # Tailwind + global styles
│   ├── public/                  # Static HTML, favicon
│   ├── dist/                    # Vite build output
│   ├── package.json             # Frontend dependencies
│   ├── vite.config.ts           # Vite configuration
│   └── tsconfig.json            # TypeScript config
│
├── testing/                     # E2E and evaluation suite (Playwright)
│   ├── tests/                   # Playwright E2E tests
│   ├── fixtures/                # Test data and fixtures
│   └── package.json
│
├── migrations/                  # Postgres schema migrations (symlink or copy)
├── docs/                        # Documentation
│   ├── design-system.md         # UI design tokens, typography, layout
│   ├── api-contracts.md         # Request/response schemas
│   └── branding/                # Logo, color palette
│
├── scripts/
│   └── dev/run.mjs              # Development orchestrator (Docker Postgres + migrations + servers)
│
├── package.json                 # Root workspace definition
├── CLAUDE.md                    # Project instructions for Claude
├── ARCHITECTURE.md              # System design documentation
├── README.md                    # Project overview
└── .planning/codebase/          # Planning and analysis documents
    ├── ARCHITECTURE.md          # Generated architecture analysis
    └── STRUCTURE.md             # Generated structure analysis
```

## Directory Purposes

**`backend/src/`:**
- Purpose: All Express API server code
- Contains: Route handlers, services, repositories, middleware, types
- Key files: `index.ts` (server startup), `app.ts` (Express factory), `config.ts` (environment variables)

**`backend/src/routes/`:**
- Purpose: HTTP endpoint handlers organized by domain
- Contains: POST/GET handlers, request validation (Zod), response serialization
- Key routes:
  - `projects.ts`: Project CRUD endpoints
  - `datasets.ts`: Dataset upload and metadata endpoints
  - `query.ts`: SQL/data querying endpoints
  - `answer.ts`: Natural language question answering
  - `preprocessing.ts`: Start/resume preprocessing workflows
  - `llm/`: LLM agentic endpoints (preprocessing, features, training, catalog)
  - `notebooks.ts`: Notebook CRUD, cell execution
  - `execution.ts`: Python code execution endpoint

**`backend/src/services/`:**
- Purpose: Domain logic, orchestration, external service integration
- Contains: LangGraph workflows, tool implementations, model training, notebook execution
- Key subdirectories:
  - `llm/`: OpenAI client, MCP tool registry, LangGraph preprocessing graph
  - `notebook/`: Cell execution (containers), output storage, locking logic
  - `container/`: Docker image management, container lifecycle
  - `dataLoading/`: File parsing, schema inference, data insertion
  - `featureEngineering/`: Code generation for feature synthesis
  - `nlToSql/`: NL→SQL conversion service
  - `eda/`: Exploratory data analysis (profiling, statistics)
  - `packageManager/`: pip package management inside containers
  - `websocket/`: WebSocket server and broadcasting

**`backend/src/repositories/`:**
- Purpose: Data access abstraction with pluggable backends
- Contains: CRUD operations, file/Postgres implementations
- Key modules:
  - `projectRepository.ts`: Projects (supports file/memory/Postgres)
  - `datasetRepository.ts`: Dataset metadata (file-backed)
  - `notebookRepository.ts`: Notebooks and cells (Postgres)
  - `preprocessingRunRepository.ts`: Preprocessing run state (file-backed)
  - `userRepository.ts`: User accounts (Postgres)
  - `modelRepository.ts`: Model training metadata (Postgres)

**`backend/src/middleware/`:**
- Purpose: Express middleware for cross-cutting concerns
- Contains: JWT auth verification, error handling, request logging

**`backend/src/types/`:**
- Purpose: Shared TypeScript type definitions
- Contains: Request/response types, domain models
- Key files:
  - `dataset.ts`: Dataset profile schema, column types
  - `notebook.ts`: Notebook, cell, execution result types
  - `llm.ts`: LLM message, tool call, provider types
  - `project.ts`: Project, phase, metadata types

**`backend/docker/`:**
- Purpose: Docker configuration for sandboxed Python execution
- Contains: Dockerfile, build scripts
- Dockerfile.python-runtime: Python 3.11 base with numpy, pandas, scikit-learn, Jupyter Kernel Gateway

**`backend/migrations/`:**
- Purpose: Postgres schema versioning (one file per migration)
- Contains: SQL scripts for table creation, index, constraint management
- Migration format: `001-init.sql`, `002-add-embeddings.sql`, etc.

**`frontend/src/pages/`:**
- Purpose: Top-level page components (entire screen)
- Contains: `HomePage.tsx` (project list), `ProjectWorkspace.tsx` (phase content router)

**`frontend/src/components/`:**
- Purpose: Reusable UI components organized by feature domain
- Contains: React components with JSX, styling via Tailwind
- Key domains:
  - `auth/`: LoginForm, SignupForm, ProtectedRoute, ProfileSettings
  - `layout/`: AppShell (header, sidebar, content area)
  - `upload/`: UploadArea (drag-drop file upload)
  - `data/`: DataViewerTab (table display, column stats)
  - `preprocessing/`: PreprocessingPanel (timeline, status)
  - `features/`: FeatureEngineeringPanel (feature list, add UI)
  - `training/`: TrainingPanel (model selection, training)
  - `notebook/`: NotebookEditor, CellRow, CellOutput
  - `ui/`: Shadcn/Radix primitives (Button, Dialog, Tabs, etc.)

**`frontend/src/stores/`:**
- Purpose: Zustand state management with persistence
- Contains: Store definitions with actions, getters, localStorage persistence
- Key stores:
  - `projectStore.ts`: Active project, phases, CRUD actions
  - `dataStore.ts`: Dataset metadata for current project
  - `authStore.ts`: JWT tokens, login/logout, user profile
  - `preprocessingStore.ts`: Preprocessing run state, timeline steps, checkpoints
  - `featureStore.ts`: Generated features with versions and rollback

**`frontend/src/lib/api/`:**
- Purpose: Typed HTTP client wrappers per domain
- Contains: Fetch wrappers with request/response types
- Key modules:
  - `client.ts`: Base client with token refresh, error handling
  - `projects.ts`: Project CRUD operations
  - `datasets.ts`: Dataset upload, list, delete
  - `notebooks.ts`: Notebook CRUD, cell execution
  - `llm.ts`: LLM agentic endpoints
  - `execution.ts`: Code execution
  - `query.ts`: Data querying

**`frontend/src/lib/websocket/`:**
- Purpose: WebSocket client for real-time updates
- Contains: Connection management, subscription handlers, message dispatching

**`frontend/src/types/`:**
- Purpose: Frontend-specific TypeScript types
- Contains: Domain model types, API response types
- Key files:
  - `project.ts`: Project interface, phase enum
  - `phase.ts`: Phase enum (upload, explore, preprocessing, features, training, experiments)
  - `notebook.ts`: Notebook, cell types
  - `preprocessing.ts`: Preprocessing run, step, timeline types
  - `feature.ts`: Feature definition, version types
  - `llmUi.ts`: LLM UI contract types (tool cards, results overlay)

**`testing/`:**
- Purpose: End-to-end testing with Playwright
- Contains: Automated browser tests, test fixtures, evaluation suite
- Key files: E2E test scripts, test data loaders

**`docs/`:**
- Purpose: Design documentation and API contracts
- Contains: Design system tokens, color palette, API schemas
- Key files:
  - `design-system.md`: Typography, spacing, colors, components
  - `api-contracts.md`: Request/response examples

## Key File Locations

**Entry Points:**
- `backend/src/index.ts`: Backend HTTP + WebSocket server startup
- `frontend/src/main.tsx`: React DOM render entry point
- `frontend/src/App.tsx`: Root Router configuration
- `scripts/dev/run.mjs`: Development orchestrator

**Configuration:**
- `backend/src/config.ts`: Environment variable schema and defaults
- `backend/tsconfig.json`: TypeScript compiler settings
- `frontend/vite.config.ts`: Vite bundler config
- `frontend/tsconfig.json`: Frontend TypeScript config
- `migrations/`: Postgres schema setup

**Core Logic:**
- `backend/src/app.ts`: Express app factory with all router registration
- `backend/src/services/llm/preprocessingGraph.ts`: LangGraph preprocessing orchestration
- `backend/src/services/notebook/cellExecutionService.ts`: Container-based cell execution
- `frontend/src/stores/projectStore.ts`: Central project state, phase tracking
- `frontend/src/pages/ProjectWorkspace.tsx`: Phase router, renders phase-specific UI

**Testing:**
- `backend/src/__tests__`: Backend unit tests (co-located)
- `frontend/src/**/__tests__`: Frontend unit tests (co-located)
- `testing/tests/`: E2E Playwright tests

## Naming Conventions

**Files:**
- Services: camelCase (e.g., `documentSearchService.ts`, `answerService.ts`)
- Repositories: camelCase with `Repository` suffix (e.g., `projectRepository.ts`, `notebookRepository.ts`)
- Routes: camelCase (e.g., `preprocessing.ts`, `answer.ts`)
- Components: PascalCase (e.g., `UploadArea.tsx`, `PreprocessingPanel.tsx`)
- Stores: camelCase with `Store` suffix (e.g., `projectStore.ts`, `preprocessingStore.ts`)
- Types: Exact as exported (e.g., `dataset.ts`, `notebook.ts`)
- Tests: `.test.ts` or `.spec.ts` suffix (same directory as source)

**Directories:**
- Feature domains: lowercase (e.g., `preprocessing/`, `features/`, `notebook/`)
- Utility directories: lowercase (`utils/`, `lib/`, `types/`)
- Compose-related logic: subdirectories by concern (e.g., `services/llm/preprocessingTools/`, `services/container/`)

## Where to Add New Code

**New Feature (Multi-Phase):**
- Primary code: Add route in `backend/src/routes/` + service in `backend/src/services/`
- Frontend: Add component in `frontend/src/components/[feature]/`
- State: Create store file in `frontend/src/stores/[feature]/`
- API client: Add module in `frontend/src/lib/api/[feature].ts`
- Tests: Co-locate `.test.ts` in same directory

**New Component/UI:**
- Implementation: `frontend/src/components/[domain]/ComponentName.tsx`
- Styles: Inline Tailwind classes or extracted to separate `.css` if complex
- Tests: `frontend/src/components/[domain]/ComponentName.test.tsx`

**Utilities/Helpers:**
- Backend shared: `backend/src/utils/[category].ts`
- Frontend shared: `frontend/src/lib/[category]/helpers.ts`
- Domain-specific: `backend/src/services/[domain]/helpers.ts`

**Types/Interfaces:**
- Backend domain types: `backend/src/types/[domain].ts`
- Frontend domain types: `frontend/src/types/[domain].ts`
- Shared (if needed): Define in both, may differ slightly per layer

**Database-Related:**
- Migrations: Add new file in `migrations/` (e.g., `007-add-feature.sql`)
- Repository logic: New method in `backend/src/repositories/[domain].ts`
- Schema types: Update `backend/src/types/[domain].ts`

## Special Directories

**`backend/storage/`:**
- Purpose: Runtime directory for file-backed data
- Generated: Yes (created by container init if missing)
- Committed: No (in .gitignore)
- Contains: projects.json, dataset metadata, preprocessing run state

**`frontend/dist/`:**
- Purpose: Vite production build output
- Generated: Yes (by `npm run build`)
- Committed: No (in .gitignore)

**`backend/build/`:**
- Purpose: TypeScript compilation output
- Generated: Yes (by `tsc`)
- Committed: No (in .gitignore)

**`.planning/codebase/`:**
- Purpose: GSD analysis and planning documents
- Generated: Yes (by codebase mapper)
- Committed: Yes (tracked for reference)

**`migrations/`:**
- Purpose: Postgres schema management (idempotent SQL scripts)
- Generated: No (hand-written)
- Committed: Yes
- Pattern: Numbered sequence (001–006 as of now), run in order via `npm run db:migrate`

---

*Structure analysis: 2026-03-13*
