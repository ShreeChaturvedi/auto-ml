#!/usr/bin/env bash

set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"${SCRIPT_DIR}/gcp-enable-compute.sh"
"${SCRIPT_DIR}/gcp-reserve-static-ip.sh"
"${SCRIPT_DIR}/gcp-create-vm.sh"

cat <<EOF

Provisioning steps finished.

Next:
1. Point DuckDNS at the reserved external IP.
2. SSH into the VM with deploy/beta/gcp-ssh.sh.
3. Run deploy/beta/bootstrap-ubuntu.sh on the VM.
EOF
