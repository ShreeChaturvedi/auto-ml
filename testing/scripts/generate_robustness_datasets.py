#!/usr/bin/env python3
"""
Generate 50 data files across 5 domains × 10 format/quality variants.

Output: tmp/robustness_datasets/<domain>/<variant>.<ext>
        tmp/robustness_datasets/MANIFEST.json

Every domain emits the same logical data in 10 variants so we can compare
app behavior across shapes and injected defects. Run from the repo root:

    testing/.venv/bin/python testing/scripts/generate_robustness_datasets.py

Re-running overwrites everything. Deterministic (seeded per domain).
"""
from __future__ import annotations

import csv
import gzip
import io
import json
import random
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Callable

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
OUT_ROOT = REPO_ROOT / "tmp" / "robustness_datasets"


@dataclass
class Domain:
    key: str
    rows: int
    target: str
    build: Callable[[random.Random], pd.DataFrame]


# ----------------------------------------------------------------------------
#  Dataset builders — each produces a clean DataFrame. Variants below then
#  mutate / reformat it into the 10 on-disk shapes.
# ----------------------------------------------------------------------------

def build_customer_retention(rng: random.Random) -> pd.DataFrame:
    n = 300
    regions = ["Northeast", "Midwest", "South", "West", "Mountain"]
    plans = ["Basic", "Plus", "Premium"]
    rows = []
    for i in range(n):
        tenure = rng.randint(1, 72)
        spend = round(rng.uniform(10, 500), 2)
        tickets = rng.randint(0, 20)
        logins = rng.randint(0, 60)
        churned = int(rng.random() < (0.15 + 0.005 * tickets - 0.002 * logins))
        rows.append({
            "customer_id": f"C{i:05d}",
            "region": rng.choice(regions),
            "plan_type": rng.choice(plans),
            "tenure_months": tenure,
            "monthly_spend": spend,
            "support_tickets": tickets,
            "num_logins_30d": logins,
            "auto_pay": rng.choice(["yes", "no"]),
            "signup_date": (date(2022, 1, 1) + timedelta(days=rng.randint(0, 700))).isoformat(),
            "churned": churned,
        })
    return pd.DataFrame(rows)


def build_sensor_readings(rng: random.Random) -> pd.DataFrame:
    n = 500
    rows = []
    for i in range(n):
        temp = round(rng.gauss(22, 4), 2)
        pressure = round(rng.gauss(101.3, 2.5), 2)
        humidity = round(rng.uniform(20, 95), 1)
        # inject ~8% missing values in a numeric column
        vibration = round(rng.gauss(0.5, 0.15), 3) if rng.random() > 0.08 else None
        fault = int(temp > 30 or pressure < 96 or (vibration is not None and vibration > 0.95))
        rows.append({
            "sensor_id": f"S{rng.randint(1, 40):03d}",
            "reading_ts": f"2026-{rng.randint(1, 4):02d}-{rng.randint(1, 28):02d}T{rng.randint(0, 23):02d}:{rng.randint(0, 59):02d}:00",
            "temperature_c": temp,
            "pressure_kpa": pressure,
            "humidity_pct": humidity,
            "vibration_g": vibration,
            "operator": rng.choice(["alpha", "beta", "gamma", "delta"]),
            "shift": rng.choice(["day", "night"]),
            "site_code": f"site_{rng.randint(1, 5)}",
            "fault_detected": fault,
        })
    return pd.DataFrame(rows)


def build_messy_survey(rng: random.Random) -> pd.DataFrame:
    n = 150
    # words with non-ASCII on purpose — exercises encoding handling
    comments = [
        "très satisfait",
        "café was great",
        "Mañana I'll decide",
        "meh — okay-ish",
        "loved it 👍",
        "zero stars 🤬",
        "résumé looked clean",
        "noone answered",
        "would recommend",
        "",
    ]
    ages = [i if rng.random() > 0.05 else None for i in (rng.randint(18, 75) for _ in range(n))]
    rows = []
    for i in range(n):
        rows.append({
            "respondent_uuid": f"R-{rng.randint(10_000, 99_999)}-{rng.randint(100, 999)}",
            "age": ages[i],
            "country": rng.choice(["US", "FR", "DE", "MX", "BR", "JP"]),
            "channel": rng.choice(["email", "web", "phone", "in_person"]),
            "comment": rng.choice(comments),
            "visit_count": rng.randint(1, 20),
            "avg_spend_usd": round(rng.uniform(5, 250), 2),
            "is_member": rng.choice(["true", "false"]),
            "survey_date": (date(2025, 1, 1) + timedelta(days=rng.randint(0, 500))).strftime("%m/%d/%Y"),
            "satisfaction_score": rng.randint(1, 5),
        })
    return pd.DataFrame(rows)


