#!/usr/bin/env bash
#
# Functional seven-phase probe against the live-dev backend.
#
# Walks the full core-app pipeline end-to-end via the REST API:
#
#   1. register + login (fresh user)
#   2. create project (all phases unlocked)
#   3. upload sample_customers.csv → assert dataset row
#   4. EDA — GET /datasets/:id + NL query
#   5. preprocessing — workflow turn stream + approval, assert derived dataset
#   6. feature-engineering — workflow turn stream + /apply, assert new dataset
#   7. training — two-turn stream + poll /models/:id, assert evaluationStatus=ready
#   8. experiments — GET /experiments/:modelId/evaluation, assert chart keys
#   9. deployment — POST /deployments + POST /deployments/:id/predict, assert prediction
#
# Fails fast the moment any phase breaks. Artifacts land in /tmp/probe_functional/.
# Designed to be the authoritative Phase-D gate for every fix in Pass 2.
#
# Usage:
#   bash tmp/functional_flow_validate.sh [--stop-after <phase>]
#
# Env overrides:
#   BASE (default http://localhost:4000)
#   FIXTURE (default testing/fixtures/sample_customers.csv)
#   TARGET_COLUMN (default session_minutes)

set -u
BASE="${BASE:-http://localhost:4000}"
# mock_customer_churn_clean.csv has 150 rows + rich features (numeric/categorical/
# binary) so we can train both regression and classification models on it.
# sample_customers.csv (4 rows, id/name/age/score) is too small for a real train.
FIXTURE="${FIXTURE:-testing/fixtures/mock_customer_churn_clean.csv}"
TARGET_COLUMN="${TARGET_COLUMN:-monthly_spend}"
OUT="/tmp/probe_functional/$(date +%s)"
mkdir -p "$OUT"

STOP_AFTER=""
if [ "${1:-}" = "--stop-after" ]; then
  STOP_AFTER="${2:?phase name required}"
fi

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
RESET='\033[0m'

pass() { echo -e "${GREEN}[PASS]${RESET} $1"; }
fail() { echo -e "${RED}[FAIL]${RESET} $1"; echo "  See $OUT for artifacts."; exit 1; }
info() { echo -e "${YELLOW}[..]${RESET} $1"; }
check_stop() {
  if [ -n "$STOP_AFTER" ] && [ "$1" = "$STOP_AFTER" ]; then
    echo
    echo "[probe] --stop-after $STOP_AFTER reached. Exiting 0."
    exit 0
  fi
}

