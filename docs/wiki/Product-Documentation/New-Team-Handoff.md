# New Team Handoff

This page is the first stop for a new engineering team taking over the project.

## First-Day Setup

1. Install prerequisites:
   - Node.js 22 LTS and npm 10+
   - Docker with the daemon running
   - Git with SSH access to the GitLab project
   - PostgreSQL 16+ only if not using the managed local container
   - `ffmpeg` only if rendering Remotion videos
2. Confirm local tooling:

   ```bash
   node -v
   npm -v
   docker info
   ```

3. Clone the repository and install dependencies:

   ```bash
   git clone git@gitlab.csi.miamioh.edu:2026-senior-design-projects/ai-augmented-automl-toolchain/ai-augmented-auto-ml-toolchain.git
   cd ai-augmented-auto-ml-toolchain
   npm run install:all
   ```

4. Start the managed local environment:

   ```bash
   npm run dev
   ```

5. Open:
   - frontend: `http://localhost:5173`
   - backend health: `http://localhost:4000/api/health`

## Recommended IDE Setup

Visual Studio Code is the easiest handoff target.

Recommended extensions:

- ESLint
- Prettier or equivalent formatting support
- Tailwind CSS IntelliSense
- TypeScript and JavaScript language features
- Docker
- GitLab Workflow
- Playwright Test for VS Code

Workspace notes:

- Open the repository root, not only `frontend/` or `backend/`.
- Use the workspace TypeScript versions installed in `frontend/node_modules` and `backend/node_modules`.
- Keep `backend/.env` and `frontend/.env.local` local-only.
- Use `npm run lint` from the root so backend, frontend, and video lint rules stay aligned.
- There is no committed `.vscode/` workspace config; use the repo configs in `backend/eslint.config.js`, `frontend/eslint.config.js`, `backend/tsconfig.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, and `frontend/tailwind.config.js`.

## Repository Orientation

| Path | What to inspect first |
| --- | --- |
| `README.md` | Product overview, workflow, root commands, and screenshots. |
| `frontend/src/App.tsx` | Route structure and auth boundaries. |
| `frontend/src/pages/ProjectWorkspace.tsx` | Phase rendering and phase guards. |
| `frontend/src/types/phase.ts` | Canonical workflow phases. |
| `frontend/src/lib/api/` | Typed frontend API clients. |
| `frontend/src/stores/` | Zustand state and persistence. |
| `backend/src/app.ts` | Express middleware and router mounting. |
| `backend/src/routes/` | HTTP API surface. |
| `backend/src/services/` | Domain behavior and workflow logic. |
| `backend/src/repositories/` | Persistence abstractions. |
| `backend/migrations/` | Postgres schema history. |
| `testing/` | Playwright benchmark and eval runners. |
| `.gitlab-ci.yml` | GitLab CI pipeline. |

## Build and Verification Checklist

Run this before handing work to another developer:

```bash
npm run build
npm run test
npm run lint
```

For changes touching workflow, query, upload, deployment, or model behavior, add the relevant checks:

```bash
npm run benchmark
npm run eval
npm run benchmark:api
```

## Common Development Tasks

| Task | Where to start |
| --- | --- |
| Add a backend endpoint | `backend/src/routes`, then add service/repository tests. |
| Add a frontend API call | `frontend/src/lib/api`, then consume it from a store or component. |
| Add a workflow tool | `backend/src/services/llm/tools` and related workflow phase code. |
| Change a workflow phase | `frontend/src/types/phase.ts`, `ProjectWorkspace`, `WorkflowPhaseTree`, and project store tests. |
| Add persistence | create a migration in `backend/migrations`, then update repositories and tests. |
| Change notebook behavior | backend notebook routes/services plus `frontend/src/stores/notebookStore.ts`. |
| Change deployment behavior | `backend/src/routes/deployments.ts`, deployment services, frontend deployment components, and WebSocket client/store code. |

## Troubleshooting

| Symptom | First checks |
| --- | --- |
| Frontend cannot reach backend | Confirm backend is on `:4000`, `VITE_API_BASE` is correct, and `ALLOWED_ORIGINS` includes the frontend URL. |
| Auth routes return unavailable | Confirm `DATABASE_URL` is configured and migrations ran. |
| Docker execution fails | Confirm Docker daemon is running, runtime image can build, and `EXECUTION_NETWORK` exists. |
| Package install fails in runtime | Check whether `EXECUTION_NETWORK=automl-sandbox` blocks outbound network access. Use `bridge` only when intentionally allowing runtime internet access. |
| Query routes fail | Confirm Postgres is running, datasets loaded correctly, and SQL is read-only SELECT/CTE. |
| LLM workflows fail or hang | Confirm `OPENAI_API_KEY`, model settings, and timeout variables are configured. |
| Playwright benchmark fails before tests | Run `npm --prefix testing run benchmark:prepare` and confirm browser dependencies install. |

Recommended frontend env during handoff:

```bash
VITE_API_BASE=http://localhost:4000/api
VITE_API_BASE_URL=http://localhost:4000/api
```

## Handoff Checklist

- The wiki is current and linked from the GitLab project.
- `.gitlab-ci.yml` reflects the intended quality gates.
- Root `README.md` and wiki setup commands match.
- Required environment variables are documented.
- Open issues are current and stale/duplicate issues are closed.
- Known product constraints are listed in [Constraints and Limitations](Constraints-and-Limitations).
- A new developer can run `npm run dev`, sign in, upload a dataset, and move through the workflow.