def build_financial_txns(rng: random.Random) -> pd.DataFrame:
    n = 400
    rows = []
    for i in range(n):
        amount = round(rng.lognormvariate(3, 1), 2)
        is_fraud = int(rng.random() < (0.03 + (0.02 if amount > 200 else 0)))
        rows.append({
            "transaction_id": f"TXN-{i:07d}",
            "account_id": f"A{rng.randint(1000, 9999):04d}",
            "merchant": rng.choice(["AMZN", "UBER", "STARBUCKS", "SHELL", "KROGER", "SMALL-BIZ-123"]),
            "category": rng.choice(["food", "gas", "shopping", "travel", "utilities"]),
            "amount_usd": amount,
            "currency": rng.choice(["USD", "USD", "USD", "EUR", "GBP"]),
            # mixed date formats on purpose
            "txn_date": rng.choice([
                (date(2025, 1, 1) + timedelta(days=rng.randint(0, 500))).isoformat(),
                (date(2025, 1, 1) + timedelta(days=rng.randint(0, 500))).strftime("%d-%b-%Y"),
            ]),
            # leading-zero-preserved string
            "zip_code": f"{rng.randint(0, 99999):05d}",
            "card_last4": f"{rng.randint(0, 9999):04d}",
            "country_code": rng.choice(["US", "CA", "MX"]),
            "is_fraud": is_fraud,
        })
    return pd.DataFrame(rows)


def build_clinical_records(rng: random.Random) -> pd.DataFrame:
    n = 200
    rows = []
    for i in range(n):
        age = rng.randint(18, 95)
        stay = rng.randint(1, 45)
        readmit = int(rng.random() < (0.12 + 0.003 * stay + (0.05 if age > 65 else 0)))
        rows.append({
            "patient_id": f"PT-{i:06d}",
            # PII-ish column (email pattern) — should be flagged by identifier guard
            "email": f"patient{i}@example.test",
            "age": age,
            "gender": rng.choice(["M", "F", "O"]),
            "admit_department": rng.choice(["cardio", "neuro", "ortho", "general", "onco"]),
            "length_of_stay_days": stay,
            "num_prior_visits": rng.randint(0, 12),
            "has_insurance": rng.choice(["yes", "no"]),
            "primary_dx_code": rng.choice(["I10", "E11", "J44", "N18", "F32"]),
            # numeric column accidentally stored as string — mixed-type case
            "bmi": f"{round(rng.uniform(16, 45), 1)}" if rng.random() > 0.1 else None,
            "readmitted": readmit,
        })
    return pd.DataFrame(rows)


DOMAINS = [
    Domain("customer_retention", 300, "churned", build_customer_retention),
    Domain("sensor_readings", 500, "fault_detected", build_sensor_readings),
    Domain("messy_survey", 150, "satisfaction_score", build_messy_survey),
    Domain("financial_txns", 400, "is_fraud", build_financial_txns),
    Domain("clinical_records", 200, "readmitted", build_clinical_records),
]


# ----------------------------------------------------------------------------
#  Variant writers
# ----------------------------------------------------------------------------

def write_standard_csv(df: pd.DataFrame, path: Path) -> None:
    df.to_csv(path, index=False, encoding="utf-8")


def write_bom_csv(df: pd.DataFrame, path: Path) -> None:
    df.to_csv(path, index=False, encoding="utf-8-sig")


def write_latin1_csv(df: pd.DataFrame, path: Path) -> None:
    # write with latin-1, which will raise if df has any non-latin1-encodable
    # value. Replace to keep the file valid but encoding non-UTF-8.
    df.to_csv(path, index=False, encoding="latin-1", errors="replace")


def write_tsv(df: pd.DataFrame, path: Path) -> None:
    df.to_csv(path, index=False, sep="\t", encoding="utf-8")


def write_semicolon_csv(df: pd.DataFrame, path: Path) -> None:
    df.to_csv(path, index=False, sep=";", encoding="utf-8")


def _records_with_null(df: pd.DataFrame) -> list[dict]:
    """Convert DataFrame to records but replace NaN/NaT with None so the
    JSON writers emit `null` (valid JSON) instead of `NaN` (JS extension
    that Python's json.loads + the backend both reject)."""
    import math
    records = df.to_dict(orient="records")
    cleaned: list[dict] = []
    for rec in records:
        cleaned.append({
            k: (None if (isinstance(v, float) and math.isnan(v)) else v)
            for k, v in rec.items()
        })
    return cleaned


def write_records_json(df: pd.DataFrame, path: Path) -> None:
    path.write_text(
        json.dumps(_records_with_null(df), ensure_ascii=False, indent=2, default=str)
    )


def write_jsonl(df: pd.DataFrame, path: Path) -> None:
    with path.open("w", encoding="utf-8") as fh:
        for rec in _records_with_null(df):
            fh.write(json.dumps(rec, ensure_ascii=False, default=str) + "\n")


def write_xlsx(df: pd.DataFrame, path: Path) -> None:
    df.to_excel(path, index=False, engine="openpyxl")


