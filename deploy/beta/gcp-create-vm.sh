#!/usr/bin/env bash

set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID, for example your-gcp-project-id}"

GCLOUD_BIN="${GCLOUD_BIN:-gcloud}"
INSTANCE_NAME="${INSTANCE_NAME:-automl-beta}"
ZONE="${ZONE:-us-east1-b}"
REGION="${REGION:-${ZONE%-*}}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-standard-4}"
BOOT_DISK_SIZE_GB="${BOOT_DISK_SIZE_GB:-100}"
BOOT_DISK_TYPE="${BOOT_DISK_TYPE:-pd-balanced}"
IMAGE_PROJECT="${IMAGE_PROJECT:-ubuntu-os-cloud}"
IMAGE_FAMILY="${IMAGE_FAMILY:-ubuntu-2404-lts-amd64}"
NETWORK="${NETWORK:-default}"
INSTANCE_TAG="${INSTANCE_TAG:-automl-beta-backend}"
ADDRESS_NAME="${ADDRESS_NAME:-automl-beta-ip}"

ensure_firewall_rule() {
  local name="$1"
  local port="$2"

  if "${GCLOUD_BIN}" compute firewall-rules describe "${name}" \
    --project="${PROJECT_ID}" >/dev/null 2>&1; then
    return 0
  fi

  "${GCLOUD_BIN}" compute firewall-rules create "${name}" \
    --project="${PROJECT_ID}" \
    --network="${NETWORK}" \
    --direction=INGRESS \
    --allow="tcp:${port}" \
    --source-ranges="0.0.0.0/0" \
    --target-tags="${INSTANCE_TAG}"
}

address=""
if [[ -n "${ADDRESS_NAME}" ]]; then
  address="$("${GCLOUD_BIN}" compute addresses describe "${ADDRESS_NAME}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --format='value(address)')"
fi

ensure_firewall_rule "automl-beta-allow-http" "80"
ensure_firewall_rule "automl-beta-allow-https" "443"

if "${GCLOUD_BIN}" compute instances describe "${INSTANCE_NAME}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" >/dev/null 2>&1; then
  echo "VM already exists: ${INSTANCE_NAME}"
else
  create_args=(
    compute
    instances
    create
    "${INSTANCE_NAME}"
    "--project=${PROJECT_ID}"
    "--zone=${ZONE}"
    "--machine-type=${MACHINE_TYPE}"
    "--network=${NETWORK}"
    "--tags=${INSTANCE_TAG}"
    "--boot-disk-size=${BOOT_DISK_SIZE_GB}GB"
    "--boot-disk-type=${BOOT_DISK_TYPE}"
    "--image-project=${IMAGE_PROJECT}"
    "--image-family=${IMAGE_FAMILY}"
  )

  if [[ -n "${address}" ]]; then
    create_args+=("--address=${address}")
  fi

  "${GCLOUD_BIN}" "${create_args[@]}"
fi

external_ip="$("${GCLOUD_BIN}" compute instances describe "${INSTANCE_NAME}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  --format='value(networkInterfaces[0].accessConfigs[0].natIP)')"

cat <<EOF
VM ready.

Instance: ${INSTANCE_NAME}
Zone:     ${ZONE}
External: ${external_ip}

SSH:
gcloud compute ssh ${INSTANCE_NAME} --project=${PROJECT_ID} --zone=${ZONE}
EOF
