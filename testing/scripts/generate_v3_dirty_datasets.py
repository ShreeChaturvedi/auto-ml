#!/usr/bin/env python3
"""V3 dirty-dataset generator.

Produces 5 brand-new domains × 10 deliberately dirty variants = 50 CSV files
under ``tmp/v3_dirty_datasets/<domain>/<variant>.csv``. Every row is synthetic
but the shape/defects mirror realistic data hazards the training pipeline
must handle (or refuse to handle) gracefully.

Domains (intentionally disjoint from V1 + V2 suites):
  1. employee_performance    → target ``promoted`` (binary)
  2. insurance_claims        → target ``claim_approved`` (binary)
  3. product_reviews         → target ``helpful`` (binary)
  4. hospital_readmission    → target ``readmitted_30d`` (binary)
  5. telecom_tickets         → target ``resolved_same_day`` (binary)

Variants (same set per domain):
  clean, string_in_numeric, unicode_text, mixed_dates, class_imbalance,
  high_cardinality, constant_cols, heavy_nan, ragged_rows, leaky_target.

Defect recipes live in :func:`apply_variant`.

Usage::

    testing/.venv/bin/python testing/scripts/generate_v3_dirty_datasets.py

Output directory is wiped first so the corpus is reproducible byte-for-byte
given the same seed.
"""
from __future__ import annotations

import json
import random
import shutil
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "tmp" / "v3_dirty_datasets"
SEED = 20260420

DOMAIN_SIZES = {
    "employee_performance": 400,
    "insurance_claims": 350,
    "product_reviews": 500,
    "hospital_readmission": 300,
    "telecom_tickets": 450,
}

VARIANTS = [
    "clean",
    "string_in_numeric",
    "unicode_text",
    "mixed_dates",
    "class_imbalance",
    "high_cardinality",
    "constant_cols",
    "heavy_nan",
    "ragged_rows",
    "leaky_target",
]


# ---------------------------------------------------------------------------
# Domain builders — each returns a clean DataFrame + target column name
# ---------------------------------------------------------------------------

def _choice(rng: np.random.Generator, values, n: int, p=None):
    return rng.choice(values, size=n, p=p)


def build_employee_performance(rng: np.random.Generator, n: int) -> tuple[pd.DataFrame, str]:
    dept = _choice(rng, ["engineering", "sales", "hr", "marketing", "operations"], n,
                   p=[0.35, 0.25, 0.12, 0.15, 0.13])
    years = rng.integers(0, 16, size=n)
    projects = rng.poisson(3.5, size=n).astype(int)
    hours = rng.normal(44, 6, size=n).clip(20, 80).round(1)
    review = rng.integers(1, 6, size=n)
    training = rng.gamma(2.0, 8.0, size=n).round(1).clip(0, 160)
    band = _choice(rng, list("ABCDE"), n, p=[0.1, 0.25, 0.35, 0.2, 0.1])
    remote = _choice(rng, ["yes", "no"], n, p=[0.4, 0.6])
    mgr = rng.integers(1, 11, size=n)

    # Target: weighted logistic of review + years + mgr rating
    logit = (review - 3) * 1.1 + (years / 10.0) * 0.8 + (mgr - 5) * 0.3 + rng.normal(0, 0.8, n)
    prob = 1.0 / (1.0 + np.exp(-logit))
    promoted = (rng.random(n) < prob).astype(int)

    df = pd.DataFrame({
        "employee_id": [f"E{i:05d}" for i in range(n)],
        "department": dept,
        "years_at_company": years,
        "num_projects": projects,
        "avg_hours_per_week": hours,
        "last_review_score": review,
        "training_hours": training,
        "salary_band": band,
        "remote_work": remote,
        "manager_rating": mgr,
        "promoted": promoted,
    })
    return df, "promoted"


