#!/usr/bin/env python3
"""
Generator v2 — cross-validation suite with 5 DIFFERENT domains × same 10 variants.

Purpose: after the v1 suite (`generate_robustness_datasets.py`) has driven
backend fixes, we re-run the robustness probe against a completely
different set of domains/columns/targets to confirm the fixes generalize
beyond the original 5 datasets. Same 10 format/quality variants per
domain so the file-shape coverage matches v1.

Output: tmp/robustness_datasets_v2/<domain>/<variant>.<ext>
        tmp/robustness_datasets_v2/MANIFEST.json

Run:
    testing/.venv/bin/python testing/scripts/generate_robustness_datasets_v2.py

Re-running overwrites everything. Deterministic (seeded per domain).
"""
from __future__ import annotations

import json
import random
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Callable

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
OUT_ROOT = REPO_ROOT / "tmp" / "robustness_datasets_v2"


@dataclass
class Domain:
    key: str
    rows: int
    target: str
    build: Callable[[random.Random], pd.DataFrame]


# ----------------------------------------------------------------------------
#  v2 dataset builders — fully different from v1 (no shared domain keys,
#  column names, or target columns). Each still injects one or more
#  rough-data hooks (missing values, mixed types, unicode, etc.) so the
#  variant writers below have something real to mangle.
# ----------------------------------------------------------------------------

def build_ecommerce_orders(rng: random.Random) -> pd.DataFrame:
    """Order-level conversion. Binary target: completed_purchase."""
    n = 350
    devices = ["desktop", "mobile", "tablet"]
    sources = ["organic", "paid_search", "email", "social", "affiliate", "direct"]
    countries = ["US", "CA", "UK", "DE", "FR", "IT", "ES", "JP"]
    rows = []
    for i in range(n):
        session_minutes = round(rng.expovariate(1 / 8.0), 2)
        items_in_cart = rng.randint(0, 15)
        cart_value = round(rng.uniform(5, 850), 2) if items_in_cart > 0 else 0.0
        is_returning = rng.random() < 0.45
        completed = int(rng.random() < (
            0.08
            + (0.25 if is_returning else 0)
            + (0.002 * session_minutes)
            + (0.05 if items_in_cart >= 2 else 0)
        ))
        rows.append({
            "order_session_id": f"SES-{i:06d}",  # identifier column
            "user_tier": rng.choice(["free", "standard", "gold", "platinum"]),
            "device": rng.choice(devices),
            "traffic_source": rng.choice(sources),
            "country_code": rng.choice(countries),
            "session_minutes": session_minutes,
            "items_in_cart": items_in_cart,
            "cart_value_usd": cart_value,
            "is_returning_customer": is_returning,
            "discount_applied_pct": rng.choice([0, 0, 0, 5, 10, 15, 20]),
            # mixed-locale date format — half ISO, half MM/DD/YYYY
            "order_date": rng.choice([
                (date(2025, 3, 1) + timedelta(days=rng.randint(0, 400))).isoformat(),
                (date(2025, 3, 1) + timedelta(days=rng.randint(0, 400))).strftime("%m/%d/%Y"),
            ]),
            # numeric-as-string accidentally, sometimes None
            "promo_code": None if rng.random() < 0.4 else f"P{rng.randint(1000, 9999):04d}",
            "completed_purchase": completed,
        })
    return pd.DataFrame(rows)


