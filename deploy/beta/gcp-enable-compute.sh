#!/usr/bin/env bash

set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID, for example your-gcp-project-id}"

GCLOUD_BIN="${GCLOUD_BIN:-gcloud}"

"${GCLOUD_BIN}" services enable compute.googleapis.com \
  --project="${PROJECT_ID}"

cat <<EOF
Compute Engine API enabled for project ${PROJECT_ID}.

Next steps:
1. Reserve a static external IP with deploy/beta/gcp-reserve-static-ip.sh.
2. Create the VM with deploy/beta/gcp-create-vm.sh.
EOF
