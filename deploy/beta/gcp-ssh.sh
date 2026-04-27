#!/usr/bin/env bash

set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID, for example your-gcp-project-id}"

GCLOUD_BIN="${GCLOUD_BIN:-gcloud}"
INSTANCE_NAME="${INSTANCE_NAME:-automl-beta}"
ZONE="${ZONE:-us-east1-b}"

"${GCLOUD_BIN}" compute ssh "${INSTANCE_NAME}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  "$@"