def build_hr_attrition(rng: random.Random) -> pd.DataFrame:
    """Employee attrition. Binary target: left_company."""
    n = 260
    departments = ["Engineering", "Sales", "Marketing", "Operations", "Finance", "HR", "Support"]
    roles = ["Junior", "Mid", "Senior", "Lead", "Manager", "Director"]
    rows = []
    for i in range(n):
        tenure_years = round(rng.uniform(0.1, 22), 1)
        last_promo_years = min(tenure_years, round(rng.expovariate(1 / 2.5), 1))
        engagement_score = rng.randint(1, 10) if rng.random() > 0.06 else None
        # some salary rows are strings like "$95k" to test dtype coercion
        base_salary = rng.randint(45000, 280000)
        if rng.random() < 0.08:
            salary_field = f"${base_salary//1000}k"
        else:
            salary_field = base_salary
        left = int(rng.random() < (
            0.04
            + (0.015 * last_promo_years)
            + (0.05 if engagement_score is not None and engagement_score <= 3 else 0)
        ))
        rows.append({
            "employee_number": f"EMP-{i:05d}",
            "department": rng.choice(departments),
            "role_level": rng.choice(roles),
            "tenure_years": tenure_years,
            "years_since_last_promotion": last_promo_years,
            # Unicode mix in a "manager_name" column (exercises encoding)
            "manager_name": rng.choice([
                "Søren Madsen", "María García", "Léa Dubois", "Jürgen Weber",
                "Ayşe Yıldız", "Miguel Ângelo", "Chloé Martin", "Dieter König",
            ]),
            "base_salary_usd": salary_field,
            "engagement_score": engagement_score,
            "remote_days_per_week": rng.choice([0, 1, 2, 3, 4, 5]),
            "hire_date": (date(2005, 1, 1) + timedelta(days=rng.randint(0, 7_500))).isoformat(),
            "has_stock_options": rng.choice(["yes", "no"]),
            "left_company": left,
        })
    return pd.DataFrame(rows)


def build_loan_default(rng: random.Random) -> pd.DataFrame:
    """Credit default. Binary target: defaulted."""
    n = 450
    purposes = ["home_improve", "debt_consol", "medical", "education", "small_biz", "auto", "other"]
    grades = ["A", "B", "C", "D", "E", "F", "G"]
    rows = []
    for i in range(n):
        income = round(rng.lognormvariate(10.8, 0.45), 2)
        loan_amount = round(rng.uniform(1000, 75_000), 2)
        dti = round(loan_amount / max(income, 1) * 100, 2)
        delinq_2yrs = 0 if rng.random() < 0.82 else rng.randint(1, 6)
        utilization_pct = round(rng.uniform(0, 110), 1)  # can exceed 100
        # inject ~10% missing values in credit_score
        credit_score = rng.randint(520, 820) if rng.random() > 0.1 else None
        defaulted = int(rng.random() < (
            0.05
            + (0.002 * dti)
            + (0.05 * delinq_2yrs)
            + (0.00003 * max(utilization_pct - 60, 0) * 1000)
        ))
        rows.append({
            "loan_application_ref": f"LA-{i:07d}",
            "applicant_age": rng.randint(21, 78),
            "annual_income_usd": income,
            "employment_length_years": rng.choice([0, 0.5, 1, 2, 3, 5, 7, 10, 15, 20]),
            "loan_amount_usd": loan_amount,
            "loan_purpose": rng.choice(purposes),
            "credit_grade": rng.choice(grades),
            "credit_score": credit_score,
            "debt_to_income_pct": dti,
            "delinquencies_last_2yrs": delinq_2yrs,
            "revolving_utilization_pct": utilization_pct,
            # date in DD-Mon-YYYY to mix with the ISO in other domains
            "application_date": (date(2024, 6, 1) + timedelta(days=rng.randint(0, 500))).strftime("%d-%b-%Y"),
            "owns_home": rng.choice(["own", "rent", "mortgage", "other"]),
            "defaulted": defaulted,
        })
    return pd.DataFrame(rows)