def write_ragged_csv(df: pd.DataFrame, path: Path, rng: random.Random) -> None:
    """Rough CSV: random rows get fields dropped, one row has a stray quote,
    last row has trailing commas."""
    lines = df.to_csv(index=False).splitlines()
    mangled = [lines[0]]
    for i, row in enumerate(lines[1:]):
        if i % 20 == 5:
            # drop last 2 fields
            parts = row.split(",")
            row = ",".join(parts[:-2])
        if i % 50 == 17:
            # inject a stray double-quote
            row = row.replace(",", ',"', 1) + '"'
        if i == len(lines) - 2:
            row = row + ",,"
        mangled.append(row)
    path.write_text("\n".join(mangled) + "\n", encoding="utf-8")


def write_schema_drift_csv(df: pd.DataFrame, path: Path, rng: random.Random) -> None:
    """Rename a column (simulating silent schema drift), insert a new column
    mid-file (header says 10, some rows have 10, some 11), and make one
    numeric column contain a few string values."""
    renamed = df.rename(columns={df.columns[0]: df.columns[0].replace("_id", "_identifier").replace("uuid", "identifier")})
    # add a new column to a slice — write the header with it but have some
    # rows missing the trailing field.
    header = list(renamed.columns) + ["drift_flag"]
    lines = [",".join(header)]
    for idx, row in renamed.iterrows():
        values = [str(v) if v is not None else "" for v in row.tolist()]
        if rng.random() < 0.5:
            values.append(rng.choice(["A", "B", "C"]))
        # mixed-type injection for a numeric column
        if "monthly_spend" in renamed.columns and rng.random() < 0.05:
            idx_col = renamed.columns.get_loc("monthly_spend")
            values[idx_col] = "N/A"
        lines.append(",".join(values))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ----------------------------------------------------------------------------
#  Orchestrator
# ----------------------------------------------------------------------------

VARIANTS: list[tuple[str, str, str]] = [
    # (variant_key, filename, description)
    ("standard", "standard.csv", "UTF-8 comma-delimited baseline"),
    ("bom", "bom.csv", "UTF-8 with BOM prefix"),
    ("latin1", "latin1.csv", "Windows-1252 / latin-1 encoding"),
    ("tsv", "standard.tsv", "Tab-delimited"),
    ("semicolon", "semicolon.csv", "Semicolon-delimited (European)"),
    ("records", "records.json", "JSON array of records"),
    ("jsonl", "newline.jsonl", "JSON Lines / NDJSON"),
    ("xlsx", "standard.xlsx", "Excel workbook"),
    ("ragged", "ragged.csv", "Rough: dropped fields + stray quote + trailing commas"),
    ("schema_drift", "schema_drift.csv", "Schema drift: renamed ID column, mid-file new column, mixed numeric→string"),
]


def main() -> None:
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    manifest: dict = {"generated_at": pd.Timestamp.utcnow().isoformat(), "domains": []}

    for domain in DOMAINS:
        rng = random.Random(hash(domain.key) & 0xFFFF_FFFF)
        df = domain.build(rng)
        assert len(df) == domain.rows, f"{domain.key} expected {domain.rows} rows, got {len(df)}"

        dom_dir = OUT_ROOT / domain.key
        dom_dir.mkdir(exist_ok=True)
        dom_entry: dict = {
            "key": domain.key,
            "rows": domain.rows,
            "target": domain.target,
            "columns": list(df.columns),
            "variants": [],
        }

        for variant_key, filename, description in VARIANTS:
            path = dom_dir / filename
            try:
                if variant_key == "standard":
                    write_standard_csv(df, path)
                elif variant_key == "bom":
                    write_bom_csv(df, path)
                elif variant_key == "latin1":
                    write_latin1_csv(df, path)
                elif variant_key == "tsv":
                    write_tsv(df, path)
                elif variant_key == "semicolon":
                    write_semicolon_csv(df, path)
                elif variant_key == "records":
                    write_records_json(df, path)
                elif variant_key == "jsonl":
                    write_jsonl(df, path)
                elif variant_key == "xlsx":
                    write_xlsx(df, path)
                elif variant_key == "ragged":
                    write_ragged_csv(df, path, rng)
                elif variant_key == "schema_drift":
                    write_schema_drift_csv(df, path, rng)
                else:
                    raise ValueError(f"unknown variant {variant_key}")
                size = path.stat().st_size
            except Exception as err:
                dom_entry["variants"].append({
                    "variant": variant_key,
                    "filename": filename,
                    "description": description,
                    "error": f"{type(err).__name__}: {err}",
                })
                continue

            dom_entry["variants"].append({
                "variant": variant_key,
                "filename": filename,
                "description": description,
                "size_bytes": size,
            })

        manifest["domains"].append(dom_entry)
        print(f"[generate] {domain.key}: {len(dom_entry['variants'])} variants written -> {dom_dir}")

    (OUT_ROOT / "MANIFEST.json").write_text(json.dumps(manifest, indent=2))
    total = sum(len(d["variants"]) for d in manifest["domains"])
    print(f"\n[generate] Done. {total} files under {OUT_ROOT}")


if __name__ == "__main__":
    main()
