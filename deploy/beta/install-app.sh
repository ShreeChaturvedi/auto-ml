#!/usr/bin/env bash

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

APP_USER="${APP_USER:-automl}"
APP_ROOT="${APP_ROOT:-/opt/automl/ai-augmented-auto-ml-toolchain}"
ENV_FILE="${ENV_FILE:-/opt/automl/backend.beta.env}"
SERVICE_NAME="${SERVICE_NAME:-automl-backend}"

if [[ ! -d "${APP_ROOT}" ]]; then
  echo "APP_ROOT does not exist: ${APP_ROOT}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ENV_FILE does not exist: ${ENV_FILE}" >&2
  exit 1
fi

run_as_app() {
  sudo -u "${APP_USER}" -H bash -lc "$1"
}

echo "==> Installing workspace dependencies"
run_as_app "cd '${APP_ROOT}' && npm run install:all"

echo "==> Building backend + frontend"
run_as_app "cd '${APP_ROOT}' && npm run build"

echo "==> Running database migrations"
run_as_app "cd '${APP_ROOT}' && set -a && source '${ENV_FILE}' && set +a && npm run db:migrate"

echo "==> Restarting backend service"
systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"
systemctl --no-pager --full status "${SERVICE_NAME}"