def build_marketing_response(rng: random.Random) -> pd.DataFrame:
    """Email campaign response. Ordinal 4-class target: response_tier
    (0=no_open, 1=open, 2=click, 3=convert)."""
    n = 380
    segments = ["new", "active", "lapsed", "vip", "at_risk"]
    subject_styles = ["plain", "personalized", "urgency", "question", "emoji"]
    rows = []
    for i in range(n):
        lifetime_value = round(rng.lognormvariate(5, 1), 2)
        days_since_last_email = rng.randint(0, 120)
        prior_opens = rng.randint(0, 40)
        click_rate = round(prior_opens * rng.uniform(0.05, 0.4), 2)
        has_phone = rng.random() < 0.7
        is_premium = rng.random() < 0.25
        r = rng.random()
        if is_premium and prior_opens > 15:
            tier = 3 if r < 0.4 else 2 if r < 0.7 else 1
        elif prior_opens > 5:
            tier = 2 if r < 0.3 else 1 if r < 0.6 else 0
        else:
            tier = 1 if r < 0.2 else 0
        rows.append({
            "campaign_recipient_id": f"MR-{rng.randint(100000, 999999)}",
            "segment": rng.choice(segments),
            "subject_style": rng.choice(subject_styles),
            "lifetime_value_usd": lifetime_value,
            "days_since_last_email": days_since_last_email,
            "prior_opens_last_90d": prior_opens,
            "prior_click_rate": click_rate,
            "has_verified_phone": has_phone,
            "is_premium_subscriber": is_premium,
            # one non-ASCII string column to exercise encoding variants
            "locale": rng.choice(["en-US", "en-GB", "es-MX", "pt-BR", "fr-CA", "de-DE", "日本語", "한국어"]),
            "send_time_bucket": rng.choice(["early_am", "mid_morning", "lunch", "afternoon", "evening", "late_night"]),
            # mixed-format date (ISO + MM-DD-YYYY)
            "campaign_sent_on": rng.choice([
                (date(2025, 1, 1) + timedelta(days=rng.randint(0, 300))).isoformat(),
                (date(2025, 1, 1) + timedelta(days=rng.randint(0, 300))).strftime("%m-%d-%Y"),
            ]),
            # numeric-as-string with commas
            "message_length_chars": f"{rng.randint(200, 1800):,}" if rng.random() < 0.15 else rng.randint(200, 1800),
            "response_tier": tier,
        })
    return pd.DataFrame(rows)


def build_iot_anomaly(rng: random.Random) -> pd.DataFrame:
    """IoT device telemetry — multivariate anomaly flag.
    Binary target: is_anomaly."""
    n = 520
    device_kinds = ["camera", "thermostat", "lock", "hub", "motion", "plug", "bulb"]
    firmware = ["1.0.0", "1.1.2", "1.2.0", "1.2.1", "2.0.0", "2.1.3"]
    rows = []
    for i in range(n):
        cpu_load_pct = round(rng.uniform(1, 99), 1)
        mem_usage_mb = round(rng.uniform(8, 512), 1)
        # inject ~12% missing values in network_latency_ms
        network_latency_ms = round(rng.gauss(45, 18), 2) if rng.random() > 0.12 else None
        packet_loss_pct = round(max(0, rng.gauss(0.8, 1.6)), 2)
        uptime_hours = round(rng.uniform(0, 9000), 1)
        firmware_ver = rng.choice(firmware)
        is_anomaly = int(
            cpu_load_pct > 90
            or packet_loss_pct > 5
            or (network_latency_ms is not None and network_latency_ms > 200)
            or (firmware_ver == "1.0.0" and rng.random() < 0.4)
        )
        rows.append({
            "device_serial_no": f"DEV-{rng.randint(1, 800):04d}-{i:04d}",
            "device_kind": rng.choice(device_kinds),
            "firmware_version": firmware_ver,
            "installed_region": rng.choice(["na-east", "na-west", "eu-central", "ap-south", "sa-east"]),
            "cpu_load_pct": cpu_load_pct,
            "memory_usage_mb": mem_usage_mb,
            "network_latency_ms": network_latency_ms,
            "packet_loss_pct": packet_loss_pct,
            "uptime_hours": uptime_hours,
            "battery_pct": rng.randint(0, 100) if rng.random() > 0.3 else None,
            # datetime with seconds, different style from other domains
            "telemetry_captured_at": f"2026-{rng.randint(1, 4):02d}-{rng.randint(1, 28):02d} {rng.randint(0, 23):02d}:{rng.randint(0, 59):02d}:{rng.randint(0, 59):02d}",
            # boolean sometimes stored as yes/no, sometimes 0/1 — mixed
            "is_online": rng.choice(["yes", "no", 1, 0]),
            "is_anomaly": is_anomaly,
        })
    return pd.DataFrame(rows)


