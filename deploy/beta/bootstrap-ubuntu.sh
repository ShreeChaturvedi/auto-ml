#!/usr/bin/env bash

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

if [[ ! -f /etc/os-release ]]; then
  echo "Unsupported host: /etc/os-release not found." >&2
  exit 1
fi

. /etc/os-release

if [[ "${ID:-}" != "ubuntu" ]]; then
  echo "This script currently supports Ubuntu only." >&2
  exit 1
fi

if [[ "${VERSION_CODENAME:-}" != "noble" ]]; then
  echo "This script targets Ubuntu 24.04 LTS (noble) so PostgreSQL 16 + pgvector install cleanly from packages." >&2
  echo "Provision the VM with Ubuntu 24.04 or adjust the package steps manually." >&2
  exit 1
fi

AUTOML_USER="${AUTOML_USER:-automl}"
AUTOML_GROUP="${AUTOML_GROUP:-automl}"
AUTOML_HOME="${AUTOML_HOME:-/opt/automl}"
APP_ROOT="${APP_ROOT:-${AUTOML_HOME}/ai-augmented-auto-ml-toolchain}"
ENV_FILE="${ENV_FILE:-${AUTOML_HOME}/backend.beta.env}"
DUCKDNS_DIR="${DUCKDNS_DIR:-${AUTOML_HOME}/duckdns}"

echo "==> Installing base packages"
apt-get update
apt-get install -y \
  apt-transport-https \
  ca-certificates \
  curl \
  git \
  gnupg \
  jq \
  lsb-release \
  postgresql-common \
  software-properties-common \
  ufw

echo "==> Installing Node.js 22"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

echo "==> Installing Docker Engine"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y \
  containerd.io \
  docker-buildx-plugin \
  docker-ce \
  docker-ce-cli \
  docker-compose-plugin

echo "==> Installing PostgreSQL 16 + pgvector"
/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
apt-get update
apt-get install -y \
  postgresql-16 \
  postgresql-16-pgvector \
  postgresql-client-16

echo "==> Installing Caddy"
apt-get install -y caddy

echo "==> Creating application user and directories"
if ! getent group "${AUTOML_GROUP}" >/dev/null 2>&1; then
  groupadd --system "${AUTOML_GROUP}"
fi

if ! id -u "${AUTOML_USER}" >/dev/null 2>&1; then
  useradd \
    --system \
    --gid "${AUTOML_GROUP}" \
    --create-home \
    --home-dir "${AUTOML_HOME}" \
    --shell /bin/bash \
    "${AUTOML_USER}"
fi

usermod -aG docker "${AUTOML_USER}"
install -d -o "${AUTOML_USER}" -g "${AUTOML_GROUP}" "${AUTOML_HOME}"
install -d -o "${AUTOML_USER}" -g "${AUTOML_GROUP}" "$(dirname "${APP_ROOT}")"
install -d -o "${AUTOML_USER}" -g "${AUTOML_GROUP}" "${DUCKDNS_DIR}"

if [[ ! -f "${ENV_FILE}" ]]; then
  install -o "${AUTOML_USER}" -g "${AUTOML_GROUP}" -m 600 /dev/null "${ENV_FILE}"
fi

echo "==> Enabling services"
systemctl enable --now docker
systemctl enable --now postgresql
systemctl enable --now caddy

cat <<EOF

Bootstrap complete.

Next steps:
1. Clone the repo to ${APP_ROOT} as ${AUTOML_USER}.
2. Copy backend/.env.beta.example to ${ENV_FILE} and fill in production secrets.
3. Run deploy/beta/configure-postgres.sh with DB_NAME / DB_USER / DB_PASSWORD.
4. Install deploy/beta/automl-backend.service.example and deploy/beta/Caddyfile.example.
5. Optionally install the DuckDNS timer assets from deploy/beta/.

Recommended firewall rules:
  sudo ufw allow OpenSSH
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw enable
EOF
