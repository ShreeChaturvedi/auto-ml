#!/usr/bin/env bash

set -euo pipefail

: "${BACKEND_ORIGIN:?Set BACKEND_ORIGIN, for example https://your-subdomain.duckdns.org}"

FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-}"

echo "==> Checking backend health"
curl -fsS "${BACKEND_ORIGIN}/api/health" | jq .

echo "==> Checking Google auth is disabled for beta"
google_status="$(curl -sS -o /tmp/automl-google-auth-check.json -w '%{http_code}' "${BACKEND_ORIGIN}/api/auth/google")"
if [[ "${google_status}" != "503" ]]; then
  echo "Expected /api/auth/google to return 503, got ${google_status}" >&2
  cat /tmp/automl-google-auth-check.json >&2 || true
  exit 1
fi
cat /tmp/automl-google-auth-check.json | jq .

if [[ -n "${FRONTEND_ORIGIN}" ]]; then
  echo "==> Checking frontend login page"
  curl -fsS -I "${FRONTEND_ORIGIN}/login"
fi

echo "Smoke checks passed."