DOMAINS = [
    Domain("ecommerce_orders", 350, "completed_purchase", build_ecommerce_orders),
    Domain("hr_attrition", 260, "left_company", build_hr_attrition),
    Domain("loan_default", 450, "defaulted", build_loan_default),
    Domain("marketing_response", 380, "response_tier", build_marketing_response),
    Domain("iot_anomaly", 520, "is_anomaly", build_iot_anomaly),
]


# ----------------------------------------------------------------------------
#  Variant writers — same 10 shapes as v1 so the probe doesn't care which
#  generator produced the files.
# ----------------------------------------------------------------------------

def write_standard_csv(df: pd.DataFrame, path: Path) -> None:
    df.to_csv(path, index=False, encoding="utf-8")


def write_bom_csv(df: pd.DataFrame, path: Path) -> None:
    df.to_csv(path, index=False, encoding="utf-8-sig")


def write_latin1_csv(df: pd.DataFrame, path: Path) -> None:
    df.to_csv(path, index=False, encoding="latin-1", errors="replace")


def write_tsv(df: pd.DataFrame, path: Path) -> None:
    df.to_csv(path, index=False, sep="\t", encoding="utf-8")


def write_semicolon_csv(df: pd.DataFrame, path: Path) -> None:
    df.to_csv(path, index=False, sep=";", encoding="utf-8")


def _records_with_null(df: pd.DataFrame) -> list[dict]:
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
    lines = df.to_csv(index=False).splitlines()
    mangled = [lines[0]]
    for i, row in enumerate(lines[1:]):
        if i % 20 == 5:
            parts = row.split(",")
            row = ",".join(parts[:-2])
        if i % 50 == 17:
            row = row.replace(",", ',"', 1) + '"'
        if i == len(lines) - 2:
            row = row + ",,"
        mangled.append(row)
    path.write_text("\n".join(mangled) + "\n", encoding="utf-8")


def write_schema_drift_csv(df: pd.DataFrame, path: Path, rng: random.Random) -> None:
    # rename the first column (typically an identifier) and insert a new mid-file column
    first_col = df.columns[0]
    renamed_col = (
        first_col
        .replace("_id", "_identifier")
        .replace("_ref", "_reference")
        .replace("_no", "_number")
    )
    renamed = df.rename(columns={first_col: renamed_col})
    header = list(renamed.columns) + ["drift_flag"]
    lines = [",".join(header)]
    numeric_cols = [c for c in renamed.columns if renamed[c].dtype.kind in "if"]
    for _, row in renamed.iterrows():
        values = [str(v) if v is not None else "" for v in row.tolist()]
        if rng.random() < 0.5:
            values.append(rng.choice(["A", "B", "C"]))
        # mixed-type injection for the first numeric column, when we have one
        if numeric_cols and rng.random() < 0.05:
            idx_col = renamed.columns.get_loc(numeric_cols[0])
            values[idx_col] = "N/A"
        lines.append(",".join(values))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ----------------------------------------------------------------------------
#  Orchestrator
# ----------------------------------------------------------------------------

VARIANTS: list[tuple[str, str, str]] = [
    ("standard", "standard.csv", "UTF-8 comma-delimited baseline"),
    ("bom", "bom.csv", "UTF-8 with BOM prefix"),
    ("latin1", "latin1.csv", "Windows-1252 / latin-1 encoding"),
    ("tsv", "standard.tsv", "Tab-delimited"),
    ("semicolon", "semicolon.csv", "Semicolon-delimited (European)"),
    ("records", "records.json", "JSON array of records"),
    ("jsonl", "newline.jsonl", "JSON Lines / NDJSON"),
    ("xlsx", "standard.xlsx", "Excel workbook"),
    ("ragged", "ragged.csv", "Rough: dropped fields + stray quote + trailing commas"),
    ("schema_drift", "schema_drift.csv", "Schema drift: renamed ID col, new col mid-file, mixed numeric→string"),
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
        print(f"[generate_v2] {domain.key}: {len(dom_entry['variants'])} variants -> {dom_dir}")

    (OUT_ROOT / "MANIFEST.json").write_text(json.dumps(manifest, indent=2))
    total = sum(len(d["variants"]) for d in manifest["domains"])
    print(f"\n[generate_v2] Done. {total} files under {OUT_ROOT}")


if __name__ == "__main__":
    main()
