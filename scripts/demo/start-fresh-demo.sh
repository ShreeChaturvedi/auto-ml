#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

BACKEND_PORTS=(4000 4001 4002 4003 4004 4005 4006 4007 4008 4009 4010)
FRONTEND_PORTS=(5173 5174 5175 5176 5177 5178 5179 5180 5181 5182 5183)

collect_listening_pids() {
  local port
  for port in "$@"; do
    lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true
  done | sort -u
}

print_listening_ports() {
  local port
  for port in "$@"; do
    if lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
      printf '[demo] port %s is occupied\n' "${port}"
    fi
  done
}

kill_listening_processes() {
  local signal="$1"
  shift

  local pids=""
  pids="$(collect_listening_pids "$@")"

  if [[ -z "${pids}" ]]; then
    return 0
  fi

  printf '[demo] killing listener pids with %s: %s\n' "${signal}" "$(echo "${pids}" | tr '\n' ' ')"
  while IFS= read -r pid; do
    [[ -z "${pid}" ]] && continue
    kill "-${signal}" "${pid}" 2>/dev/null || true
  done <<< "${pids}"
}

verify_ports_clear() {
  local port
  for port in "$@"; do
    if lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
      return 1
    fi
  done
  return 0
}

ALL_PORTS=("${BACKEND_PORTS[@]}" "${FRONTEND_PORTS[@]}")

printf '[demo] cleaning old backend/frontend listeners if present\n'
print_listening_ports "${ALL_PORTS[@]}"

kill_listening_processes TERM "${ALL_PORTS[@]}"
sleep 1

if ! verify_ports_clear "${ALL_PORTS[@]}"; then
  printf '[demo] some listeners survived TERM; escalating to KILL\n'
  kill_listening_processes KILL "${ALL_PORTS[@]}"
  sleep 1
fi

if ! verify_ports_clear "${ALL_PORTS[@]}"; then
  printf '[demo] unable to free all demo ports\n' >&2
  print_listening_ports "${ALL_PORTS[@]}" >&2
  exit 1
fi

printf '[demo] ports are clean; starting fresh dev stack\n'
printf '[demo] frontend will be available at http://localhost:5173\n'
printf '[demo] backend health will be available at http://localhost:4000/api/health\n'

cd "${ROOT_DIR}"
exec npm run dev
