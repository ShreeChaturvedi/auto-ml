#!/usr/bin/env bash
#
# V3 misfit matrix — intentionally wrong-model-for-data combinations.
#
# For each cell the model family is deliberately unsuitable for the
# variant's defect. Expectation is NOT a successful training run — we
# want to see a graceful failure with an actionable error message
# (error code, model row marked failed, no 5xx stack trace). A pass
# here means "the product communicated what's wrong to the user".
#
# 10 cells covering each major failure class:
#   1. xgboost   × class_imbalance     (3 positives in 350 rows → stratified KFold dies)
#   2. knn       × high_cardinality    (KNN distance explodes in 400 dims)
#   3. catboost  × leaky_target        (correctly ranks leak; check confusion is 100%)
#   4. logistic  × heavy_nan           (LR refuses NaN — must impute first or fail cleanly)
#   5. mlp       × string_in_numeric   (non-numeric column can't go through scaler)
#   6. xgboost   × ragged_rows         (upload could fail; we want a specific error)
#   7. catboost  × constant_cols       (zero-variance columns - can it still fit?)
#   8. random_forest × unicode_text    (tree on raw strings → needs encoding)
#   9. logistic  × mixed_dates         (event_date must be dropped or parsed)
#   10. mlp      × class_imbalance     (imbalance + small network = bad calibration)
#
# Usage::
#
#     bash testing/scripts/v3_misfit_matrix.sh
#
# Output: tmp/v3_misfit_<ts>/results.csv + per-cell probe dirs.

set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

BASE="${BASE:-http://localhost:4000}"
DATA_ROOT="${DATA_ROOT:-$ROOT/tmp/v3_dirty_datasets}"
RUN_ROOT="${RUN_ROOT:-$ROOT/tmp/v3_misfit_$(date +%s)}"

export INCLUDE_TRAINING=1
export INCLUDE_EXPERIMENTS=1
export INCLUDE_FE=0
export INCLUDE_PREPROCESS=1

mkdir -p "$RUN_ROOT"
MERGED_CSV="$RUN_ROOT/results.csv"
echo "model,domain,variant,phase,status,detail,datasetId,expected" > "$MERGED_CSV"

# Each line: model domain variant expected_outcome
declare -a MISFIT_CELLS=(
  "xgboost              employee_performance   class_imbalance      graceful_fail_or_weak_model"
  "knn                  telecom_tickets        high_cardinality     graceful_fail_or_drop_ids"
  "catboost             insurance_claims       leaky_target         leak_detected_in_importance"
  "logistic_regression  hospital_readmission   heavy_nan            completed_after_imputation"
  "mlp                  product_reviews        string_in_numeric    graceful_fail_or_coerce"
  "xgboost              product_reviews        ragged_rows          completed_after_upload_skip"
  "catboost             telecom_tickets        constant_cols        completed_constants_ignored"
  "random_forest        employee_performance   unicode_text         completed_unicode_ok"
  "logistic_regression  insurance_claims       mixed_dates          graceful_fail_or_drop_dates"
  "mlp                  hospital_readmission   class_imbalance      completed_imbalance_warned"
)

INDEX=0
TOTAL=${#MISFIT_CELLS[@]}
echo "[v3_misfit] $TOTAL cells"

for CELL in "${MISFIT_CELLS[@]}"; do
  INDEX=$((INDEX + 1))
  MODEL=$(echo "$CELL" | awk '{print $1}')
  DOMAIN=$(echo "$CELL" | awk '{print $2}')
  VARIANT=$(echo "$CELL" | awk '{print $3}')
  EXPECTED=$(echo "$CELL" | awk '{print $4}')

  CELL_ROOT="$RUN_ROOT/$MODEL"
  export RESULTS_ROOT="$CELL_ROOT"
  export MODEL_FAMILY="$MODEL"
  mkdir -p "$RESULTS_ROOT"

  echo
  echo "=================================================================="
  echo "[$INDEX/$TOTAL] MISFIT model=$MODEL domain=$DOMAIN variant=$VARIANT"
  echo "  expected: $EXPECTED"
  echo "=================================================================="

  VARIANT_SET=v3 DATA_ROOT="$DATA_ROOT" RESULTS_ROOT="$RESULTS_ROOT" \
    bash "$ROOT/testing/scripts/multi_dataset_probe.sh" "$DOMAIN" "$VARIANT" \
    2>&1 | tail -40 || true

  CELL_CSV="$RESULTS_ROOT/results.csv"
  if [ -f "$CELL_CSV" ]; then
    tail -n +2 "$CELL_CSV" | while IFS= read -r line; do
      echo "$MODEL,$line,\"$EXPECTED\"" >> "$MERGED_CSV"
    done
  fi
done

echo
echo "=================================================================="
echo "V3 misfit matrix complete → $MERGED_CSV"
echo "=================================================================="

python3 - <<EOF
import csv
path = "$MERGED_CSV"
rows = list(csv.DictReader(open(path)))
print()
print("Per-model final phase reached:")
for r in rows:
    if r["phase"] in ("training", "experiments", "deployment"):
        continue
by_model = {}
for r in rows:
    m = r["model"]; v = r.get("variant", ""); ph = r["phase"]; st = r["status"]
    by_model.setdefault((m, v), []).append((ph, st))
for (m, v), hits in sorted(by_model.items()):
    last = hits[-1] if hits else ("?", "?")
    print(f"  {m:22s} × {v:18s} → last phase {last[0]:12s} status={last[1]}")
EOF
