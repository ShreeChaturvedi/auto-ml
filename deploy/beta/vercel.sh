#!/usr/bin/env bash

set -euo pipefail

VERCEL_BIN="${VERCEL_BIN:-vercel}"
VERCEL_GLOBAL_CONFIG="${VERCEL_GLOBAL_CONFIG:-/tmp/automl-vercel-config}"

export VERCEL_DISABLE_AUTO_UPDATE=1

exec "${VERCEL_BIN}" -Q "${VERCEL_GLOBAL_CONFIG}" "$@"
