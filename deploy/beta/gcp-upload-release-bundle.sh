#!/usr/bin/env bash

set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"

GCLOUD_BIN="${GCLOUD_BIN:-gcloud}"
INSTANCE_NAME="${INSTANCE_NAME:-automl-beta}"
ZONE="${ZONE:-us-east1-b}"
BUNDLE_PATH="${BUNDLE_PATH:-/tmp/agentic-automl-platform-release.tgz}"
REMOTE_BUNDLE_PATH="${REMOTE_BUNDLE_PATH:-~/agentic-automl-platform-release.tgz}"

if [[ ! -f "${BUNDLE_PATH}" ]]; then
  echo "Bundle not found: ${BUNDLE_PATH}" >&2
  exit 1
fi

"${GCLOUD_BIN}" compute scp \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  "${BUNDLE_PATH}" \
  "${INSTANCE_NAME}:${REMOTE_BUNDLE_PATH}"
