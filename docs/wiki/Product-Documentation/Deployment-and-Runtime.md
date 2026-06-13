# Deployment and Runtime

## Runtime Services

A full environment includes:

- React frontend served from a static/Vite-compatible host;
- Express backend under `/api`;
- PostgreSQL 16 with required migrations;
- Docker runtime access for Python execution containers;
- artifact storage directories for datasets, documents, models, outputs, and workspaces;
- OpenAI-compatible LLM credentials when LLM workflows are enabled;
- SMTP credentials for email verification/password reset in production.

## Backend Runtime

Build and start the backend from `backend/`:

```bash
npm run build
npm run start
```

The backend listens on `PORT` and mounts API routes under `/api`.

Required production configuration includes:

- strong `JWT_SECRET`;
- configured `DATABASE_URL`;
- strict `ALLOWED_ORIGINS`;
- production SMTP settings;
- LLM provider credentials;
- Docker image/network/resource settings appropriate for the host;
- persistent storage paths for uploaded files, model artifacts, and runtime workspaces.

## Frontend Runtime

Build the frontend from `frontend/` or root:

```bash
npm run build
```

Set `VITE_API_BASE` at build time so the frontend points at the correct backend API base.

## Python Execution Runtime

Python execution is controlled by backend `EXECUTION_*` settings:

- `DOCKER_ENABLED`
- `DOCKER_IMAGE`
- `EXECUTION_NETWORK`
- `EXECUTION_AUTO_BUILD_IMAGE`
- `EXECUTION_TIMEOUT_MS`
- `EXECUTION_MAX_MEMORY_MB`
- `EXECUTION_MAX_CPU_PERCENT`
- `EXECUTION_TMPFS_MB`
- `EXECUTION_WORKSPACE_DIR`

The default local posture favors sandboxing. Set network access deliberately; package installation and external data access depend on the selected Docker network.

Build the runtime image manually when needed:

```bash
backend/docker/build-runtime.sh
backend/docker/build-runtime.sh 3.11
```

The runtime image is tagged as `automl-python-runtime:3.11` and `automl-python-runtime:latest`.

## Model Deployment Flow

1. A trained model record and artifact exist for a project.
2. The user creates a deployment from the Deployment phase.
3. The backend records deployment metadata and starts a serving container through the deployment manager.
4. The frontend polls/subscribes to status and displays readiness, schema, logs, and stats.
5. Prediction requests go through `/api/deployments/:deploymentId/predict`.
6. The prediction proxy authenticates the request, applies rate limiting, forwards to the serving container, returns the response, and asynchronously records logs/stats.

## Deployment Operations

Available deployment operations include:

- create/list/detail/delete deployment;
- start and stop serving containers;
- inspect input schema;
- run predictions through the proxy;
- create/list/revoke API keys;
- view prediction logs and container logs;
- view hourly stats;
- run drift checks;
- submit feedback on prediction logs;
- compute PDP-style analysis where supported.

Operational behavior:

- active deployments are recovered on backend startup;
- the deployment health-check loop runs every 15 seconds;
- readiness waits up to 60 seconds for inference containers to pass `/health/ready`;
- active deployments are limited to 5 per project;
- prediction traffic is rate-limited to 60 requests per minute per deployment;
- graceful shutdown stops active deployment containers.

## Health Checks

```bash
curl http://localhost:4000/api/health
```

The health endpoint reports database, Docker, runtime-image, and memory checks. It returns `503` only when a critical check is in `error`; Docker/runtime-image problems degrade health but are non-critical.

## Operational Risks

- Docker permissions and host resource limits directly affect notebook and deployment reliability.
- Production secrets must not use local defaults.
- Prediction logs may contain sensitive feature values; treat them as protected data.
- LLM calls require timeout and cost controls.
- Database migrations must run before serving newly deployed backend code.
