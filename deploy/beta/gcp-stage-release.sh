#!/usr/bin/env bash

set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"

GCLOUD_BIN="${GCLOUD_BIN:-gcloud}"
INSTANCE_NAME="${INSTANCE_NAME:-automl-beta}"
ZONE="${ZONE:-us-east1-b}"
APP_USER="${APP_USER:-automl}"
APP_GROUP="${APP_GROUP:-automl}"
APP_ROOT="${APP_ROOT:-/opt/automl/ai-augmented-auto-ml-toolchain}"
ENV_FILE="${ENV_FILE:-/opt/automl/backend.beta.env}"
REMOTE_BUNDLE_PATH="${REMOTE_BUNDLE_PATH:-~/agentic-automl-platform-release.tgz}"
REMOTE_ENV_PATH="${REMOTE_ENV_PATH:-~/backend.beta.env}"

"${GCLOUD_BIN}" compute ssh "${INSTANCE_NAME}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  --command="set -euo pipefail
if ! id -u '${APP_USER}' >/dev/null 2>&1; then
  echo 'App user ${APP_USER} does not exist yet. Run deploy/beta/bootstrap-ubuntu.sh first.' >&2
  exit 1
fi
sudo install -d -o '${APP_USER}' -g '${APP_GROUP}' '${APP_ROOT}'
sudo -u '${APP_USER}' tar -xzf '${REMOTE_BUNDLE_PATH}' -C '${APP_ROOT}'
sudo install -o '${APP_USER}' -g '${APP_GROUP}' -m 600 '${REMOTE_ENV_PATH}' '${ENV_FILE}'"