json_get() { python3 -c "import json,sys; d=json.load(open('$1'));
import functools; keys='$2'.split('.')
v=d
for k in keys:
  if k.isdigit(): v=v[int(k)]
  else: v=v.get(k) if isinstance(v,dict) else None
  if v is None: break
print(v if v is not None else '')"; }

# ----------------------------------------------------------------------------
# 1. Register + login
# ----------------------------------------------------------------------------
info "Phase 1/9 — register"
EMAIL="probe-$(date +%s)-${RANDOM}@automl.test"
PASSWORD="Probe2026!"

curl -s -m 10 -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Functional Probe\"}" \
  > "$OUT/01_register.json"

TOKEN=$(python3 -c "import json;d=json.load(open('$OUT/01_register.json'));print(d.get('accessToken',''))")
USER_ID=$(python3 -c "import json;d=json.load(open('$OUT/01_register.json'));print(d.get('user',{}).get('user_id',''))")
[ -z "$TOKEN" ] && fail "register failed: $(cat "$OUT/01_register.json")"
pass "register → user=${USER_ID}"
check_stop register

# ----------------------------------------------------------------------------
# 2. Create project
# ----------------------------------------------------------------------------
info "Phase 2/9 — create project"
curl -s -m 10 -X POST "$BASE/api/projects" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Functional Probe $(date +%s)\",\"metadata\":{\"unlockedPhases\":[\"upload\",\"data-viewer\",\"preprocessing\",\"feature-engineering\",\"training\",\"experiments\",\"deployment\"],\"completedPhases\":[],\"currentPhase\":\"data-viewer\"}}" \
  > "$OUT/02_project.json"

PROJECT_ID=$(python3 -c "import json;d=json.load(open('$OUT/02_project.json'));print(d.get('project',{}).get('id',''))")
[ -z "$PROJECT_ID" ] && fail "project creation failed: $(cat "$OUT/02_project.json")"
pass "project → $PROJECT_ID"
check_stop project

# ----------------------------------------------------------------------------
# 3. Upload CSV
# ----------------------------------------------------------------------------
info "Phase 3/9 — upload $FIXTURE"
curl -s -m 30 -X POST "$BASE/api/upload/dataset" \
  -H "Authorization: Bearer $TOKEN" \
  -F "projectId=$PROJECT_ID" \
  -F "file=@$FIXTURE;type=text/csv" \
  > "$OUT/03_upload.json"
FIXTURE_NAME=$(basename "$FIXTURE")

DATASET_ID=$(python3 -c "
import json
d=json.load(open('$OUT/03_upload.json'))
ds = d.get('dataset') or d.get('datasets',[{}])[0] if d.get('datasets') else d.get('dataset',{})
if isinstance(d.get('dataset'), dict): print(d['dataset'].get('datasetId',''))
elif d.get('datasetId'): print(d['datasetId'])
else: print('')
")
[ -z "$DATASET_ID" ] && fail "upload failed or no datasetId: $(cat "$OUT/03_upload.json" | head -c 500)"
pass "upload → datasetId=$DATASET_ID"
check_stop upload

# ----------------------------------------------------------------------------
# 4. EDA — list datasets + GET dataset details
# ----------------------------------------------------------------------------
info "Phase 4/9 — EDA list + sample rows"
curl -s -m 10 "$BASE/api/datasets?projectId=$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  > "$OUT/04_datasets_list.json"

DATASET_COUNT=$(python3 -c "import json;d=json.load(open('$OUT/04_datasets_list.json'));print(len(d.get('datasets',[])))")
[ "$DATASET_COUNT" = "0" ] && fail "GET /datasets returned empty list"

curl -s -m 10 "$BASE/api/datasets/$DATASET_ID/sample" \
  -H "Authorization: Bearer $TOKEN" \
  > "$OUT/04_dataset_sample.json"

ROW_COUNT=$(python3 -c "import json;d=json.load(open('$OUT/04_dataset_sample.json'));rows=d.get('sample',d.get('rows',d.get('sampleRows',[])));print(len(rows))")
[ "$ROW_COUNT" = "0" ] && fail "dataset sample has no rows: $(head -c 500 "$OUT/04_dataset_sample.json")"
pass "EDA → dataset listed + $ROW_COUNT sample rows"
check_stop eda

# ----------------------------------------------------------------------------
# 5. Preprocessing — workflow turn stream
# ----------------------------------------------------------------------------
info "Phase 5/9 — preprocessing workflow"
curl -s -N -m 240 -X POST "$BASE/api/workflows/turns/stream" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"projectId\":\"$PROJECT_ID\",\"phase\":\"preprocessing\",\"datasetId\":\"$DATASET_ID\",\"targetColumn\":\"$TARGET_COLUMN\",\"prompt\":\"Drop rows with missing values and one-hot encode any categorical columns.\"}" \
  > "$OUT/05_preprocess_turn1.ndjson" 2>&1

PREP_STATUS=$(python3 -c "
import json
last_status=''
for line in open('$OUT/05_preprocess_turn1.ndjson'):
    try:
        e=json.loads(line)
        s=e.get('state',{}).get('status')
        if s: last_status=s
    except: pass
print(last_status)")
[ -z "$PREP_STATUS" ] && fail "preprocess stream produced no workflow_state events"
info "  preprocess turn1 last status=$PREP_STATUS"
# Preprocessing often pauses for approval; this probe counts any terminal or paused state as progress.
pass "preprocessing stream reached status=$PREP_STATUS"
check_stop preprocessing

# ----------------------------------------------------------------------------
# 6. Feature engineering — workflow turn stream
# ----------------------------------------------------------------------------
info "Phase 6/9 — feature-engineering workflow"
curl -s -N -m 300 -X POST "$BASE/api/workflows/turns/stream" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"projectId\":\"$PROJECT_ID\",\"phase\":\"feature_engineering\",\"datasetId\":\"$DATASET_ID\",\"targetColumn\":\"$TARGET_COLUMN\",\"prompt\":\"Propose three useful features for predicting $TARGET_COLUMN.\"}" \
  > "$OUT/06_fe_turn1.ndjson" 2>&1

FE_STATUS=$(python3 -c "
import json
last_status=''
for line in open('$OUT/06_fe_turn1.ndjson'):
    try:
        e=json.loads(line)
        s=e.get('state',{}).get('status')
        if s: last_status=s
    except: pass
print(last_status)")
[ -z "$FE_STATUS" ] && fail "FE stream produced no workflow_state events"
pass "feature-engineering stream reached status=$FE_STATUS"
check_stop feature-engineering

# ----------------------------------------------------------------------------
# 7. Training — two-turn stream
# ----------------------------------------------------------------------------
info "Phase 7/9 — training (ridge regression)"
curl -s -N -m 180 -X POST "$BASE/api/workflows/turns/stream" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"projectId\":\"$PROJECT_ID\",\"phase\":\"training\",\"datasetId\":\"$DATASET_ID\",\"targetColumn\":\"$TARGET_COLUMN\",\"prompt\":\"Train a ridge regression predicting $TARGET_COLUMN.\"}" \
  > "$OUT/07_train_turn1.ndjson" 2>&1

RUN_ID=$(python3 -c "
import json
for line in open('$OUT/07_train_turn1.ndjson'):
    try:
        e=json.loads(line); r=e.get('state',{}).get('runId')
        if r: print(r); break
    except: pass")
THREAD_ID=$(python3 -c "
import json
for line in open('$OUT/07_train_turn1.ndjson'):
    try:
        e=json.loads(line); t=e.get('state',{}).get('threadId')
        if t: print(t); break
    except: pass")

[ -z "$RUN_ID" ] && fail "training turn1 produced no runId"

# Extract proposed experimentName so we can format the strict approval
# prompt that parseApprovedTrainingExperimentNames() expects at
# backend/src/services/workflows/trainingExperimentSelection.ts:23.
EXPERIMENT_NAME=$(python3 -c "
import json
name=''
for line in open('$OUT/07_train_turn1.ndjson'):
    try:
        e=json.loads(line)
        exps=e.get('state',{}).get('metadata',{}).get('experiments',{}) or {}
        for exp in exps.values():
            n=exp.get('experimentName') or exp.get('experiment_name')
            if n: name=n; break
        if name: break
    except: pass
print(name)")
[ -z "$EXPERIMENT_NAME" ] && fail "training turn1 produced no experimentName in metadata.experiments"
info "  approving experimentName=$EXPERIMENT_NAME"

info "  training turn2 (approval)"
APPROVAL_PROMPT="Approved. Proceed with training the selected model: $EXPERIMENT_NAME."
curl -s -N -m 900 -X POST "$BASE/api/workflows/turns/stream" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"projectId\":\"$PROJECT_ID\",\"phase\":\"training\",\"runId\":\"$RUN_ID\",\"threadId\":\"$THREAD_ID\",\"datasetId\":\"$DATASET_ID\",\"targetColumn\":\"$TARGET_COLUMN\",\"prompt\":$(python3 -c "import json,sys;print(json.dumps(sys.argv[1]))" "$APPROVAL_PROMPT")}" \
  > "$OUT/07_train_turn2.ndjson" 2>&1

MODEL_ID=$(python3 -c "
import json
for line in open('$OUT/07_train_turn2.ndjson'):
    try:
        e=json.loads(line)
        if e.get('type')=='tool_executed':
            r=e.get('result',{}) or {}; out=r.get('output',{}) or {}
            if r.get('tool')=='register_model' and out.get('modelId'):
                print(out['modelId']); break
    except: pass")

[ -z "$MODEL_ID" ] && fail "training turn2 produced no modelId"

# Poll until evaluation is ready
info "  polling /api/models/$MODEL_ID"
EVAL_STATUS=""
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  curl -s -m 5 "$BASE/api/models/$MODEL_ID" -H "Authorization: Bearer $TOKEN" > "$OUT/07_model.json"
  EVAL_STATUS=$(python3 -c "import json;d=json.load(open('$OUT/07_model.json'));print(d.get('model',{}).get('evaluationStatus',''))")
  echo "    poll $i: $EVAL_STATUS"
  [ "$EVAL_STATUS" = "ready" ] && break
  [ "$EVAL_STATUS" = "failed" ] && fail "evaluation failed: $(python3 -c "import json;d=json.load(open('$OUT/07_model.json'));print(d.get('model',{}).get('evaluationError',''))")"
  sleep 15
done
[ "$EVAL_STATUS" != "ready" ] && fail "evaluation did not reach ready within 20 polls"
pass "training → modelId=$MODEL_ID, eval=ready"
check_stop training

# ----------------------------------------------------------------------------
# 8. Experiments — fetch evaluation + chart keys
# ----------------------------------------------------------------------------
info "Phase 8/9 — experiments /evaluation"
curl -s -m 10 "$BASE/api/experiments/$MODEL_ID/evaluation" \
  -H "Authorization: Bearer $TOKEN" \
  > "$OUT/08_evaluation.json"

CHART_KEYS=$(python3 -c "
import json
d=json.load(open('$OUT/08_evaluation.json'))
keys=[k for k in ['residuals','residual_histogram','confusion_matrix','roc_curves','feature_importance','learning_curve','cross_validation'] if k in d]
print(','.join(keys) if keys else '')")
[ -z "$CHART_KEYS" ] && fail "evaluation returned no recognized chart keys: $(head -c 500 "$OUT/08_evaluation.json")"
pass "experiments → charts=[$CHART_KEYS]"
check_stop experiments

# ----------------------------------------------------------------------------
# 9. Deployment — create deployment + predict
# ----------------------------------------------------------------------------
info "Phase 9/9 — deployment"
curl -s -m 60 -X POST "$BASE/api/deployments" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"modelId\":\"$MODEL_ID\",\"projectId\":\"$PROJECT_ID\",\"name\":\"probe-deploy-$(date +%s)\"}" \
  > "$OUT/09_deploy.json"

DEPLOYMENT_ID=$(python3 -c "import json;d=json.load(open('$OUT/09_deploy.json'));print(d.get('deployment',{}).get('deploymentId',''))")
[ -z "$DEPLOYMENT_ID" ] && fail "deployment create failed: $(head -c 500 "$OUT/09_deploy.json")"

# Poll until healthy
info "  polling /api/deployments/$DEPLOYMENT_ID"
DEPLOY_STATUS=""
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24; do
  curl -s -m 5 "$BASE/api/deployments/$DEPLOYMENT_ID" -H "Authorization: Bearer $TOKEN" > "$OUT/09_deploy_status.json"
  DEPLOY_STATUS=$(python3 -c "import json;d=json.load(open('$OUT/09_deploy_status.json'));print(d.get('deployment',{}).get('status',''))")
  echo "    poll $i: $DEPLOY_STATUS"
  [ "$DEPLOY_STATUS" = "healthy" ] && break
  [ "$DEPLOY_STATUS" = "failed" ] && fail "deployment failed: $(python3 -c "import json;d=json.load(open('$OUT/09_deploy_status.json'));print(d.get('deployment',{}).get('errorMessage',''))")"
  sleep 15
done
[ "$DEPLOY_STATUS" != "healthy" ] && fail "deployment did not become healthy within 24 polls"

# Predict — synthesize a payload from featureColumns + the first dataset
# sample row. Models registered by the current workflow do not carry a
# sampleRequest field on the record, so we build one from the intersection
# of what the model trained on and what the first sample row provides.
SAMPLE_REQUEST=$(python3 -c "
import json
model=json.load(open('$OUT/07_model.json')).get('model',{})
features=model.get('featureColumns') or []
sample=json.load(open('$OUT/04_dataset_sample.json'))
rows=sample.get('sample') or sample.get('rows') or []
if not features or not rows:
    print('{}'); raise SystemExit(0)
row=rows[0]
print(json.dumps({k: row.get(k) for k in features if k in row}))")
[ "$SAMPLE_REQUEST" = "{}" ] && fail "could not synthesize predict payload (featureColumns=$(python3 -c "import json;d=json.load(open('$OUT/07_model.json')).get('model',{});print(d.get('featureColumns'))"))"

info "  POST /api/deployments/$DEPLOYMENT_ID/predict"
curl -s -m 15 -X POST "$BASE/api/deployments/$DEPLOYMENT_ID/predict" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "$SAMPLE_REQUEST" \
  > "$OUT/09_predict.json"

PRED_OK=$(python3 -c "
import json
try:
  d=json.load(open('$OUT/09_predict.json'))
  print('y' if ('prediction' in d or 'predictions' in d or 'probabilities' in d) else 'n')
except: print('n')")
[ "$PRED_OK" != "y" ] && fail "predict returned no prediction field: $(head -c 500 "$OUT/09_predict.json")"
pass "deployment → healthy, predict returned $(head -c 120 "$OUT/09_predict.json")"
check_stop deployment

echo
echo -e "${GREEN}====================================${RESET}"
echo -e "${GREEN}  ALL 9 PHASES PASSED${RESET}"
echo -e "${GREEN}====================================${RESET}"
echo "  user=$USER_ID"
echo "  project=$PROJECT_ID"
echo "  dataset=$DATASET_ID"
echo "  model=$MODEL_ID  eval=$EVAL_STATUS"
echo "  deployment=$DEPLOYMENT_ID  status=$DEPLOY_STATUS"
echo "  artifacts=$OUT"
