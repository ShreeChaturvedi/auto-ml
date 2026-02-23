# Repository Guidelines

## Project Structure & Module Organization
- `backend/`: Express + TypeScript API. Key folders: `src/` (routes, services, repositories, utils), `migrations/` (SQL migrations), `storage/` (local data/cache), `tsconfig.json`, `vitest.config.ts`.
- `frontend/`: Vite + React UI in `src/` (components, hooks, stores, types, lib). Static assets live in `src/assets/`.
- `testing/`: Playwright benchmark suite with fixtures and helpers. Uses compiled backend/frontend artifacts.
- Docs live in `README.md`, `ARCHITECTURE.md`, and `docs/`. Attachments and proposals are reference only.

## Build, Test, and Development Commands
- Install workspace deps once: `npm --prefix backend install && npm --prefix frontend install && npm --prefix testing install`.
- Backend dev server (watch mode): `npm --prefix backend run dev`; production build/start: `npm --prefix backend run build` then `npm --prefix backend start`.
- Frontend dev with backend watcher: `npm --prefix frontend run dev`; UI-only: `npm --prefix frontend run dev:ui`; production build: `npm --prefix frontend run build`; preview built assets: `npm --prefix frontend run preview`.
- Lint: `npm --prefix backend run lint` and `npm --prefix frontend run lint`.
- Database migrations: set `DATABASE_URL` then `npm --prefix backend run db:migrate`.
- End-to-end benchmark: from repo root `npm run benchmark` (headless) or `npm run benchmark:headed`. Eval runner: `npm run eval`.

## Coding Style & Naming Conventions
- TypeScript + ESM modules; prefer 2-space indentation and `const` over `let` unless reassignment is needed.
- Keep API logic in services/repositories; keep routes thin and validate inputs with zod schemas.
- React components use PascalCase filenames (`components/FeaturePanel.tsx`); hooks in `hooks/` start with `use*`; Zustand stores in `stores/` mirror feature names.
- Use ESLint (configured per workspace). Align with existing patterns: small functions, early returns, and descriptive variable names in lowerCamelCase.

## Testing Guidelines
- E2E: Playwright specs live in `testing/tests/`; add fixtures under `testing/fixtures/`. Run via `npm run benchmark` or `npm run benchmark:headed` when debugging UI flows.
- Backend unit/integration: use Vitest (`backend/vitest.config.ts`). Create `*.test.ts` beside code or under `backend/src/tests/`, and run with `npx vitest` from `backend/`.
- Keep tests hermetic (seed data locally, avoid external calls). Update assertions when schema or contract changes and document new fixtures.

## Commit & Pull Request Guidelines
- Follow the existing conventional-style prefixes (`feat:`, `fix:`, `docs:`, `test:`, `chore:`). Use imperative mood and keep the subject under ~72 chars.
- PRs should include: brief summary, linked issue/task ID, migration or config notes, and UI screenshots/GIFs for visual changes. Note any Playwright or database impacts.
- Before opening a PR, run lint, build both workspaces, and the Playwright benchmark when relevant. Mention skipped checks with rationale.

## Security & Configuration Tips
- Do not commit `.env` values or database credentials. Base configs live in `backend/src/config.ts` and `backend/.env.example`.
- Ensure `DATABASE_URL` points to the intended Postgres instance; clean up temporary containers after local runs.
- Uploaded datasets and generated artifacts stay under `backend/storage/`; avoid adding large binaries to Git.***
