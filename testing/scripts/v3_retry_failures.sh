#!/usr/bin/env bash
#
# Re-runs only the (model × domain × variant) triples that failed in a
# previous V3 sweep. Reads the merged results.csv, filters rows where
# phase ∈ {training, experiments, preprocessing} and status=FAIL, and
# invokes the probe once per unique failing triple. Cells that failed
# due to transient infrastructure flakes (backend restart, OpenAI
# timeout, occasional stuck-loop) are the primary target.
#
# Usage::
#
#     bash testing/scripts/v3_retry_failures.sh tmp/v3_sweep1
#
# Results merge into tmp/v3_retry_<ts>/results.csv for triage.

set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

SWEEP_DIR="${1:-}"
if [ -z "$SWEEP_DIR" ] || [ ! -f "$SWEEP_DIR/results.csv" ]; then
  echo "usage: $0 <previous_sweep_dir>  (expects results.csv inside)"
  exit 2
fi

BASE="${BASE:-http://localhost:4000}"
DATA_ROOT="${DATA_ROOT:-$ROOT/tmp/v3_dirty_datasets}"
RUN_ROOT="${RUN_ROOT:-$ROOT/tmp/v3_retry_$(date +%s)}"
export INCLUDE_TRAINING=1
export INCLUDE_EXPERIMENTS=1
export INCLUDE_FE=0
export INCLUDE_PREPROCESS=1

mkdir -p "$RUN_ROOT"
MERGED_CSV="$RUN_ROOT/results.csv"
echo "model,domain,variant,phase,status,detail,datasetId" > "$MERGED_CSV"

# Extract unique (model, domain, variant) triples whose last recorded
# phase is training/preprocessing/experiments with status FAIL.
python3 - <<EOF > "$RUN_ROOT/triples.txt"
import csv
from collections import defaultdict

last_fail: dict[tuple[str, str, str], str] = {}
for row in csv.DictReader(open("$SWEEP_DIR/results.csv")):
    key = (row["model"], row["domain"], row["variant"])
    if row["status"] == "FAIL" and row["phase"] in {"preprocessing", "training", "experiments"}:
        last_fail[key] = row["phase"]

for (m, d, v), ph in sorted(last_fail.items()):
    print(f"{m} {d} {v} {ph}")
EOF

TRIPLES_COUNT=$(wc -l < "$RUN_ROOT/triples.txt" | tr -d ' ')
if [ "$TRIPLES_COUNT" = "0" ]; then
  echo "[v3_retry] no failing triples to retry — sweep was clean"
  exit 0
fi

echo "[v3_retry] retrying $TRIPLES_COUNT failing cell(s) from $SWEEP_DIR"

INDEX=0
while IFS=' ' read -r MODEL DOMAIN VARIANT LAST_PHASE; do
  [ -z "$MODEL" ] && continue
  INDEX=$((INDEX + 1))

  CELL_ROOT="$RUN_ROOT/$MODEL"
  export RESULTS_ROOT="$CELL_ROOT"
  export MODEL_FAMILY="$MODEL"
  mkdir -p "$RESULTS_ROOT"

  echo
  echo "=================================================================="
  echo "[$INDEX/$TRIPLES_COUNT] RETRY model=$MODEL domain=$DOMAIN variant=$VARIANT (prev fail at $LAST_PHASE)"
  echo "=================================================================="

  VARIANT_SET=v3 DATA_ROOT="$DATA_ROOT" RESULTS_ROOT="$RESULTS_ROOT" \
    bash "$ROOT/testing/scripts/multi_dataset_probe.sh" "$DOMAIN" "$VARIANT" \
    2>&1 | tail -40 || true

  CELL_CSV="$RESULTS_ROOT/results.csv"
  if [ -f "$CELL_CSV" ]; then
    tail -n +2 "$CELL_CSV" | while IFS= read -r line; do
      echo "$MODEL,$line" >> "$MERGED_CSV"
    done
  fi
done < "$RUN_ROOT/triples.txt"

echo
echo "=================================================================="
echo "V3 retry complete → $MERGED_CSV"
echo "=================================================================="

python3 - <<EOF
import csv
from collections import defaultdict
counts = defaultdict(lambda: {"PASS": 0, "FAIL": 0})
fails = []
for row in csv.DictReader(open("$MERGED_CSV")):
    counts[row["phase"]][row["status"]] += 1
    if row["status"] == "FAIL":
        fails.append((row["model"], row["domain"], row["variant"], row["phase"], row["detail"][:120]))

print("Per-phase retry totals:")
for p in ["register","project","upload","eda","preprocessing","training","experiments"]:
    c = counts.get(p)
    if c: print(f"  {p:14s} PASS={c['PASS']:>3}  FAIL={c['FAIL']:>3}")

if fails:
    print("\nStill-failing triples (real product bugs candidates):")
    for f in fails[:20]:
        print("  ", f)
else:
    print("\nALL retried triples now PASS — previous failures were transient.")
EOF