def build_insurance_claims(rng: np.random.Generator, n: int) -> tuple[pd.DataFrame, str]:
    claim_amount = rng.lognormal(7.5, 0.9, size=n).round(2)
    years_active = rng.integers(0, 21, size=n)
    prior_claims = rng.poisson(1.2, size=n).astype(int)
    claim_type = _choice(rng, ["auto", "home", "life", "health"], n, p=[0.4, 0.25, 0.15, 0.2])
    region = _choice(rng, ["north", "south", "east", "west"], n)
    age_bracket = _choice(rng, ["18-29", "30-44", "45-59", "60+"], n, p=[0.2, 0.35, 0.3, 0.15])
    tier = _choice(rng, ["basic", "standard", "premium", "platinum"], n, p=[0.3, 0.35, 0.25, 0.1])
    doc_score = rng.normal(65, 15, size=n).clip(0, 100).round(1)
    notes_len = rng.poisson(180, size=n).astype(int)

    # Approval: higher doc_score + fewer priors + lower claim amount → approve
    logit = (doc_score - 60) * 0.04 - prior_claims * 0.4 - (np.log(claim_amount) - 7) * 0.25 + rng.normal(0, 0.7, n)
    prob = 1.0 / (1.0 + np.exp(-logit))
    approved = (rng.random(n) < prob).astype(int)

    df = pd.DataFrame({
        "policy_id": [f"P{i:06d}" for i in range(n)],
        "claim_amount": claim_amount,
        "years_active": years_active,
        "num_prior_claims": prior_claims,
        "claim_type": claim_type,
        "region": region,
        "age_bracket": age_bracket,
        "policy_tier": tier,
        "documentation_score": doc_score,
        "inspector_notes_length": notes_len,
        "claim_approved": approved,
    })
    return df, "claim_approved"


def build_product_reviews(rng: np.random.Generator, n: int) -> tuple[pd.DataFrame, str]:
    category = _choice(rng, ["electronics", "books", "clothing", "home", "toys", "beauty"], n)
    rating = rng.integers(1, 6, size=n)
    verified = _choice(rng, ["y", "n"], n, p=[0.7, 0.3])
    length = rng.lognormal(5.5, 0.8, size=n).round().astype(int).clip(10, 8000)
    has_media = _choice(rng, ["y", "n"], n, p=[0.25, 0.75])
    votes = rng.poisson(3.0, size=n).astype(int)
    reviewer_rank = rng.integers(1, 10001, size=n)
    age_days = rng.integers(1, 720, size=n)
    sentiment = rng.normal(0.1, 0.5, size=n).clip(-1.0, 1.0).round(3)

    # Helpful: longer review + higher rating + has media → helpful
    logit = (length / 1500) + (rating - 3) * 0.5 + (has_media == "y").astype(int) * 0.6 \
            + (sentiment) * 0.8 - np.log1p(reviewer_rank) * 0.05 + rng.normal(0, 0.7, n)
    prob = 1.0 / (1.0 + np.exp(-logit))
    helpful = (rng.random(n) < prob).astype(int)

    df = pd.DataFrame({
        "review_id": [f"R{i:06d}" for i in range(n)],
        "product_category": category,
        "rating": rating,
        "verified_purchase": verified,
        "review_length_chars": length,
        "has_media": has_media,
        "helpful_votes": votes,
        "reviewer_rank": reviewer_rank,
        "review_age_days": age_days,
        "sentiment_score": sentiment,
        "helpful": helpful,
    })
    return df, "helpful"


