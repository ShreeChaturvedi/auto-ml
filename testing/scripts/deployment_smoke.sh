#!/usr/bin/env bash

set -Eeuo pipefail

BASE="${BASE:-http://127.0.0.1:4000}"
API_BASE="${API_BASE:-$BASE/api}"
OUT_ROOT="${OUT_ROOT:-$(mktemp -d "${TMPDIR:-/tmp}/deployment_smoke.XXXXXX")}"
PASSWORD="${PASSWORD:-DeploymentSmoke2026!}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-2}"
POLL_MAX_ATTEMPTS="${POLL_MAX_ATTEMPTS:-90}"

mkdir -p "$OUT_ROOT"

LAST_STATUS=""
LAST_BODY=""
LAST_HEADERS=""
ACCESS_TOKEN=""
PROJECT_ID=""
MODEL_ID=""
DEPLOYMENT_ID=""
API_KEY_RAW=""

info() {
  printf '[..] %s\n' "$*"
}

pass() {
  printf '[PASS] %s\n' "$*"
}

fail() {
  printf '[FAIL] %s\n' "$*" >&2
  dump_failure_context
  printf 'Artifacts: %s\n' "$OUT_ROOT" >&2
  exit 1
}

request_json() {
  local label="$1"
  shift
  LAST_BODY="$OUT_ROOT/${label}.body.json"
  LAST_HEADERS="$OUT_ROOT/${label}.headers.txt"
  LAST_STATUS="$(curl -sS -o "$LAST_BODY" -D "$LAST_HEADERS" -w '%{http_code}' "$@")"
}

request_or_fail() {
  local label="$1"
  shift
  if ! request_json "$label" "$@"; then
    fail "curl failed for ${label}"
  fi
}

json_value() {
  python3 - "$1" "$2" <<'PY'
import json
import sys

path = [part for part in sys.argv[2].split('.') if part]
with open(sys.argv[1], 'r', encoding='utf-8') as fh:
    value = json.load(fh)
for part in path:
    if isinstance(value, list) and part.isdigit():
        idx = int(part)
        value = value[idx] if idx < len(value) else None
    elif isinstance(value, dict):
        value = value.get(part)
    else:
        value = None
        break
if value is None:
    print('')
elif isinstance(value, bool):
    print('true' if value else 'false')
elif isinstance(value, (dict, list)):
    print(json.dumps(value))
else:
    print(value)
PY
}

save_json_path() {
  python3 - "$1" "$2" "$3" <<'PY'
import json
import sys

src, path_text, dest = sys.argv[1:4]
path = [part for part in path_text.split('.') if part]
with open(src, 'r', encoding='utf-8') as fh:
    value = json.load(fh)
for part in path:
    if isinstance(value, list) and part.isdigit():
        idx = int(part)
        value = value[idx] if idx < len(value) else None
    elif isinstance(value, dict):
        value = value.get(part)
    else:
        value = None
        break
if value is None:
    raise SystemExit(1)
with open(dest, 'w', encoding='utf-8') as fh:
    json.dump(value, fh, indent=2)
PY
}

expect_status() {
  local expected="$1"
  local label="$2"
  if [ "$LAST_STATUS" != "$expected" ]; then
    local detail
    detail="$(head -c 500 "$LAST_BODY" 2>/dev/null || true)"
    if [ "$(json_value "$LAST_BODY" error)" = 'Email not verified' ]; then
      detail="${detail} (hint: set DEV_BYPASS_EMAIL_VERIFICATION=true for local smoke)"
    fi
    fail "${label} returned HTTP ${LAST_STATUS}, expected ${expected}: ${detail}"
  fi
}

expect_json_condition() {
  local file="$1"
  local label="$2"
  local program="$3"
  if ! python3 - "$file" <<PY
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as fh:
    payload = json.load(fh)

${program}
PY
  then
    fail "$label failed validation"
  fi
}

dump_failure_context() {
  if [ -z "$DEPLOYMENT_ID" ] || [ -z "$ACCESS_TOKEN" ]; then
    return 0
  fi

  info "Collecting deployment failure context"

  request_json "failure_container_logs" \
    "$API_BASE/deployments/$DEPLOYMENT_ID/container-logs" \
    -H "Authorization: Bearer $ACCESS_TOKEN" || true
  request_json "failure_prediction_logs" \
    "$API_BASE/deployments/$DEPLOYMENT_ID/logs" \
    -H "Authorization: Bearer $ACCESS_TOKEN" || true
  request_json "failure_final_state" \
    "$API_BASE/deployments/$DEPLOYMENT_ID" \
    -H "Authorization: Bearer $ACCESS_TOKEN" || true
}

poll_until_healthy() {
  local attempt
  for attempt in $(seq 1 "$POLL_MAX_ATTEMPTS"); do
    request_or_fail "06_deployment_status_${attempt}" \
      "$API_BASE/deployments/$DEPLOYMENT_ID" \
      -H "Authorization: Bearer $ACCESS_TOKEN"
    expect_status 200 "deployment status poll"

    local status
    status="$(json_value "$LAST_BODY" deployment.status)"
    info "deployment status attempt ${attempt}/${POLL_MAX_ATTEMPTS}: ${status}"

    if [ "$status" = 'healthy' ]; then
      pass "deployment reached healthy"
      return 0
    fi

    if [ "$status" = 'failed' ]; then
      fail "deployment entered failed state"
    fi

    sleep "$POLL_INTERVAL_SECONDS"
  done

  fail "deployment did not become healthy within ${POLL_MAX_ATTEMPTS} polls"
}

