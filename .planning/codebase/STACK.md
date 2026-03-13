# Technology Stack

**Analysis Date:** 2026-03-13

## Languages

**Primary:**
- TypeScript 5.6+ - Entire backend and frontend codebase
- JavaScript (ES modules) - Node.js runtime, build scripts

**Secondary:**
- Python - Runtime code executed in Docker containers
- SQL - Postgres queries and migrations
- HTML/CSS - UI templates and styling

## Runtime

**Environment:**
- Node.js 22.0.0+ (backend requirement via `engines` in `package.json`)
- Docker - For sandboxed Python code execution and Postgres container

**Package Manager:**
- npm 10+ (inferred from workspace setup)
- Lockfile: `package-lock.json` (present in repo)

## Frameworks

**Backend:**
- Express 5.2.1 - HTTP API server
- LangGraph 1.2.0 - Multi-step workflow orchestration (preprocessing, training)
- Model Context Protocol (MCP) SDK 1.27.1 - Structured tool contracts for LLM interactions
- WebSocket (ws 8.18.0) - Real-time notebook cell execution updates

**Frontend:**
- React 19.1.1 - UI framework
- React Router 7.13.1 - Phase-based routing (`/project/:id/:phase`)
- Vite 7.3.1 - Build tool and dev server (port 5173)
- Zustand 5.0.8 - State management with persistence

**Testing:**
- Vitest 4.0.18 - Unit/integration test runner (backend and frontend)
- Supertest 7.0.0 - HTTP assertion library (backend)
- @testing-library/react 16.3.1 - Component testing utilities
- Playwright - E2E benchmarking via `testing/` workspace

**Build/Dev:**
- TypeScript (tsc) - Compilation
- ESLint 9.36.0 - Code linting
- Prettier - Code formatting (via eslint-config-prettier)
- tsx 4.19.0 - TypeScript execution for scripts and watch mode

## Key Dependencies

**Critical:**

- **openai 6.27.0** - LLM client for OpenAI API (gpt-5.4, gpt-5-mini)
  - Streaming responses
  - Tool calling for structured outputs
  - Reasoning effort configuration
- **pg 8.16.3** - PostgreSQL driver
  - Connection pooling
  - Query caching
  - Transaction management
- **bcrypt 6.0.0** - Password hashing for authentication
- **jsonwebtoken 9.0.3** - JWT token generation and verification
- **nodemailer 7.0.11** - SMTP email sending (password reset, verification)

**Infrastructure:**

- **docker** (via execDocker utility) - Python code execution isolation
  - Memory limits (2048MB default)
  - CPU percentage limits (100% default)
  - tmpfs (1024MB default)
  - Timeout enforcement (30s default)
- **csv-parse 5.5.6** - CSV file parsing
- **exceljs 4.4.0** - Excel file reading/writing
- **pdf-parse 2.4.5** - PDF content extraction
- **mammoth 1.11.0** - DOCX file parsing
- **multer 2.1.1** - File upload handling

**UI Components:**

- **@radix-ui/** (14 packages) - Accessible component primitives
  - Dialog, dropdown, select, checkbox, slider, tabs, tooltips, etc.
- **shadcn/ui** - Built on Radix UI with Tailwind CSS
- **@dnd-kit/** (4 packages) - Drag-and-drop functionality
- **@tanstack/react-table 8.21.3** - Data table rendering
- **@tanstack/react-virtual 3.13.19** - Virtual scrolling
- **recharts 3.5.1** - Charts and visualizations
- **plotly.js-dist-min 3.4.0** - Advanced plotting
- **react-markdown 10.1.0** - Markdown rendering with plugins (KaTeX, Mermaid)
- **monaco-editor 4.7.0** - Code editor for notebooks
- **lucide-react 0.544.0** - Icon library
- **sonner 2.0.7** - Toast notifications

**Data & Parsing:**

- **zod 3.23.8 (backend), 4.1.11 (frontend)** - Runtime type validation
- **date-fns 4.1.0** - Date utilities
- **papaparse 5.5.3** - CSV parsing (client-side)
- **react-markdown + streamdown** - LLM streaming response rendering

## Configuration

**Environment:**

Backend environment vars (`.env.example`):
- `PORT` - Server port (default 4000)
- `DATABASE_URL` - Postgres connection string (required for auth)
- `OPENAI_API_KEY` - OpenAI API key (required for LLM)
- `OPENAI_BASE_URL` - Custom OpenAI endpoint
- `DOCKER_IMAGE` - Python runtime image (default `automl-python-runtime:latest`)
- `JWT_SECRET` - Signing key for access tokens
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` - Email configuration
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - OAuth flow

Frontend environment vars (`.env.example`):
- `VITE_API_BASE` - Backend API endpoint (default `http://localhost:4000/api`)

**Build:**

Backend (`backend/tsconfig.json`):
- Target: ES2022
- Module: ESNext
- CommonJS outputs disabled (ES modules only)

Frontend (`frontend/tsconfig.json`):
- Target: ES2022
- JSX: react-jsx
- Path alias: `@/` → `src/`

**Storage:**

File-backed persistence:
- `storage/projects.json` - Project metadata
- `storage/datasets/metadata.json` - Dataset inventory
- `storage/models/metadata.json` - Trained model registry
- `storage/documents/files/` - Uploaded document files
- `storage/workspaces/` - Docker container working directories

## Platform Requirements

**Development:**

- Node.js 22.0.0+
- Docker (for Python runtime and Postgres)
- Postgres 16+ (or Docker container)
- npm 10+

**Production:**

- Node.js 22.0.0+
- Docker (for Python code execution)
- Postgres 16+
- OpenAI API key
- (Optional) SMTP server for email

---

*Stack analysis: 2026-03-13*
