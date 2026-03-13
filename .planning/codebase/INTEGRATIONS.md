# External Integrations

**Analysis Date:** 2026-03-13

## APIs & External Services

**LLM (Language Model):**
- OpenAI API - Multi-model support via configured endpoint
  - SDK/Client: `openai` 6.27.0
  - Implementation: `backend/src/services/llm/providers/openaiClient.ts`
  - Models: `gpt-5.4` (default), `gpt-5-mini` (NL2SQL)
  - Auth: `OPENAI_API_KEY` env var
  - Features:
    - Streaming text generation
    - Tool calling for structured outputs
    - Extended reasoning with `o1-style` models
    - Configurable timeouts: `LLM_TIMEOUT_MS`, `PREPROCESSING_LLM_TIMEOUT_MS`, `PREPROCESSING_THINKING_LLM_TIMEOUT_MS`

**ML Orchestration:**
- LangGraph - Multi-step workflow state machines
  - SDK/Client: `@langchain/langgraph` 1.2.0
  - Implementation: `backend/src/services/llm/` (preprocessing pipeline)
  - Used for: Preprocessing suggestions, model training workflows
  - Stateful execution with checkpointing

**Tool/Context Protocol:**
- Model Context Protocol (MCP) - Structured tool definitions
  - SDK/Client: `@modelcontextprotocol/sdk` 1.27.1
  - Implementation: `backend/src/services/llm/mcpToolRegistry.ts`
  - Defines: Available tools for LLM interactions (query execution, document search, feature engineering)

## Data Storage

**Databases:**

- **PostgreSQL 16+** - Metadata persistence
  - Connection: `DATABASE_URL` env var (standard `postgres://` URI)
  - Client: `pg` 8.16.3 (native Node.js driver)
  - Connection pooling: `PG_POOL_MIN=0`, `PG_POOL_MAX=10` (configurable)
  - SSL mode: `PGSSLMODE` (disable/require)
  - Query timeout: `SQL_STATEMENT_TIMEOUT_MS` (default 5000ms)
  - Tables (via migrations `backend/migrations/`):
    - `projects` - Project metadata
    - `datasets` - Dataset inventory
    - `documents` - Uploaded documents
    - `chunks` - Document chunks (RAG)
    - `embeddings` - Vector embeddings
    - `query_results` - Cached query results
    - `query_cache` - SQL result cache (TTL-based)
    - `users` - Authentication
    - `refresh_tokens` - JWT refresh token tracking
    - `password_reset_tokens` - Password reset flow
    - `notebooks` - Notebook documents
    - `cells_metadata` - Cell execution metadata

**File Storage:**
- Local filesystem only
  - Projects: `storage/projects.json` (JSON file-backed)
  - Datasets: `storage/datasets/files/` + `storage/datasets/metadata.json`
  - Models: `storage/models/artifacts/` + `storage/models/metadata.json`
  - Documents: `storage/documents/files/`
  - Workspaces: `storage/workspaces/` (Docker container mount points)

**Caching:**
- In-memory (application-level)
  - Query result cache: `QUERY_CACHE_TTL_MS` (default 300s), max 500 entries
  - Answer cache: `ANSWER_CACHE_TTL_MS` (default 120s)
  - No Redis or external cache service

## Authentication & Identity

**Auth Provider:**
- Custom JWT-based authentication
  - Implementation: `backend/src/routes/auth/` and `backend/src/services/authService.ts`
  - Password hashing: bcrypt (12 rounds default)
  - Token generation: jsonwebtoken

**Token Management:**
- Access tokens: `JWT_ACCESS_EXPIRES_IN` (default 15m)
- Refresh tokens: `JWT_REFRESH_EXPIRES_IN` (default 7d)
  - Stored in Postgres `refresh_tokens` table
  - Tracked per IP/user-agent
  - Support for revocation

**OAuth 2.0 (Google):**
- OAuth callback-based login
  - Implementation: `backend/src/routes/auth/oauthHandler.ts`
  - Endpoints:
    - `GET /api/auth/google` - Redirect to Google consent screen
    - `POST /api/auth/google/callback` - Exchange code for tokens
  - Configuration:
    - `GOOGLE_CLIENT_ID` - OAuth app ID
    - `GOOGLE_CLIENT_SECRET` - OAuth app secret
    - `GOOGLE_CALLBACK_URL` - Redirect URI (default `http://localhost:5173/auth/google/callback`)
  - Optional — gracefully disabled if not configured

