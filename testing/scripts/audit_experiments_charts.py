#!/usr/bin/env python3
"""Deep audit of ``/api/experiments/<modelId>/evaluation`` payloads.

The V3 probe already logs PASS/FAIL for "at least one chart present" per
cell. That check is shallow — it does not prove the charts have real data,
that the leaky-target variant actually surfaces the leak in feature
importance, or that class-imbalance cells still get a confusion matrix.

This script walks a V3 sweep directory, locates every ``09_experiments.json``
under it, and runs a deeper assertion suite per cell:

- ``confusion_matrix`` has a rectangular matrix with >= 2 rows and
  at least one non-zero cell.
- ``roc_curves`` contains fpr / tpr arrays of identical non-trivial length.
- ``feature_importance.model_based`` contains a list of items and, for
  ``leaky_target`` cells, the injected ``approval_stamp`` column
  ranks in the top-3.
- ``learning_curve`` returns >= 3 points in train_sizes.
- ``cross_validation.scores`` has >= 2 numeric scores.

Usage::

    python testing/scripts/audit_experiments_charts.py tmp/v3_sweep1

Output: per-cell audit log + summary to stdout + JSON report at
<sweep>/chart_audit.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


def safe_load(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text())
    except Exception as exc:  # noqa: BLE001 - diagnostics report failure directly
        return {"_error": f"{type(exc).__name__}: {exc}"}


def check_confusion_matrix(cm: Any) -> tuple[bool, str]:
    if not isinstance(cm, dict):
        return False, f"not a dict (type={type(cm).__name__})"
    matrix = cm.get("matrix")
    if not isinstance(matrix, list) or len(matrix) < 2:
        return False, f"matrix missing or too small (rows={len(matrix) if isinstance(matrix, list) else 'n/a'})"
    if not all(isinstance(r, list) for r in matrix):
        return False, "matrix rows not lists"
    # sum of cells should be > 0 (otherwise every prediction was missing)
    total = sum(sum(r) for r in matrix if isinstance(r, list))
    if total <= 0:
        return False, "matrix is all zeros"
    return True, f"{len(matrix)}x{len(matrix[0])}, n={total}"


def check_roc_curves(rc: Any) -> tuple[bool, str]:
    if not isinstance(rc, dict):
        return False, f"not a dict (type={type(rc).__name__})"
    # keyed by positive class label
    for label, data in rc.items():
        if not isinstance(data, dict):
            return False, f"label {label} not a dict"
        fpr = data.get("fpr") or []
        tpr = data.get("tpr") or []
        if len(fpr) < 3 or len(tpr) < 3:
            return False, f"label {label} curve too short (fpr={len(fpr)}, tpr={len(tpr)})"
        if len(fpr) != len(tpr):
            return False, f"label {label} fpr/tpr length mismatch"
    return True, f"{len(rc)} class(es)"


def check_feature_importance(fi: Any, *, is_leaky: bool) -> tuple[bool, str]:
    """Validate feature_importance payload.

    The backend emits parallel arrays:
        {
          "model_based": {"features": [...], "importances": [...]},
          "permutation": {"features": [...], "importances_mean": [...],
                          "importances_std": [...]}
        }

    For the ``leaky_target`` variant we expect the injected ``approval_stamp``
    column (or its ColumnTransformer-prefixed alias ``num__approval_stamp``)
    to rank in the top-3 of either model_based or permutation importance.
    """
    if not isinstance(fi, dict):
        return False, f"not a dict (type={type(fi).__name__})"
    model_based = fi.get("model_based")
    if not isinstance(model_based, dict):
        return False, "model_based missing or not a dict"
    features = model_based.get("features") or []
    importances = model_based.get("importances") or []
    if not features or not importances:
        return False, f"empty arrays (features={len(features)}, importances={len(importances)})"
    if len(features) != len(importances):
        return False, f"length mismatch ({len(features)} vs {len(importances)})"

    def to_float(x: Any) -> float:
        try:
            return float(x)
        except Exception:  # noqa: BLE001
            return 0.0

    pairs = [(str(f), to_float(v)) for f, v in zip(features, importances)]
    pairs.sort(key=lambda item: abs(item[1]), reverse=True)
    top = [name for name, _ in pairs[:3]]

    if is_leaky:
        in_top = any("approval_stamp" in name for name in top)
        if not in_top:
            return False, f"leaky column absent from top-3 (top={top})"

    return True, f"top3={top}"


def check_learning_curve(lc: Any) -> tuple[bool, str]:
    if not isinstance(lc, dict):
        return False, "not a dict"
    ts = lc.get("train_sizes") or []
    if len(ts) < 3:
        return False, f"only {len(ts)} point(s)"
    return True, f"{len(ts)} points"


def check_cross_validation(cv: Any) -> tuple[bool, str]:
    if not isinstance(cv, dict):
        return False, "not a dict"
    scores = cv.get("scores") or []
    if len(scores) < 2:
        return False, f"only {len(scores)} fold(s)"
    return True, f"{len(scores)} folds, mean={cv.get('mean', 'n/a')}"


CHECKS = [
    ("confusion_matrix", check_confusion_matrix, False),
    ("roc_curves", check_roc_curves, False),
    ("learning_curve", check_learning_curve, False),
    ("cross_validation", check_cross_validation, False),
]


def audit_cell(cell_dir: Path) -> dict[str, Any]:
    evaluation_path = cell_dir / "09_experiments.json"
    if not evaluation_path.exists():
        return {"cell": str(cell_dir), "ok": False, "reason": "no evaluation file"}
    body = safe_load(evaluation_path)
    if "_error" in body:
        return {"cell": str(cell_dir), "ok": False, "reason": body["_error"]}
    ev = body.get("evaluation") or body or {}
    results: dict[str, Any] = {"checks": {}}
    all_ok = True

    for chart, func, _ in CHECKS:
        value = ev.get(chart)
        if value is None:
            results["checks"][chart] = {"ok": False, "reason": "missing"}
            all_ok = False
            continue
        ok, detail = func(value)
        results["checks"][chart] = {"ok": ok, "detail": detail}
        if not ok:
            all_ok = False

    variant = cell_dir.name
    is_leaky = variant == "leaky_target"
    fi_value = ev.get("feature_importance")
    if fi_value is None:
        results["checks"]["feature_importance"] = {"ok": False, "reason": "missing"}
        all_ok = False
    else:
        ok, detail = check_feature_importance(fi_value, is_leaky=is_leaky)
        results["checks"]["feature_importance"] = {"ok": ok, "detail": detail}
        if not ok:
            all_ok = False

    model_id = body.get("modelId") or ev.get("modelId") or cell_dir.parent.name
    results.update({
        "cell": str(cell_dir),
        "modelId": model_id,
        "ok": all_ok,
        "is_leaky": is_leaky,
        "compute_ms": ev.get("computeMs"),
    })
    return results


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: audit_experiments_charts.py <v3_sweep_dir>", file=sys.stderr)
        return 2
    root = Path(argv[1]).resolve()
    if not root.exists():
        print(f"no such dir: {root}", file=sys.stderr)
        return 2

    cells: list[Path] = []
    for path in root.rglob("09_experiments.json"):
        cells.append(path.parent)
    if not cells:
        print(f"no 09_experiments.json files found under {root}", file=sys.stderr)
        return 1

    reports: list[dict[str, Any]] = []
    for cell in sorted(cells):
        reports.append(audit_cell(cell))

    ok_count = sum(1 for r in reports if r.get("ok"))
    fail_count = len(reports) - ok_count
    print(f"Audited {len(reports)} cells: {ok_count} OK, {fail_count} FAIL")
    print()
    for report in reports:
        rel = Path(report["cell"]).relative_to(root) if report["cell"] else "?"
        status = "PASS" if report["ok"] else "FAIL"
        print(f"  [{status}] {rel}")
        if not report["ok"]:
            for chart, outcome in report.get("checks", {}).items():
                if not outcome.get("ok"):
                    print(f"      {chart}: {outcome.get('reason') or outcome.get('detail')}")

    out_path = root / "chart_audit.json"
    out_path.write_text(json.dumps(reports, indent=2))
    print()
    print(f"Report: {out_path.relative_to(root.parent)}")
    return 0 if fail_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
