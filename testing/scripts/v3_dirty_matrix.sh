#!/usr/bin/env bash
#
# V3 dirty-data sweep orchestrator.
#
# For each (domain × variant × model_family) combination it invokes the
# underlying ``multi_dataset_probe.sh`` with VARIANT_SET=v3 and MODEL_FAMILY
# set to the requested algorithm. Results from every cell are merged into a
# single ``results.csv`` so we can triage failures across the whole matrix.
#
# The matrix is bounded by two env vars:
#   MODELS           space-separated model_family names. Default: a 5-model
#                    representative rotation (logistic / rf / xgb / mlp /
#                    catboost) — covers linear, tree, gbm, neural and
#                    categorical-native families.
#   DOMAINS          override the domain list (default: all V3 domains).
#   VARIANTS         override the variant list (default: all 10).
#   INCLUDE_TRAINING forwarded to the probe (default 1).
#   INCLUDE_EXPERIMENTS forwarded (default 1).
#   INCLUDE_FE       forwarded (default 0 — V3 focuses on training/eval).
#   INCLUDE_PREPROCESS forwarded (default 1).
#
# Usage::
#
#     testing/.venv/bin/python testing/scripts/generate_v3_dirty_datasets.py
#     bash testing/scripts/v3_dirty_matrix.sh   # full 5×10×5 = 250 cells
#
# One-model / one-variant drill-downs:
#
#     MODELS="logistic_regression" bash testing/scripts/v3_dirty_matrix.sh
#     MODELS="xgboost" VARIANTS="leaky_target heavy_nan" bash testing/scripts/v3_dirty_matrix.sh
#
# Output: tmp/v3_matrix_<ts>/results.csv + per-cell probe dirs.

set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

BASE="${BASE:-http://localhost:4000}"
DATA_ROOT="${DATA_ROOT:-$ROOT/tmp/v3_dirty_datasets}"
RUN_ROOT="${RUN_ROOT:-$ROOT/tmp/v3_matrix_$(date +%s)}"
MODELS="${MODELS:-logistic_regression random_forest xgboost mlp catboost}"
DOMAINS_OVERRIDE="${DOMAINS:-}"
VARIANTS_OVERRIDE="${VARIANTS:-}"

export INCLUDE_TRAINING="${INCLUDE_TRAINING:-1}"
export INCLUDE_EXPERIMENTS="${INCLUDE_EXPERIMENTS:-1}"
export INCLUDE_FE="${INCLUDE_FE:-0}"
export INCLUDE_PREPROCESS="${INCLUDE_PREPROCESS:-1}"

if [ ! -d "$DATA_ROOT" ]; then
  echo "[v3_matrix] DATA_ROOT missing: $DATA_ROOT"
  echo "[v3_matrix] Run: testing/.venv/bin/python testing/scripts/generate_v3_dirty_datasets.py"
  exit 2
fi

mkdir -p "$RUN_ROOT"
MERGED_CSV="$RUN_ROOT/results.csv"
echo "model,domain,variant,phase,status,detail,datasetId" > "$MERGED_CSV"

# Resolve domain list (either override or auto-discovered from DATA_ROOT).
if [ -n "$DOMAINS_OVERRIDE" ]; then
  DOMAIN_LIST=($DOMAINS_OVERRIDE)
else
  DOMAIN_LIST=()
  while IFS= read -r -d '' dir; do
    DOMAIN_LIST+=("$(basename "$dir")")
  done < <(find "$DATA_ROOT" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null | sort -z)
fi

if [ -n "$VARIANTS_OVERRIDE" ]; then
  VARIANT_LIST=($VARIANTS_OVERRIDE)
else
  VARIANT_LIST=(clean string_in_numeric unicode_text mixed_dates class_imbalance high_cardinality constant_cols heavy_nan ragged_rows leaky_target)
fi

MODEL_LIST=($MODELS)

TOTAL=$(( ${#MODEL_LIST[@]} * ${#DOMAIN_LIST[@]} * ${#VARIANT_LIST[@]} ))
INDEX=0
START_TS=$(date +%s)

echo "[v3_matrix] starting $TOTAL cells: ${#MODEL_LIST[@]} models × ${#DOMAIN_LIST[@]} domains × ${#VARIANT_LIST[@]} variants"
echo "[v3_matrix] models: ${MODEL_LIST[*]}"
echo "[v3_matrix] run root: $RUN_ROOT"

for MODEL in "${MODEL_LIST[@]}"; do
  export MODEL_FAMILY="$MODEL"
  for DOMAIN in "${DOMAIN_LIST[@]}"; do
    for VARIANT in "${VARIANT_LIST[@]}"; do
      INDEX=$((INDEX + 1))
      CELL_ROOT="$RUN_ROOT/$MODEL"
      export RESULTS_ROOT="$CELL_ROOT"
      mkdir -p "$RESULTS_ROOT"

      echo
      echo "=================================================================="
      echo "[$INDEX/$TOTAL] model=$MODEL  domain=$DOMAIN  variant=$VARIANT"
      echo "=================================================================="

      VARIANT_SET=v3 DATA_ROOT="$DATA_ROOT" RESULTS_ROOT="$RESULTS_ROOT" \
        bash "$ROOT/testing/scripts/multi_dataset_probe.sh" "$DOMAIN" "$VARIANT" \
        2>&1 | tail -40 || true

      # Merge per-cell CSV into the combined log, prefixed with the model.
      CELL_CSV="$RESULTS_ROOT/results.csv"
      if [ -f "$CELL_CSV" ]; then
        tail -n +2 "$CELL_CSV" | while IFS= read -r line; do
          echo "$MODEL,$line" >> "$MERGED_CSV"
        done
      fi
    done
  done
done

END_TS=$(date +%s)
ELAPSED=$((END_TS - START_TS))

echo
echo "=================================================================="
echo "V3 matrix complete in ${ELAPSED}s → $MERGED_CSV"
echo "=================================================================="

python3 - <<EOF
import csv
from collections import defaultdict

path = "$MERGED_CSV"
by_model_phase = defaultdict(lambda: defaultdict(lambda: {"PASS": 0, "FAIL": 0}))
by_phase = defaultdict(lambda: {"PASS": 0, "FAIL": 0})
with open(path) as fh:
    for row in csv.DictReader(fh):
        m = row["model"]
        p = row["phase"]
        s = row["status"]
        by_model_phase[m][p][s] = by_model_phase[m][p].get(s, 0) + 1
        by_phase[p][s] = by_phase[p].get(s, 0) + 1

phases = ["register", "project", "upload", "eda", "preprocessing", "training", "experiments", "deployment", "deploy_predict"]

print()
print("Per-phase totals")
print("----------------")
for p in phases:
    c = by_phase.get(p)
    if c:
        total = c["PASS"] + c["FAIL"]
        pct = (100 * c["PASS"] / total) if total else 0
        print(f"  {p:18s} PASS={c['PASS']:>4}  FAIL={c['FAIL']:>4}  ({pct:5.1f}%)")

print()
print("Per-model training/experiments")
print("-----------------------------")
for m in sorted(by_model_phase):
    t = by_model_phase[m].get("training", {"PASS":0, "FAIL":0})
    e = by_model_phase[m].get("experiments", {"PASS":0, "FAIL":0})
    tot_t = t["PASS"] + t["FAIL"]
    print(f"  {m:24s} training {t['PASS']:>2}/{tot_t:<2}   experiments {e['PASS']:>2}")
EOF