**Password Reset:**
- Token-based flow
  - `password_reset_tokens` table with expiration
  - Email delivery via SMTP
  - Configurable reset link via `FRONTEND_URL`

## Monitoring & Observability

**Error Tracking:**
- None detected (not configured)

**Logs:**
- Console-based (`console.log`, `console.error`)
- HTTP request logging via morgan (`morgan` 1.10.0)
  - Dev mode: 'dev' format (brief)
  - Prod mode: 'combined' format (Apache format)
- No centralized logging service

**WebSocket Events:**
- Real-time event broadcasts for notebook execution
  - Implementation: `backend/src/services/websocket/wsServer.ts`
  - Endpoint: `ws://localhost:4000/ws/notebook`
  - Events: Cell execution updates, notebook changes
  - Heartbeat: `WS_HEARTBEAT_MS` (default 30s)
  - Reconnection: `WS_RECONNECT_MAX_ATTEMPTS` (default 5)

## CI/CD & Deployment

**Hosting:**
- Not configured in codebase (infrastructure-agnostic)
- Expected environments: Local development, Docker-based deployment

**CI Pipeline:**
- GitHub Actions (`.github/workflows/ci.yml`)
  - Triggers: push to main/feat/**, PRs
  - Services: Postgres 16 (test database)
  - Steps:
    - Build backend (tsc)
    - Run migrations
    - Seed test data
    - Start backend on port 4100
    - Run evaluation suite (Playwright)
    - Build frontend (vite build)

**Benchmarking:**
- Playwright E2E: `npm run benchmark` (headless)
- API load testing: `npm run benchmark:api` (autocannon)
- Evaluation: `npm run eval` (NL→SQL + RAG test suite)

## Environment Configuration

**Required env vars for full feature activation:**

*Authentication/Database:*
- `DATABASE_URL` - Postgres connection (required for auth, notebooks)
- `JWT_SECRET` - Access token signing key

*LLM:*
- `OPENAI_API_KEY` - OpenAI API key
- `OPENAI_DEFAULT_MODEL` - Model for general tasks (gpt-5.4)
- `OPENAI_NL2SQL_MODEL` - Model for NL→SQL (gpt-5-mini)

*Optional (graceful fallback if not set):*
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` - Email sending
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - OAuth login
- `OPENAI_BASE_URL` - Custom LLM endpoint

*Storage/Execution:*
- `DOCKER_IMAGE` - Python runtime image (default `automl-python-runtime:latest`)
- `EXECUTION_TIMEOUT_MS` - Max execution duration (default 30s)
- `EXECUTION_MAX_MEMORY_MB` - Memory limit (default 2048MB)

**Secrets location:**
- `.env` file (backend, frontend)
- Not committed to git (listed in `.gitignore`)
- Example files: `.env.example` for reference

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- Email callbacks (SMTP)
  - Password reset emails: `backend/src/services/emailService.ts`
  - Verification emails (prepared, not actively used)
  - Template: HTML-based with reset link

**OAuth Callbacks:**
- Google OAuth callback: POST `/api/auth/google/callback`
  - Receives authorization code, exchanges for tokens
  - Creates/updates user in database

## Docker & Container Integration

**Python Runtime:**
- Container image: Configured via `DOCKER_IMAGE` env var
- Management: `backend/src/services/containerManager.ts`
- Cleanup: Orphaned container removal on startup + periodic stale cleanup
- Resource limits:
  - Memory: `EXECUTION_MAX_MEMORY_MB` (configurable, 2048MB default)
  - CPU: `EXECUTION_MAX_CPU_PERCENT` (100% default)
  - tmpfs: `EXECUTION_TMPFS_MB` (1024MB default)
  - Timeout: `EXECUTION_TIMEOUT_MS` (30s default)
- Network: `EXECUTION_NETWORK` (bridge mode default)
- Workspace directory: `EXECUTION_WORKSPACE_DIR` (mounted from host)

## Data Parsing & File Handling

**File Upload Processing:**
- CSV: `csv-parse` 5.5.6
- Excel: `exceljs` 4.4.0
- PDF: `pdf-parse` 2.4.5
- Word (DOCX): `mammoth` 1.11.0
- Upload handling: `multer` 2.1.1 (max 300MB by default)

**Document Ingestion:**
- Chunking: `DOC_CHUNK_SIZE` (500 tokens default), `DOC_CHUNK_OVERLAP` (50 default)
- Search: `documentSearchService.ts` (simple keyword/semantic search)
- No vector database — embeddings stored in Postgres

---

*Integration audit: 2026-03-13*
