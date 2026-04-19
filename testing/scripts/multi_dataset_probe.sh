#!/usr/bin/env bash
#
# Multi-dataset robustness sweep. Walks the core-app pipeline against 50
# data files (5 domains × 10 format/quality variants) and records PASS/FAIL
# per (domain, variant, phase).
#
# Prereqs:
#   1. `testing/.venv/bin/python testing/scripts/generate_robustness_datasets.py`
#      has produced tmp/robustness_datasets/.
#   2. Dev stack is running (backend:4000 + frontend:5173) via `npm run dev`.
#
# Usage:
#   bash testing/scripts/multi_dataset_probe.sh                      # all 50 (upload+EDA only)
#   bash testing/scripts/multi_dataset_probe.sh customer_retention   # one domain
#   bash testing/scripts/multi_dataset_probe.sh customer_retention bom   # one cell
#   FULL_RUN=1 bash testing/scripts/multi_dataset_probe.sh           # also phases 5-7
#
# Results: tmp/robustness_run_<ts>/results.csv

set -u
BASE="${BASE:-http://localhost:4000}"
DATA_ROOT="${DATA_ROOT:-$(pwd)/tmp/robustness_datasets}"
RESULTS_ROOT="${RESULTS_ROOT:-$(pwd)/tmp/robustness_run_$(date +%s)}"

FILTER_DOMAIN="${1:-}"
FILTER_VARIANT="${2:-}"
FULL_RUN="${FULL_RUN:-0}"

mkdir -p "$RESULTS_ROOT"
RESULTS_CSV="$RESULTS_ROOT/results.csv"
echo "domain,variant,phase,status,detail,datasetId" > "$RESULTS_CSV"

# FULL_RUN=1 flips training phase on. Preprocessing runs by default
# because it's ~30s/cell and most dataset-shape bugs surface there.
if [ "${FULL_RUN:-0}" = "1" ]; then
  export INCLUDE_TRAINING=1
fi

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; RESET='\033[0m'
pass() { echo -e "${GREEN}[PASS]${RESET} $1"; }
fail() { echo -e "${RED}[FAIL]${RESET} $1"; }
info() { echo -e "${YELLOW}[..]${RESET} $1"; }
row()  { echo "$1,$2,$3,$4,\"$(echo "$5" | tr -d '"' | head -c 300)\",$6" >> "$RESULTS_CSV"; }

target_for() {
  case "$1" in
    # v1 domains (tmp/robustness_datasets)
    customer_retention) echo churned ;;
    sensor_readings) echo fault_detected ;;
    messy_survey) echo satisfaction_score ;;
    financial_txns) echo is_fraud ;;
    clinical_records) echo readmitted ;;
    # v2 domains (tmp/robustness_datasets_v2) — cross-validation set
    ecommerce_orders) echo completed_purchase ;;
    hr_attrition) echo left_company ;;
    loan_default) echo defaulted ;;
    marketing_response) echo response_tier ;;
    iot_anomaly) echo is_anomaly ;;
    *) echo "" ;;
  esac
}

content_type_for() {
  case "$1" in
    *.csv) echo "text/csv" ;;
    *.tsv) echo "text/tab-separated-values" ;;
    *.json) echo "application/json" ;;
    *.jsonl) echo "application/x-ndjson" ;;
    *.xlsx) echo "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ;;
    *) echo "application/octet-stream" ;;
  esac
}

