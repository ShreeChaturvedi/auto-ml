#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OUTPUT_PATH="${OUTPUT_PATH:-/tmp/agentic-automl-platform-release.tgz}"

mkdir -p "$(dirname "${OUTPUT_PATH}")"
rm -f "${OUTPUT_PATH}"

tar -czf "${OUTPUT_PATH}" \
  --exclude=".git" \
  --exclude=".codex" \
  --exclude=".claude" \
  --exclude=".agents" \
  --exclude=".local-worktrees" \
  --exclude=".venv" \
  --exclude=".DS_Store" \
  --exclude=".vercel" \
  --exclude="tmp" \
  --exclude="test-results" \
  --exclude="coverage" \
  --exclude="dist" \
  --exclude="node_modules" \
  --exclude="backend/.env" \
  --exclude="backend/.env.local" \
  --exclude="backend/storage" \
  --exclude="frontend/.env.local" \
  --exclude="landing/.env.local" \
  --exclude="video/.env.local" \
  -C "${REPO_ROOT}" \
  .

echo "Release bundle created at ${OUTPUT_PATH}"
