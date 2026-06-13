# Requirements

This page describes the current product requirements reflected by the implementation.

## Functional Requirements

| ID | Requirement | Current implementation |
| --- | --- | --- |
| FR-1 | Users can create and manage projects. | Project CRUD, active-project state, project colors/icons, ownership checks, and phase progress. |
| FR-2 | Users can upload datasets and associate them with projects. | CSV/JSON/XLSX upload, dataset metadata, file storage, table loading, sample/row endpoints, rename/delete/download support. |
| FR-3 | Users can upload domain documents. | Document upload, parsing, storage, download/delete, chunking, embedding, and search. |
| FR-4 | Users can explore data before modeling. | Data viewer, typed tables, EDA summaries, SQL editor, NL-to-SQL, query cache, query artifacts, document viewer/search. |
| FR-5 | Users can run LLM-assisted preprocessing. | Streaming workflow turns, preprocessing run snapshots, table compatibility checks, workbook state, approval/replay mechanics. |
| FR-6 | Users can generate and apply feature engineering pipelines. | Feature plan streaming, feature suggestions, feature run records, derived dataset creation, versioned feature workbooks. |
| FR-7 | Users can train models in an interactive runtime. | Notebook cells, Python completions/hover/signatures/diagnostics, Docker execution sessions, package management, model training endpoints. |
| FR-8 | Users can compare and interpret model results. | Evaluation fetch/retry, SHAP, error analysis, model comparison, NL experiment filters, generated insights, tuning. |
| FR-9 | Users can deploy selected models. | Deployment CRUD, readiness UI, serving container lifecycle, predict proxy, schema, logs, stats, API keys, drift, feedback. |
| FR-10 | Users can authenticate and own their resources. | Register/login/refresh/logout, profile, email verification, Google OAuth, active session management, project/deployment ownership middleware. |

## Non-Functional Requirements

| Area | Requirement |
| --- | --- |
| Security | JWT authentication, project ownership enforcement, deployment API keys, rate limiting on prediction routes, no committed secrets. |
| Runtime isolation | Python execution runs in Docker with configurable memory/CPU/tmpfs limits, non-default execution network, and isolated workspaces. |
| Reliability | Request timing/context middleware, route validation, bounded LLM timeouts, execution timeouts, notebook savepoints, recovery candidates. |
| Maintainability | TypeScript across frontend/backend, Zod schemas, typed API clients, modular routes/services/repositories, Vitest coverage. |
| Accessibility | shadcn/Radix primitives, keyboard-friendly controls, visible focus patterns, semantic design tokens, light/dark themes. |
| Observability | Health routes, deployment logs/stats, prediction logs, request logging, workflow run records, benchmark/evaluation reports. |
| Performance | Query limits/timeouts/cache, dataset sampling, lazy-loaded routes, streaming APIs for long-running LLM/workflow operations. |

## Out of Scope or Guarded Behavior

- Non-SELECT SQL statements are rejected in query execution.
- Deprecated preprocessing endpoints are retained only as guarded compatibility surfaces; current orchestration uses LLM/workflow streaming routes.
- Production deployment requires real secrets, SMTP configuration, database configuration, and appropriately hardened Docker/network settings.