run_cell() {
  local DOMAIN="$1" VARIANT="$2" FILENAME="$3"
  local FILE_PATH="$DATA_ROOT/$DOMAIN/$FILENAME"
  local OUT="$RESULTS_ROOT/$DOMAIN/$VARIANT"
  mkdir -p "$OUT"

  if [ ! -f "$FILE_PATH" ]; then
    fail "$DOMAIN/$VARIANT — file missing"
    row "$DOMAIN" "$VARIANT" "setup" "FAIL" "file missing" ""
    return
  fi

  info "$DOMAIN/$VARIANT — register"
  # Retry register up to 3 times with fresh emails each attempt so a single
  # bcrypt stall or transient backend blip doesn't fail the whole cell.
  local TOKEN=""
  local ATTEMPT=0
  for ATTEMPT in 1 2 3; do
    # Include nanosecond timestamp + RANDOM + PID + family + attempt so
    # each try uses a unique email (avoids the unique-index collision
    # even if a previous attempt eventually succeeded server-side).
    local EMAIL="probe-$(date +%s%N)-$RANDOM-$$-${MODEL_FAMILY:-auto}-$DOMAIN-$VARIANT-a${ATTEMPT}@automl.test"
    curl -s -m 30 -X POST "$BASE/api/auth/register" \
      -H 'Content-Type: application/json' \
      -d "{\"email\":\"$EMAIL\",\"password\":\"Probe2026!\",\"name\":\"Robustness Probe\"}" \
      > "$OUT/01_register.json"
    TOKEN=$(python3 -c "import json;d=json.load(open('$OUT/01_register.json'));print(d.get('accessToken',''))" 2>/dev/null)
    [ -n "$TOKEN" ] && break
    sleep 2
  done
  [ -z "$TOKEN" ] && { fail "$DOMAIN/$VARIANT register (after 3 attempts)"; row "$DOMAIN" "$VARIANT" "register" "FAIL" "3 attempts exhausted" ""; return; }
  row "$DOMAIN" "$VARIANT" "register" "PASS" "attempt=$ATTEMPT" ""

  info "$DOMAIN/$VARIANT — create project"
  curl -s -m 10 -X POST "$BASE/api/projects" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"name\":\"robustness-$DOMAIN-$VARIANT\",\"metadata\":{\"unlockedPhases\":[\"upload\",\"data-viewer\",\"preprocessing\",\"feature-engineering\",\"training\",\"experiments\",\"deployment\"],\"completedPhases\":[],\"currentPhase\":\"data-viewer\"}}" \
    > "$OUT/02_project.json"
  local PROJECT_ID
  PROJECT_ID=$(python3 -c "import json;d=json.load(open('$OUT/02_project.json'));print(d.get('project',{}).get('id',''))")
  [ -z "$PROJECT_ID" ] && { fail "$DOMAIN/$VARIANT project"; row "$DOMAIN" "$VARIANT" "project" "FAIL" "" ""; return; }
  row "$DOMAIN" "$VARIANT" "project" "PASS" "" ""

  info "$DOMAIN/$VARIANT — upload $FILENAME"
  local CTYPE
  CTYPE=$(content_type_for "$FILENAME")
  curl -s -m 60 -X POST "$BASE/api/upload/dataset" \
    -H "Authorization: Bearer $TOKEN" \
    -F "projectId=$PROJECT_ID" \
    -F "file=@$FILE_PATH;type=$CTYPE" \
    > "$OUT/03_upload.json"
  local DATASET_ID
  DATASET_ID=$(python3 -c "
import json
try:
  d=json.load(open('$OUT/03_upload.json'))
  print((d.get('dataset') or {}).get('datasetId',''))
except: print('')")
  if [ -z "$DATASET_ID" ]; then
    fail "$DOMAIN/$VARIANT upload"
    row "$DOMAIN" "$VARIANT" "upload" "FAIL" "$(head -c 200 "$OUT/03_upload.json")" ""
    return
  fi
  row "$DOMAIN" "$VARIANT" "upload" "PASS" "" "$DATASET_ID"

  info "$DOMAIN/$VARIANT — EDA sample"
  curl -s -m 10 "$BASE/api/datasets/$DATASET_ID/sample" \
    -H "Authorization: Bearer $TOKEN" \
    > "$OUT/04_sample.json"
  local ROW_COUNT
  ROW_COUNT=$(python3 -c "
import json
try:
  d=json.load(open('$OUT/04_sample.json'))
  rows=d.get('sample') or d.get('rows') or d.get('sampleRows') or []
  print(len(rows))
except: print(0)")
  if [ "$ROW_COUNT" = "0" ]; then
    fail "$DOMAIN/$VARIANT eda (0 rows)"
    row "$DOMAIN" "$VARIANT" "eda" "FAIL" "$(head -c 200 "$OUT/04_sample.json")" "$DATASET_ID"
    return
  fi
  pass "$DOMAIN/$VARIANT eda ($ROW_COUNT rows)"
  row "$DOMAIN" "$VARIANT" "eda" "PASS" "$ROW_COUNT rows" "$DATASET_ID"

  [ "${INCLUDE_PREPROCESS:-1}" = "0" ] && return
  local TARGET
  TARGET=$(target_for "$DOMAIN")

  # ---- Preprocessing phase ------------------------------------------
  info "$DOMAIN/$VARIANT — preprocessing workflow"
  curl -s -N -m 180 -X POST "$BASE/api/workflows/turns/stream" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"projectId\":\"$PROJECT_ID\",\"phase\":\"preprocessing\",\"datasetId\":\"$DATASET_ID\",\"targetColumn\":\"$TARGET\",\"prompt\":\"Drop rows with missing values and one-hot encode any categorical columns.\"}" \
    > "$OUT/05_preprocess.ndjson" 2>&1
  local PREP_STATUS
  PREP_STATUS=$(python3 -c "
import json
last=''
for line in open('$OUT/05_preprocess.ndjson'):
    try:
        e=json.loads(line)
        s=e.get('state',{}).get('status')
        if s: last=s
    except: pass
print(last)")
  if [ "$PREP_STATUS" = "completed" ] || [ "$PREP_STATUS" = "paused" ]; then
    pass "$DOMAIN/$VARIANT preprocessing ($PREP_STATUS)"
    row "$DOMAIN" "$VARIANT" "preprocessing" "PASS" "$PREP_STATUS" "$DATASET_ID"
  else
    local ERR
    ERR=$(python3 -c "
import json
last=''
for line in open('$OUT/05_preprocess.ndjson'):
    try:
        e=json.loads(line)
        if e.get('type')=='workflow_error':
            last=e.get('message','')
    except: pass
print(last[:200])")
    fail "$DOMAIN/$VARIANT preprocessing ($PREP_STATUS): $ERR"
    row "$DOMAIN" "$VARIANT" "preprocessing" "FAIL" "$PREP_STATUS: $ERR" "$DATASET_ID"
    [ "${STOP_ON_FAIL:-0}" = "1" ] && return
  fi

  # ---- Feature Engineering phase ------------------------------------
  # Gated on INCLUDE_FE (default 0). The LLM proposes engineered features,
  # we extract the features from the workflow stream, then POST /apply to
  # materialize them into a new derived dataset. Parallels the preprocess
  # → apply pattern from phase 5 but with feature specs (code, method).
  if [ "${INCLUDE_FE:-0}" = "1" ]; then
    info "$DOMAIN/$VARIANT — feature engineering workflow"
    # Preprocessing's derived dataset id is now in run.activeDatasetId
    # of the preprocessing run. Easier path: ask the backend which
    # dataset the project currently uses. The project endpoint returns
    # the most recent derived dataset via its metadata.
    local FE_DATASET_ID="$DATASET_ID"
    local LATEST_DS
    LATEST_DS=$(curl -s -m 5 "$BASE/api/datasets?projectId=$PROJECT_ID" -H "Authorization: Bearer $TOKEN" \
      | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    rows=d.get('datasets') or d if isinstance(d,list) else d.get('datasets',[])
    # pick newest derived (metadata.derivedFrom set)
    der=[r for r in rows if r.get('metadata',{}).get('derivedFrom')]
    if der:
        der.sort(key=lambda r: r.get('createdAt',''), reverse=True)
        print(der[0].get('datasetId',''))
    else:
        print('')
except: print('')")
    [ -n "$LATEST_DS" ] && FE_DATASET_ID="$LATEST_DS"

    curl -s -N -m 180 -X POST "$BASE/api/workflows/turns/stream" \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d "{\"projectId\":\"$PROJECT_ID\",\"phase\":\"feature_engineering\",\"datasetId\":\"$FE_DATASET_ID\",\"targetColumn\":\"$TARGET\",\"prompt\":\"Propose 3 engineered features that should help predict $TARGET. Favor interaction terms and ratios over aggregations.\"}" \
      > "$OUT/06_fe.ndjson" 2>&1
    local FE_STATUS
    FE_STATUS=$(python3 -c "
import json
last=''
for line in open('$OUT/06_fe.ndjson'):
    try:
        e=json.loads(line)
        s=e.get('state',{}).get('status')
        if s: last=s
    except: pass
print(last)")
    if [ "$FE_STATUS" = "completed" ] || [ "$FE_STATUS" = "paused" ]; then
      pass "$DOMAIN/$VARIANT fe_workflow ($FE_STATUS)"
      row "$DOMAIN" "$VARIANT" "fe_workflow" "PASS" "$FE_STATUS" "$FE_DATASET_ID"

      # Extract proposed features from the stream and POST /apply
      python3 - <<EOF > "$OUT/06b_fe_features.json"
import json
features=[]
seen_ids=set()
for line in open('$OUT/06_fe.ndjson'):
    try:
        e=json.loads(line)
        if e.get('type')!='tool_executed': continue
        c=e.get('call',{})
        if c.get('tool')!='propose_feature': continue
        args=c.get('args',{}) or {}
        spec={
            'sourceColumn': args.get('sourceColumn') or args.get('source_column') or '',
            'secondaryColumn': args.get('secondaryColumn') or args.get('secondary_column'),
            'featureName': args.get('featureName') or args.get('feature_name') or '',
            'method': args.get('method') or 'custom',
            'code': args.get('code') or '',
        }
        # dedupe by featureName
        fname=spec['featureName']
        if fname and fname not in seen_ids and spec['sourceColumn']:
            seen_ids.add(fname)
            features.append({k:v for k,v in spec.items() if v})
    except: pass
print(json.dumps({'features':features[:5]}))
EOF
      local FE_FEATURES_COUNT
      FE_FEATURES_COUNT=$(python3 -c "
import json
d=json.load(open('$OUT/06b_fe_features.json'))
print(len(d.get('features',[])))")
      if [ "$FE_FEATURES_COUNT" -gt "0" ]; then
        python3 -c "
import json
f=json.load(open('$OUT/06b_fe_features.json'))['features']
print(json.dumps({'projectId':'$PROJECT_ID','datasetId':'$FE_DATASET_ID','features':f}))
" > "$OUT/06c_fe_apply_payload.json"
        curl -s -m 120 -X POST "$BASE/api/feature-engineering/apply" \
          -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
          --data-binary @"$OUT/06c_fe_apply_payload.json" \
          > "$OUT/06d_fe_apply.json"
        local FE_APPLY_DS
        FE_APPLY_DS=$(python3 -c "
import json
try:
    d=json.load(open('$OUT/06d_fe_apply.json'))
    print(d.get('dataset',{}).get('datasetId',''))
except: print('')")
        if [ -n "$FE_APPLY_DS" ]; then
          pass "$DOMAIN/$VARIANT fe_apply (new dataset=$FE_APPLY_DS, $FE_FEATURES_COUNT features)"
          row "$DOMAIN" "$VARIANT" "fe_apply" "PASS" "$FE_FEATURES_COUNT features" "$FE_APPLY_DS"
          # Prefer the FE-applied dataset for the subsequent training leg
          DATASET_ID="$FE_APPLY_DS"
        else
          local FE_APPLY_ERR
          FE_APPLY_ERR=$(python3 -c "
import json
try: print(json.load(open('$OUT/06d_fe_apply.json')).get('error','')[:200])
except: print('')")
          fail "$DOMAIN/$VARIANT fe_apply: $FE_APPLY_ERR"
          row "$DOMAIN" "$VARIANT" "fe_apply" "FAIL" "$FE_APPLY_ERR" "$FE_DATASET_ID"
        fi
      else
        fail "$DOMAIN/$VARIANT fe_apply (no propose_feature calls in stream)"
        row "$DOMAIN" "$VARIANT" "fe_apply" "FAIL" "no propose_feature calls found" "$FE_DATASET_ID"
      fi
    else
      local FE_ERR
      FE_ERR=$(python3 -c "
import json
last=''
for line in open('$OUT/06_fe.ndjson'):
    try:
        e=json.loads(line)
        if e.get('type')=='workflow_error': last=e.get('message','')
    except: pass
print(last[:200])")
      fail "$DOMAIN/$VARIANT fe_workflow ($FE_STATUS): $FE_ERR"
      row "$DOMAIN" "$VARIANT" "fe_workflow" "FAIL" "$FE_STATUS: $FE_ERR" "$FE_DATASET_ID"
    fi
  fi

  [ "${INCLUDE_TRAINING:-0}" = "1" ] || return

  # ---- Training phase (two-turn approval) --------------------------
  info "$DOMAIN/$VARIANT — training turn 1"
  # The probe's default prompt is model-agnostic. For model-family sweeps,
  # set MODEL_FAMILY=<name> to request a specific algorithm (e.g.
  # "logistic_regression", "random_forest", "knn", "xgboost", "lightgbm",
  # "catboost", "mlp", "tabtransformer", "fttransformer", "tabnet").
  local TRAIN_PROMPT
  if [ -n "${MODEL_FAMILY:-}" ]; then
    TRAIN_PROMPT="Train a $MODEL_FAMILY model to predict $TARGET. Use the correct task type for the target column."
  else
    TRAIN_PROMPT="Train a model to predict $TARGET. Choose an appropriate algorithm and task type based on the target column profile."
  fi
  curl -s -N -m 180 -X POST "$BASE/api/workflows/turns/stream" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "$(python3 -c "
import json
print(json.dumps({
  'projectId': '$PROJECT_ID',
  'phase': 'training',
  'datasetId': '$DATASET_ID',
  'targetColumn': '$TARGET',
  'prompt': '''$TRAIN_PROMPT'''
}))")" \
    > "$OUT/07_train_turn1.ndjson" 2>&1

  local RUN_ID THREAD_ID EXP_NAME
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
  EXP_NAME=$(python3 -c "
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

  if [ -z "$RUN_ID" ] || [ -z "$EXP_NAME" ]; then
    local TRAIN_ERR
    TRAIN_ERR=$(python3 -c "
import json
last=''
for line in open('$OUT/07_train_turn1.ndjson'):
    try:
        e=json.loads(line)
        if e.get('type')=='workflow_error':
            last=e.get('message','')
    except: pass
print(last[:200])")
    fail "$DOMAIN/$VARIANT training turn1 (no runId/expName): $TRAIN_ERR"
    row "$DOMAIN" "$VARIANT" "training" "FAIL" "turn1: $TRAIN_ERR" "$DATASET_ID"
    return
  fi

  info "$DOMAIN/$VARIANT — training turn 2 (approval)"
  local APPROVAL="Approved. Proceed with training the selected model: $EXP_NAME."
  curl -s -N -m 900 -X POST "$BASE/api/workflows/turns/stream" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"projectId\":\"$PROJECT_ID\",\"phase\":\"training\",\"runId\":\"$RUN_ID\",\"threadId\":\"$THREAD_ID\",\"datasetId\":\"$DATASET_ID\",\"targetColumn\":\"$TARGET\",\"prompt\":$(python3 -c "import json,sys;print(json.dumps(sys.argv[1]))" "$APPROVAL")}" \
    > "$OUT/07_train_turn2.ndjson" 2>&1

  local MODEL_ID
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
  if [ -z "$MODEL_ID" ]; then
    local T2_ERR
    T2_ERR=$(python3 -c "
import json
last=''
for line in open('$OUT/07_train_turn2.ndjson'):
    try:
        e=json.loads(line)
        if e.get('type')=='workflow_error':
            last=e.get('message','')
    except: pass
print(last[:200])")
    fail "$DOMAIN/$VARIANT training turn2 (no modelId): $T2_ERR"
    row "$DOMAIN" "$VARIANT" "training" "FAIL" "turn2: $T2_ERR" "$DATASET_ID"
    return
  fi

  # Poll eval
  local EVAL_STATUS=""
  for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
    curl -s -m 5 "$BASE/api/models/$MODEL_ID" -H "Authorization: Bearer $TOKEN" > "$OUT/07_model.json"
    EVAL_STATUS=$(python3 -c "import json;d=json.load(open('$OUT/07_model.json'));print(d.get('model',{}).get('evaluationStatus',''))")
    [ "$EVAL_STATUS" = "ready" ] && break
    [ "$EVAL_STATUS" = "failed" ] && break
    sleep 15
  done
  if [ "$EVAL_STATUS" = "ready" ]; then
    pass "$DOMAIN/$VARIANT training (modelId=$MODEL_ID eval=ready)"
    row "$DOMAIN" "$VARIANT" "training" "PASS" "modelId=$MODEL_ID" "$DATASET_ID"
  else
    local EVAL_ERR
    EVAL_ERR=$(python3 -c "import json;d=json.load(open('$OUT/07_model.json'));print((d.get('model',{}).get('evaluationError','') or '')[:200])")
    fail "$DOMAIN/$VARIANT training (eval=$EVAL_STATUS): $EVAL_ERR"
    row "$DOMAIN" "$VARIANT" "training" "FAIL" "eval=$EVAL_STATUS: $EVAL_ERR" "$DATASET_ID"
    return
  fi

  # Phase 8: Experiments — verify the /evaluation endpoint surfaces the
  # chart artefacts the Experiments page renders (confusion_matrix/roc_curves
  # for classification, residuals for regression, plus feature_importance,
  # learning_curve, cross_validation). Gated by INCLUDE_EXPERIMENTS so
  # preprocessing-only sweeps stay fast.
  [ "${INCLUDE_EXPERIMENTS:-1}" = "0" ] && return
  info "$DOMAIN/$VARIANT — experiments evaluation"
  curl -s -m 10 "$BASE/api/experiments/$MODEL_ID/evaluation" \
    -H "Authorization: Bearer $TOKEN" \
    > "$OUT/09_experiments.json"
  local CHARTS
  CHARTS=$(python3 -c "
import json
d=json.load(open('$OUT/09_experiments.json'))
ev=d.get('evaluation',d) or {}
want_any=['confusion_matrix','roc_curves','residuals','feature_importance','learning_curve','cross_validation']
have=[k for k in want_any if ev.get(k)]
print(','.join(have))
")
  if [ -n "$CHARTS" ]; then
    local CHART_COUNT
    CHART_COUNT=$(echo "$CHARTS" | awk -F, '{print NF}')
    pass "$DOMAIN/$VARIANT experiments ($CHART_COUNT charts: $CHARTS)"
    row "$DOMAIN" "$VARIANT" "experiments" "PASS" "$CHART_COUNT charts: $CHARTS" "$MODEL_ID"
  else
    fail "$DOMAIN/$VARIANT experiments (no charts in evaluation payload)"
    row "$DOMAIN" "$VARIANT" "experiments" "FAIL" "no chart fields in evaluation response" "$MODEL_ID"
  fi

  # Phase 9: Deployment — spin up the inference container, poll until
  # healthy, then POST a sample request to /predict. Gated on
  # INCLUDE_DEPLOY=1 because it requires Docker + ~60s container startup.
  [ "${INCLUDE_DEPLOY:-0}" = "1" ] || return
  info "$DOMAIN/$VARIANT — deployment create"
  curl -s -m 30 -X POST "$BASE/api/deployments" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"modelId\":\"$MODEL_ID\",\"projectId\":\"$PROJECT_ID\",\"name\":\"probe-$DOMAIN-$VARIANT-$(date +%s%N)\"}" \
    > "$OUT/10_deploy.json"
  local DEPLOY_ID
  DEPLOY_ID=$(python3 -c "
import json
try:
    d=json.load(open('$OUT/10_deploy.json'))
    print(d.get('deployment',{}).get('deploymentId',''))
except: print('')")
  if [ -z "$DEPLOY_ID" ]; then
    local DEPLOY_ERR
    DEPLOY_ERR=$(python3 -c "
import json
try: print(json.load(open('$OUT/10_deploy.json')).get('error','')[:200])
except: print('')")
    fail "$DOMAIN/$VARIANT deployment create: $DEPLOY_ERR"
    row "$DOMAIN" "$VARIANT" "deployment" "FAIL" "create: $DEPLOY_ERR" "$MODEL_ID"
    return
  fi

  # Poll deployment status
  local DEPLOY_STATUS=""
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    curl -s -m 5 "$BASE/api/deployments/$DEPLOY_ID" -H "Authorization: Bearer $TOKEN" > "$OUT/10_deploy_status.json"
    DEPLOY_STATUS=$(python3 -c "import json;d=json.load(open('$OUT/10_deploy_status.json'));print(d.get('deployment',{}).get('status',''))" 2>/dev/null)
    [ "$DEPLOY_STATUS" = "healthy" ] && break
    [ "$DEPLOY_STATUS" = "failed" ] && break
    sleep 8
  done
  if [ "$DEPLOY_STATUS" != "healthy" ]; then
    fail "$DOMAIN/$VARIANT deployment (status=$DEPLOY_STATUS)"
    row "$DOMAIN" "$VARIANT" "deployment" "FAIL" "status=$DEPLOY_STATUS" "$DEPLOY_ID"
    return
  fi
  row "$DOMAIN" "$VARIANT" "deployment" "PASS" "healthy" "$DEPLOY_ID"

  # Fetch schema → sampleRequest → POST /predict
  info "$DOMAIN/$VARIANT — deployment /predict"
  curl -s -m 5 "$BASE/api/deployments/$DEPLOY_ID/schema" -H "Authorization: Bearer $TOKEN" > "$OUT/10_schema.json"
  python3 -c "
import json
s=json.load(open('$OUT/10_schema.json'))
print(json.dumps(s.get('sampleRequest',{})))
" > "$OUT/10_predict_payload.json"
  if [ "$(cat $OUT/10_predict_payload.json)" = "{}" ] || [ ! -s "$OUT/10_predict_payload.json" ]; then
    fail "$DOMAIN/$VARIANT deploy predict (no sampleRequest in schema)"
    row "$DOMAIN" "$VARIANT" "deploy_predict" "FAIL" "no sampleRequest" "$DEPLOY_ID"
    return
  fi
  curl -s -m 15 -X POST "$BASE/api/deployments/$DEPLOY_ID/predict" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    --data-binary @"$OUT/10_predict_payload.json" \
    > "$OUT/10_predict.json"
  local PRED_OK
  PRED_OK=$(python3 -c "
import json
try:
    d=json.load(open('$OUT/10_predict.json'))
    # Accept any of these shapes as a success
    if 'prediction' in d or 'predictions' in d or 'result' in d or 'output' in d:
        print('ok')
    elif d.get('error'):
        print('err:' + str(d.get('error'))[:200])
    else:
        print('unknown:' + str(list(d.keys()))[:200])
except: print('parse_error')")
  if [ "$PRED_OK" = "ok" ]; then
    pass "$DOMAIN/$VARIANT deploy /predict"
    row "$DOMAIN" "$VARIANT" "deploy_predict" "PASS" "" "$DEPLOY_ID"
  else
    fail "$DOMAIN/$VARIANT deploy /predict: $PRED_OK"
    row "$DOMAIN" "$VARIANT" "deploy_predict" "FAIL" "$PRED_OK" "$DEPLOY_ID"
  fi
}

if [ ! -d "$DATA_ROOT" ]; then
  echo "[probe] DATA_ROOT missing: $DATA_ROOT"
  exit 2
fi

# Auto-discover domains from DATA_ROOT so the probe works against either the
# v1 suite (tmp/robustness_datasets) or the v2 cross-validation suite
# (tmp/robustness_datasets_v2). Any directory with at least one supported
# file counts as a domain.
DOMAINS=()
while IFS= read -r -d '' dir; do
  DOMAINS+=("$(basename "$dir")")
done < <(find "$DATA_ROOT" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null | sort -z)
if [ ${#DOMAINS[@]} -eq 0 ]; then
  echo "[probe] No domains discovered under $DATA_ROOT"
  exit 2
fi
declare -a VARIANT_PAIRS=(
  "standard standard.csv"
  "bom bom.csv"
  "latin1 latin1.csv"
  "tsv standard.tsv"
  "semicolon semicolon.csv"
  "records records.json"
  "jsonl newline.jsonl"
  "xlsx standard.xlsx"
  "ragged ragged.csv"
  "schema_drift schema_drift.csv"
)

for DOMAIN in "${DOMAINS[@]}"; do
  [ -n "$FILTER_DOMAIN" ] && [ "$FILTER_DOMAIN" != "$DOMAIN" ] && continue
  for VPAIR in "${VARIANT_PAIRS[@]}"; do
    VARIANT=$(echo "$VPAIR" | awk '{print $1}')
    FILENAME=$(echo "$VPAIR" | awk '{print $2}')
    [ -n "$FILTER_VARIANT" ] && [ "$FILTER_VARIANT" != "$VARIANT" ] && continue
    run_cell "$DOMAIN" "$VARIANT" "$FILENAME"
  done
done

echo
echo "================================================================"
echo "Results: $RESULTS_CSV"
python3 -c "
import csv
from collections import defaultdict
counts = defaultdict(lambda: {'PASS':0, 'FAIL':0})
with open('$RESULTS_CSV') as fh:
    for row in csv.DictReader(fh):
        counts[row['phase']][row['status']] += 1
for p in ['register','project','upload','eda','preprocessing','training']:
    c = counts.get(p)
    if c: print(f'  {p:14s} PASS={c[\"PASS\"]:>3}  FAIL={c[\"FAIL\"]:>3}')
"