def build_hospital_readmission(rng: np.random.Generator, n: int) -> tuple[pd.DataFrame, str]:
    age = rng.integers(18, 96, size=n)
    los = rng.gamma(1.8, 2.5, size=n).round(1).clip(0.5, 40)
    diagnoses = rng.poisson(4.5, size=n).astype(int)
    procedures = rng.poisson(2.0, size=n).astype(int)
    discharge = _choice(rng, ["home", "rehab", "snf", "hospice", "home_health"], n,
                        p=[0.55, 0.15, 0.15, 0.05, 0.10])
    insurance = _choice(rng, ["medicare", "medicaid", "private", "self_pay"], n)
    er_visits = rng.poisson(0.6, size=n).astype(int)
    med_count = rng.poisson(6.0, size=n).astype(int)
    vitals_abnormal = rng.poisson(1.2, size=n).astype(int)

    logit = (los / 5) + (age - 60) * 0.03 + (er_visits) * 0.6 + (vitals_abnormal) * 0.4 \
            + rng.normal(0, 0.8, n)
    prob = 1.0 / (1.0 + np.exp(-logit))
    readmitted = (rng.random(n) < prob).astype(int)

    df = pd.DataFrame({
        "patient_id": [f"PT{i:05d}" for i in range(n)],
        "age": age,
        "length_of_stay_days": los,
        "num_diagnoses": diagnoses,
        "num_procedures": procedures,
        "discharge_type": discharge,
        "insurance_type": insurance,
        "emergency_visits_prior_year": er_visits,
        "medication_count": med_count,
        "vitals_abnormal_count": vitals_abnormal,
        "readmitted_30d": readmitted,
    })
    return df, "readmitted_30d"


def build_telecom_tickets(rng: np.random.Generator, n: int) -> tuple[pd.DataFrame, str]:
    category = _choice(rng, ["billing", "outage", "tech_support", "account"], n)
    priority = _choice(rng, ["low", "medium", "high", "urgent"], n, p=[0.3, 0.35, 0.25, 0.1])
    tenure = rng.integers(0, 121, size=n)
    prior_tickets = rng.poisson(1.4, size=n).astype(int)
    first_response = rng.gamma(2.0, 15.0, size=n).round(1).clip(1, 600)
    plan = _choice(rng, ["basic", "pro", "business", "enterprise"], n, p=[0.45, 0.3, 0.15, 0.1])
    desc_len = rng.lognormal(5.2, 0.5, size=n).round().astype(int).clip(10, 3000)
    escalation = _choice(rng, ["y", "n"], n, p=[0.15, 0.85])
    hour = rng.integers(0, 24, size=n)

    # Same-day resolution: low priority + short first response + common category
    simple = ((category == "billing") | (category == "account")).astype(int)
    logit = simple * 0.8 - (priority == "urgent").astype(int) * 1.2 \
            - (first_response / 120) + (plan == "enterprise").astype(int) * 0.5 \
            + rng.normal(0, 0.7, n)
    prob = 1.0 / (1.0 + np.exp(-logit))
    resolved = (rng.random(n) < prob).astype(int)

    df = pd.DataFrame({
        "ticket_id": [f"T{i:07d}" for i in range(n)],
        "category": category,
        "priority": priority,
        "customer_tenure_months": tenure,
        "prior_tickets_30d": prior_tickets,
        "first_response_minutes": first_response,
        "plan_tier": plan,
        "description_length": desc_len,
        "has_escalation": escalation,
        "opened_hour": hour,
        "resolved_same_day": resolved,
    })
    return df, "resolved_same_day"


DOMAIN_BUILDERS: dict[str, Callable[[np.random.Generator, int], tuple[pd.DataFrame, str]]] = {
    "employee_performance": build_employee_performance,
    "insurance_claims": build_insurance_claims,
    "product_reviews": build_product_reviews,
    "hospital_readmission": build_hospital_readmission,
    "telecom_tickets": build_telecom_tickets,
}


# ---------------------------------------------------------------------------
# Dirty variant recipes
# ---------------------------------------------------------------------------

UNICODE_INJECTIONS = [
    " 🎯", "  ", " \u200b", " \u202e", " é", " ñ", " ü",
    " خ", " 日本語", " 😀",
]


