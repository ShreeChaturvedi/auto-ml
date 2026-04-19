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

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; RESET='\033[0m'
pass() { echo -e "${GREEN}[PASS]${RESET} $1"; }
fail() { echo -e "${RED}[FAIL]${RESET} $1"; }
info() { echo -e "${YELLOW}[..]${RESET} $1"; }
row()  { echo "$1,$2,$3,$4,\"$(echo "$5" | tr -d '"' | head -c 300)\",$6" >> "$RESULTS_CSV"; }

target_for() {
  case "$1" in
    customer_retention) echo churned ;;
    sensor_readings) echo fault_detected ;;
    messy_survey) echo satisfaction_score ;;
    financial_txns) echo is_fraud ;;
    clinical_records) echo readmitted ;;
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
  local EMAIL="probe-$(date +%s)-$RANDOM-$DOMAIN-$VARIANT@automl.test"
  curl -s -m 10 -X POST "$BASE/api/auth/register" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"Probe2026!\",\"name\":\"Robustness Probe\"}" \
    > "$OUT/01_register.json"
  local TOKEN
  TOKEN=$(python3 -c "import json;d=json.load(open('$OUT/01_register.json'));print(d.get('accessToken',''))")
  [ -z "$TOKEN" ] && { fail "$DOMAIN/$VARIANT register"; row "$DOMAIN" "$VARIANT" "register" "FAIL" "" ""; return; }
  row "$DOMAIN" "$VARIANT" "register" "PASS" "" ""

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
}

if [ ! -d "$DATA_ROOT" ]; then
  echo "[probe] DATA_ROOT missing: $DATA_ROOT"
  exit 2
fi

DOMAINS=(customer_retention sensor_readings messy_survey financial_txns clinical_records)
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
for p in ['register','project','upload','eda']:
    c = counts.get(p)
    if c: print(f'  {p:12s} PASS={c[\"PASS\"]:>3}  FAIL={c[\"FAIL\"]:>3}')
"
