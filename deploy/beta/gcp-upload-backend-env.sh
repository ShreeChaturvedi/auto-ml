#!/usr/bin/env bash

set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"

GCLOUD_BIN="${GCLOUD_BIN:-gcloud}"
INSTANCE_NAME="${INSTANCE_NAME:-automl-beta}"
ZONE="${ZONE:-us-east1-b}"
ENV_PATH="${ENV_PATH:-/tmp/backend.beta.env}"
REMOTE_ENV_PATH="${REMOTE_ENV_PATH:-~/backend.beta.env}"

if [[ ! -f "${ENV_PATH}" ]]; then
  echo "Backend env file not found: ${ENV_PATH}" >&2
  exit 1
fi

"${GCLOUD_BIN}" compute scp \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  "${ENV_PATH}" \
  "${INSTANCE_NAME}:${REMOTE_ENV_PATH}"