def _inject_string_in_numeric(df: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    df = df.copy()
    numeric_cols = [c for c in df.columns if df[c].dtype.kind in "iuf" and c != df.columns[-1]]
    if not numeric_cols:
        return df
    poison = ["N/A", "unknown", "?", "TBD", "n/a", "-", "missing"]
    for col in rng.choice(numeric_cols, size=min(2, len(numeric_cols)), replace=False):
        df[col] = df[col].astype(object)
        n_poison = max(5, int(0.04 * len(df)))
        idx = rng.choice(len(df), size=n_poison, replace=False)
        for i in idx:
            df.at[i, col] = poison[int(rng.integers(0, len(poison)))]
    return df


def _inject_unicode_text(df: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    df = df.copy()
    string_cols = [c for c in df.columns if df[c].dtype == object]
    if not string_cols:
        return df
    for col in rng.choice(string_cols, size=min(2, len(string_cols)), replace=False):
        if col == df.columns[-1]:
            continue
        n_inject = max(10, int(0.08 * len(df)))
        idx = rng.choice(len(df), size=n_inject, replace=False)
        for i in idx:
            suffix = UNICODE_INJECTIONS[int(rng.integers(0, len(UNICODE_INJECTIONS)))]
            df.at[i, col] = f"{df.at[i, col]}{suffix}"
    return df


def _inject_mixed_dates(df: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    df = df.copy()
    n = len(df)
    base_days = rng.integers(0, 730, size=n)
    dates = []
    formats = [
        lambda d: pd.Timestamp("2024-01-01") + pd.Timedelta(days=int(d)),
        lambda d: (pd.Timestamp("2024-01-01") + pd.Timedelta(days=int(d))).strftime("%m/%d/%Y"),
        lambda d: (pd.Timestamp("2024-01-01") + pd.Timedelta(days=int(d))).strftime("%d-%b-%Y"),
        lambda d: str(int((pd.Timestamp("2024-01-01") + pd.Timedelta(days=int(d))).timestamp())),
    ]
    choice = rng.integers(0, 4, size=n)
    for i, d in enumerate(base_days):
        val = formats[choice[i]](d)
        dates.append(str(val))
    df["event_date"] = dates
    return df


def _force_class_imbalance(df: pd.DataFrame, target: str, rng: np.random.Generator) -> pd.DataFrame:
    df = df.copy()
    n = len(df)
    positives = max(3, int(0.01 * n))
    new_target = np.zeros(n, dtype=int)
    idx = rng.choice(n, size=positives, replace=False)
    new_target[idx] = 1
    df[target] = new_target
    return df


def _inject_high_cardinality(df: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    df = df.copy()
    n = len(df)
    unique_vals = [f"sess-{rng.integers(0, 1_000_000_000)}-{i}" for i in range(n)]
    df.insert(0, "session_id", unique_vals)
    return df


def _inject_constant_cols(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["schema_version"] = "v2.1.0"
    df["source_system"] = "prod-east-1"
    quasi = ["US"] * (len(df) - 3) + ["CA", "MX", "US"]
    df["country_code"] = quasi
    return df


def _inject_heavy_nan(df: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    df = df.copy()
    feature_cols = [c for c in df.columns[:-1] if c.lower() not in {"employee_id", "policy_id",
                                                                    "review_id", "patient_id", "ticket_id"}]
    for col in rng.choice(feature_cols, size=min(3, len(feature_cols)), replace=False):
        frac = float(rng.uniform(0.35, 0.55))
        n_nan = int(frac * len(df))
        idx = rng.choice(len(df), size=n_nan, replace=False)
        df.loc[idx, col] = np.nan
    return df


def _inject_leaky_target(df: pd.DataFrame, target: str, rng: np.random.Generator) -> pd.DataFrame:
    df = df.copy()
    n = len(df)
    leak = df[target].to_numpy().copy()
    flip_idx = rng.choice(n, size=int(0.05 * n), replace=False)
    leak[flip_idx] = 1 - leak[flip_idx]
    df["approval_stamp"] = leak
    return df


def _write_ragged_csv(df: pd.DataFrame, path: Path, rng: np.random.Generator) -> None:
    """Manually emit CSV then corrupt ~5% of rows."""
    raw = df.to_csv(index=False)
    lines = raw.splitlines()
    header = lines[0]
    body = lines[1:]
    out_lines = [header]
    for i, line in enumerate(body):
        if rng.random() < 0.05:
            roll = rng.random()
            if roll < 0.33:
                out_lines.append(line + ",,,")
            elif roll < 0.66:
                parts = line.split(",")
                if len(parts) > 2:
                    drop_at = int(rng.integers(0, len(parts) - 1))
                    parts.pop(drop_at)
                    out_lines.append(",".join(parts))
                else:
                    out_lines.append(line)
            else:
                parts = line.split(",")
                if len(parts) > 1:
                    at = int(rng.integers(0, len(parts)))
                    parts[at] = parts[at] + '"stray'
                    out_lines.append(",".join(parts))
                else:
                    out_lines.append(line)
        else:
            out_lines.append(line)
    path.write_text("\n".join(out_lines) + "\n", encoding="utf-8")


def apply_variant(base: pd.DataFrame, target: str, variant: str,
                  rng: np.random.Generator, out_path: Path) -> dict:
    """Mutate a clean DF per the variant recipe and write to ``out_path``.

    Returns a small defect descriptor for the manifest.
    """
    descriptor: dict = {"variant": variant, "rows": len(base)}
    df = base.copy()

    if variant == "clean":
        df.to_csv(out_path, index=False)
    elif variant == "string_in_numeric":
        df = _inject_string_in_numeric(df, rng)
        df.to_csv(out_path, index=False)
        descriptor["note"] = "poison strings in 2 numeric cols"
    elif variant == "unicode_text":
        df = _inject_unicode_text(df, rng)
        df.to_csv(out_path, index=False)
        descriptor["note"] = "unicode/RTL/ZWSP in string cols"
    elif variant == "mixed_dates":
        df = _inject_mixed_dates(df, rng)
        df.to_csv(out_path, index=False)
        descriptor["note"] = "event_date column in 4 formats"
    elif variant == "class_imbalance":
        df = _force_class_imbalance(df, target, rng)
        df.to_csv(out_path, index=False)
        descriptor["note"] = "99:1 class imbalance"
    elif variant == "high_cardinality":
        df = _inject_high_cardinality(df, rng)
        df.to_csv(out_path, index=False)
        descriptor["note"] = "100%-unique session_id as first column"
    elif variant == "constant_cols":
        df = _inject_constant_cols(df)
        df.to_csv(out_path, index=False)
        descriptor["note"] = "3 near-constant columns added"
    elif variant == "heavy_nan":
        df = _inject_heavy_nan(df, rng)
        df.to_csv(out_path, index=False)
        descriptor["note"] = "35-55% NaN in 3 feature cols"
    elif variant == "ragged_rows":
        _write_ragged_csv(df, out_path, rng)
        descriptor["note"] = "5% of rows malformed (extra/missing commas, stray quotes)"
    elif variant == "leaky_target":
        df = _inject_leaky_target(df, target, rng)
        df.to_csv(out_path, index=False)
        descriptor["note"] = "approval_stamp ≈ target (5% flipped)"
    else:
        raise ValueError(f"Unknown variant: {variant}")

    return descriptor


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True)

    manifest: list[dict] = []
    total = 0
    for domain, size in DOMAIN_SIZES.items():
        domain_dir = OUT_DIR / domain
        domain_dir.mkdir()
        rng = np.random.default_rng(SEED + hash(domain) % 10_000)
        base_df, target = DOMAIN_BUILDERS[domain](rng, size)
        for variant in VARIANTS:
            variant_rng = np.random.default_rng(SEED + hash(domain + variant) % 1_000_000)
            out_path = domain_dir / f"{variant}.csv"
            descriptor = apply_variant(base_df, target, variant, variant_rng, out_path)
            descriptor.update({"domain": domain, "target": target, "path": str(out_path.relative_to(ROOT))})
            manifest.append(descriptor)
            total += 1

    manifest_path = OUT_DIR / "MANIFEST.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"Wrote {total} files under {OUT_DIR.relative_to(ROOT)}")
    print(f"Manifest: {manifest_path.relative_to(ROOT)}")


if __name__ == "__main__":
    random.seed(SEED)
    main()