info "Validating local backend health at ${API_BASE}/health"
request_or_fail "00_health" "$API_BASE/health"
expect_status 200 "health check"
pass "backend health endpoint responded"

info "Validating Docker daemon availability"
if ! docker info > "$OUT_ROOT/docker-info.txt" 2>&1; then
  fail "docker info failed"
fi
pass "docker daemon is reachable"

EMAIL="deployment-smoke-$(date +%s)-${RANDOM}@automl.test"

info "Registering test user ${EMAIL}"
request_or_fail "01_register" \
  -X POST "$API_BASE/auth/register" \
  -H 'Content-Type: application/json' \
  --data "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Deployment Smoke\"}"
expect_status 201 "register"
pass "registered test user"

info "Logging in test user"
request_or_fail "02_login" \
  -X POST "$API_BASE/auth/login" \
  -H 'Content-Type: application/json' \
  --data "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
expect_status 200 "login"
ACCESS_TOKEN="$(json_value "$LAST_BODY" accessToken)"
[ -n "$ACCESS_TOKEN" ] || fail "login response missing accessToken"
pass "authenticated user"

info "Creating fresh project"
request_or_fail "03_project" \
  -X POST "$API_BASE/projects" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"name":"Deployment Smoke","metadata":{"unlockedPhases":["upload","data-viewer","preprocessing","feature-engineering","training","experiments","deployment"],"completedPhases":[],"currentPhase":"deployment"}}'
expect_status 201 "project create"
PROJECT_ID="$(json_value "$LAST_BODY" project.id)"
[ -n "$PROJECT_ID" ] || fail "project response missing id"
pass "created project ${PROJECT_ID}"

info "Seeding one deterministic classification model"
request_or_fail "04_seed_model" \
  -X POST "$API_BASE/models/seed-one" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data "{\"projectId\":\"$PROJECT_ID\",\"name\":\"Deployment Smoke Seed\",\"taskType\":\"classification\",\"algorithm\":\"RandomForestClassifier\"}"
expect_status 200 "seed model"
MODEL_ID="$(json_value "$LAST_BODY" model.modelId)"
[ -n "$MODEL_ID" ] || fail "seed-one response missing modelId"
pass "seeded model ${MODEL_ID}"

info "Creating deployment"
request_or_fail "05_create_deployment" \
  -X POST "$API_BASE/deployments" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data "{\"modelId\":\"$MODEL_ID\",\"projectId\":\"$PROJECT_ID\",\"name\":\"Deployment Smoke Endpoint\"}"
expect_status 201 "create deployment"
DEPLOYMENT_ID="$(json_value "$LAST_BODY" deployment.deploymentId)"
[ -n "$DEPLOYMENT_ID" ] || fail "deployment response missing deploymentId"
pass "created deployment ${DEPLOYMENT_ID}"

info "Polling deployment health"
poll_until_healthy

info "Fetching deployment schema"
request_or_fail "07_schema" \
  "$API_BASE/deployments/$DEPLOYMENT_ID/schema" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
expect_status 200 "deployment schema"
expect_json_condition "$LAST_BODY" "schema contract" '
feature_columns = payload.get("featureColumns") or []
sample_request = payload.get("sampleRequest") or {}
task_type = payload.get("taskType")
assert isinstance(feature_columns, list) and len(feature_columns) > 0
assert isinstance(sample_request, dict) and len(sample_request) > 0
assert task_type in {"classification", "regression"}
'
save_json_path "$LAST_BODY" sampleRequest "$OUT_ROOT/sample_request.json"
pass "schema returned featureColumns, sampleRequest, and deployable taskType"

info "Predicting through JWT-authenticated proxy"
request_or_fail "08_predict_jwt" \
  -X POST "$API_BASE/deployments/$DEPLOYMENT_ID/predict" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data "@$OUT_ROOT/sample_request.json"
expect_status 200 "jwt predict"
expect_json_condition "$LAST_BODY" "jwt prediction response" '
assert "prediction" in payload
'
pass "jwt prediction succeeded"

info "Creating deployment API key"
request_or_fail "09_api_key_create" \
  -X POST "$API_BASE/deployments/$DEPLOYMENT_ID/api-keys" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"name":"deployment-smoke-key"}'
expect_status 201 "api key create"
API_KEY_RAW="$(json_value "$LAST_BODY" rawKey)"
[ -n "$API_KEY_RAW" ] || fail "api-key response missing rawKey"
pass "created API key"

info "Predicting through API-key-authenticated proxy"
request_or_fail "10_predict_api_key" \
  -X POST "$API_BASE/deployments/$DEPLOYMENT_ID/predict" \
  -H "X-API-Key: $API_KEY_RAW" \
  -H 'Content-Type: application/json' \
  --data "@$OUT_ROOT/sample_request.json"
expect_status 200 "api-key predict"
expect_json_condition "$LAST_BODY" "api-key prediction response" '
assert "prediction" in payload
'
pass "api-key prediction succeeded"

info "Stopping deployment"
request_or_fail "11_stop" \
  -X PATCH "$API_BASE/deployments/$DEPLOYMENT_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"action":"stop"}'
expect_status 200 "stop deployment"
pass "deployment stopped"

info "Starting deployment"
request_or_fail "12_start" \
  -X PATCH "$API_BASE/deployments/$DEPLOYMENT_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"action":"start"}'
expect_status 200 "start deployment"
poll_until_healthy

info "Deleting deployment"
request_or_fail "13_delete" \
  -X DELETE "$API_BASE/deployments/$DEPLOYMENT_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
expect_status 204 "delete deployment"
pass "deployment deleted"

printf 'Artifacts: %s\n' "$OUT_ROOT"
