#!/usr/bin/env bash

set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
: "${DUCKDNS_DOMAIN:?Set DUCKDNS_DOMAIN without the .duckdns.org suffix}"
: "${DUCKDNS_TOKEN:?Set DUCKDNS_TOKEN}"

GCLOUD_BIN="${GCLOUD_BIN:-gcloud}"
REGION="${REGION:-us-east1}"
ADDRESS_NAME="${ADDRESS_NAME:-automl-beta-ip}"

ip="$("${GCLOUD_BIN}" compute addresses describe "${ADDRESS_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(address)')"

if [[ -z "${ip}" ]]; then
  echo "Could not resolve static IP address from GCP." >&2
  exit 1
fi

response="$(curl -fsS \
  "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=${ip}&verbose=true")"

printf '%s\n' "${response}"
