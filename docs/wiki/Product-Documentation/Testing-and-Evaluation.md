# Testing and Evaluation

Last repo inspection for this page: May 11, 2026.

## Test Layers

| Layer | Location | Command |
| --- | --- | --- |
| Backend unit/integration | `backend/src/**/*.test.ts` | `npm --prefix backend test` or `npm run test` |
| Frontend unit/component/store | `frontend/src/**/*.test.tsx?` | `npm --prefix frontend test` or `npm run test` |
| Root lint gate | backend, frontend, video | `npm run lint` |
| Build gate | backend TypeScript + frontend Vite | `npm run build` |
| Playwright benchmark flows | `testing/tests/*.spec.ts` | `npm run benchmark` |
| NL-to-SQL/RAG evals | `testing/tests/evalRunner.ts` | `npm run eval` |
| API load benchmark | `backend/src/scripts/benchmarkApi.ts` | `npm run benchmark:api` |
| Security/dependency audit | root script | `npm run audit` |

## GitLab CI Pipeline

`.gitlab-ci.yml` uses `node:22-slim` and runs on merge requests, branches, and tags.

| Stage | Job | What it does |
| --- | --- | --- |
| `install` | `install` | Runs `npm run install:all` and caches workspace dependencies. |
| `check` | `lint` | Ensures backend, frontend, and video ESLint dependencies exist, then runs `npm run lint`. |
| `build` | `build` | Ensures backend/frontend build dependencies exist, then runs `npm run build`. |
| `test` | `test` | Ensures Vitest dependencies exist, then runs `npm run test`. |
| `build` | `landing:build` | Runs landing typecheck, build, tests, and lint; publishes `landing/dist/` for one week. |
| `deploy` | `landing:vercel:preview` | Deploys landing previews with Vercel when Vercel variables are configured; allowed to fail. |
| `deploy` | `landing:vercel:production` | Deploys/aliases landing production from the configured landing production branch. |

Required CI variables for landing deploy jobs:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Current CI gaps:

- Playwright benchmarks are manual.
- NL-to-SQL/RAG evals are manual.
- API load benchmarks are manual.
- `npm run audit` is manual.
- Backend/frontend coverage commands exist but are not CI gates.

## Benchmark Assets

Benchmark data control files live under `testing/benchmarks`:

- `catalog/`: tracked schemas and manifest files.
- `acquisition/`: dataset-specific staging/provenance playbooks.
- `data/`: staged benchmark bytes and derived repo-native data.
- `runs/`: ignored run artifacts written by benchmark executions.

Rules:

- Do not store benchmark source-of-truth data under `backend/storage/`.
- Do not put benchmark catalog files into `testing/fixtures/`.
- Keep public staged dataset bytes out of git.
- Repo-native derived and poisoned benchmark data may be committed when modest in size and required for reproducibility.

## Evaluation Focus

The evaluation suite targets capabilities where unit tests alone are not enough:

- NL-to-SQL generation and repair behavior;
- RAG/document retrieval quality;
- upload/explorer navigation regressions;
- benchmark dataset readiness and validation;
- API behavior under load.

## Quality Gate Before Merge

For product changes, run at least:

```bash
npm run build
npm run test
npm run lint
```

For workflow, query, upload, or deployment changes, also run the relevant benchmark/eval command:

```bash
npm run benchmark
npm run eval
npm run benchmark:api
```

When reporting verification in a merge request or handoff note, include exact commands, pass/fail result, local/CI environment, relevant env vars, and any skipped checks with reasons.

## Writing Strong Tests

- Cover real user failure modes, not just happy paths.
- Test stream parsers and state reducers with malformed/partial events.
- Use route/service tests for ownership, validation, and error responses.
- Test store behavior for phase transitions, persistence, and reconnect logic.
- Keep benchmark fixtures documented and reproducible.

## Reporting

Store durable benchmark/evaluation summaries in repo docs or the wiki when results are part of project evidence. Runtime output and large benchmark bytes should remain ignored artifacts unless the data is intentionally curated and small.
