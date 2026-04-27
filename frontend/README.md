# AI-Augmented AutoML Toolchain – Frontend

Production-grade React UI for the AutoML platform. Built with TypeScript, Tailwind, shadcn/ui, and Zustand. The UI is phase-based: upload → explore → preprocess → feature engineering → training.

## Quick Start

```bash
npm install
cp .env.example .env.local   # optional
npm run dev                  # frontend + backend watcher
npm run dev:ui               # frontend only
npm run build
npm run preview
```

## Current Capabilities

- Project creation + phase navigation (sidebar + breadcrumbs)
- Dataset upload UI with drag/drop
- Data Explorer with Monaco SQL editor, query execution, and EDA panels
- Preprocessing suggestions panel (powered by backend heuristics)
- Feature engineering UI with backend apply flow for derived datasets
- Training UI with code cells (Pyodide + cloud runtime)
- RAG Q&A via `/api/answer` (snippet-based, no LLM generation)

## Not Yet Wired / Partial

- English query mode is placeholder (NL→SQL stub)
- Auth routes and screens are wired; end-to-end validation still requires backend auth config
- DuckDB client exists but is not used (backend Postgres is active)

## Tech Stack

- React 19, TypeScript 5.8
- Vite 7
- Tailwind CSS 3.4
- shadcn/ui + Radix UI
- Zustand
- TanStack Table
- Monaco Editor

## Notes

The app defaults to `http://localhost:4000/api` for local development.

For deployed builds, set both frontend API env vars to the same public backend origin:

```bash
VITE_API_BASE=https://your-backend.duckdns.org/api
VITE_API_BASE_URL=https://your-backend.duckdns.org/api
```

`VITE_API_BASE` is the preferred key. `VITE_API_BASE_URL` remains supported for older codepaths and should be kept in sync during the beta.

The repo now includes [frontend/vercel.json](/Users/ayush/Documents/Projects/ai-augmented-auto-ml-toolchain/frontend/vercel.json) so Vercel rewrites SPA deep links to `index.html` when this package is deployed as its own frontend project.
