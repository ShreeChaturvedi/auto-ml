#!/usr/bin/env bash

set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID, for example your-gcp-project-id}"

GCLOUD_BIN="${GCLOUD_BIN:-gcloud}"
REGION="${REGION:-us-east1}"
ADDRESS_NAME="${ADDRESS_NAME:-automl-beta-ip}"
NETWORK_TIER="${NETWORK_TIER:-PREMIUM}"

if "${GCLOUD_BIN}" compute addresses describe "${ADDRESS_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" >/dev/null 2>&1; then
  echo "Static IP already exists: ${ADDRESS_NAME}"
else
  "${GCLOUD_BIN}" compute addresses create "${ADDRESS_NAME}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --network-tier="${NETWORK_TIER}"
fi

address="$("${GCLOUD_BIN}" compute addresses describe "${ADDRESS_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(address)')"

cat <<EOF
Static external IP ready.

Name:    ${ADDRESS_NAME}
Region:  ${REGION}
Address: ${address}
EOF
