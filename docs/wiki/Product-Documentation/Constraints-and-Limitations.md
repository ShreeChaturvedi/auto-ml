# Constraints and Limitations

This page lists constraints a new team should understand before extending or deploying the product.

## Product Constraints

- The workflow is intentionally phase-based. New major surfaces should fit upload, explorer, preprocessing, feature engineering, training, experiments, or deployment unless the phase model is deliberately redesigned.
- LLM-generated actions are advisory until users approve or execute them. Avoid adding hidden automation that mutates data without a review path.
- Preprocessing, feature engineering, and training assume notebook/workbook context. Keep generated code visible and recoverable.
- Deployment currently targets trained tabular classification/regression models with a known feature schema.

## Data Constraints

- Dataset uploads are optimized for CSV, JSON, and XLSX files.
- Dataset uploads default to `300MB`; legacy `.xls` is rejected.
- CSV/JSON are parsed in memory; XLSX is stream-profiled and loaded into Postgres asynchronously, so it may be temporarily non-queryable.
- Dataset row paging defaults to `200` rows and caps at `1000`.
- Document upload is memory-backed and capped at `25MB`.
- Dataset profiling samples data for statistics and UI performance; do not assume every profile metric came from a full-table scan.
- SQL query execution is read-only SELECT/CTE only, rejects multiple statements and blocked application/system tables, appends a default `LIMIT 200`, caps returned rows at `1000`, and uses a `5000ms` statement timeout by default.
- Benchmark source data should not be stored under `backend/storage`.
- Prediction logs may contain feature values and should be treated as sensitive.

## Runtime Constraints

- Python execution and model serving require Docker.
- The default runtime network is `automl-sandbox`, an internal Docker network. It improves isolation but blocks outbound network access from runtime containers.
- Package installation inside runtime containers may fail without network access. Use `EXECUTION_NETWORK=bridge` only when intentionally allowing internet access.
- Resource limits are controlled by `EXECUTION_TIMEOUT_MS`, `EXECUTION_MAX_MEMORY_MB`, `EXECUTION_MAX_CPU_PERCENT`, and `EXECUTION_TMPFS_MB`.
- Docker permissions, image build failures, and host resource pressure are common local setup blockers.
- The isolated Docker network can fall back to `bridge` if creation fails; treat that as an operational hardening item before production.

## Database and Persistence Constraints

- Database-backed auth, notebooks, workflows, embeddings, deployments, and query cache require `DATABASE_URL`.
- Migrations must run before serving backend code that expects new tables/columns.
- File-backed artifacts and Postgres metadata must stay aligned; deleting files manually can orphan database rows.
- Local `npm run dev` manages a Postgres container, but production environments must provide durable Postgres and artifact storage.

## LLM Constraints

- LLM workflows require `OPENAI_API_KEY` or compatible provider configuration.
- One active workflow per project/phase is allowed; a run older than 10 minutes is considered stale.
- Workflow turns cap at 48 iterations, 10 calls per single tool, and 5 identical calls.
- Model latency, rate limits, token budgets, and provider outages affect preprocessing, feature engineering, training, and NL-to-SQL UX.
- LLM outputs need validation and user review; generated SQL/code should not be trusted without execution safeguards and approval gates.
- Timeouts are configured separately for general LLM, preprocessing, thinking, and NL-to-SQL flows.

## Model and Deployment Constraints

- Model comparison requires 2 to 5 models.
- Tuning allows 1 to 200 trials.
- Active deployments are capped at 5 per project.
- Prediction proxy traffic is rate-limited to 60 requests per minute per deployment.

## Security Constraints

- Production must not use local default `JWT_SECRET` or placeholder SMTP/LLM settings.
- Keep `.env`, uploaded data, generated model artifacts, and prediction logs out of public artifacts.
- All new data-bearing routes should apply auth and project/deployment ownership middleware.
- Protected API routes require Bearer JWT and verified email unless non-production `DEV_BYPASS_EMAIL_VERIFICATION=true` is intentionally enabled.
- Deployment prediction routes use API key auth and rate limiting; preserve those controls when extending serving behavior.

## CI/CD Constraints

- GitLab CI runs install, lint, build, and test jobs for code branches and merge requests.
- Landing Vercel deploy jobs require Vercel environment variables and are scoped by branch/rules.
- Heavy benchmark and eval commands are documented as local/manual verification and are not currently required in every pipeline job.

## Handoff Notes

- Align frontend phase names and backend workflow phase names explicitly before adding new phases.
- Keep API contracts close to route source so wiki/docs do not drift.
- Decide whether stale documented endpoints should be implemented or removed from repo docs during future maintenance.
- Review migration ownership/FK consistency when adding tables; newer and older tables use a mix of text IDs and UUID references.
- Keep Docker/network, database migrations, SMTP, OpenAI credentials, and persistent storage paths in the production readiness checklist.
