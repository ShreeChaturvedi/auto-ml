#!/usr/bin/env python3

from __future__ import annotations

import csv
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from statistics import mean


ROOT = Path(__file__).resolve().parents[2]
FIXTURES_ROOT = ROOT / "fixtures" / "mock-business"
OUTPUT_ROOT = ROOT / "benchmarks" / "data" / "derived" / "novacraft-customer-health-clean" / "v1"
OUTPUT_FILE = OUTPUT_ROOT / "canonical" / "data.csv"
AS_OF_DATE = date(2025, 7, 1)


def parse_date(value: str) -> date | None:
    if not value:
        return None
    return datetime.strptime(value, "%Y-%m-%d").date()


def parse_float(value: str) -> float | None:
    if value == "":
        return None
    return float(value)


def parse_int(value: str) -> int | None:
    if value == "":
        return None
    return int(value)


def parse_bool(value: str) -> bool | None:
    if value == "":
        return None
    if value == "true":
        return True
    if value == "false":
        return False
    raise ValueError(f"Unexpected boolean value: {value!r}")


def fmt_float(value: float | None, digits: int = 2) -> str:
    if value is None:
        return ""
    return f"{value:.{digits}f}"


def fmt_int(value: int | None) -> str:
    if value is None:
        return ""
    return str(value)


def fmt_bool(value: bool | None) -> str:
    if value is None:
        return ""
    return "true" if value else "false"


def mean_or_none(values: list[float]) -> float | None:
    if not values:
        return None
    return mean(values)


def load_customers() -> dict[str, dict[str, str]]:
    customers_by_id: dict[str, dict[str, str]] = {}
    with (FIXTURES_ROOT / "customers.csv").open(newline="", encoding="utf-8") as handle:
      reader = csv.DictReader(handle)
      for row in reader:
        customer_id = row["customer_id"]
        customers_by_id.setdefault(customer_id, row)
    return customers_by_id


def load_subscriptions() -> dict[str, list[dict[str, str]]]:
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    with (FIXTURES_ROOT / "subscriptions.csv").open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            grouped[row["customer_id"]].append(row)
    return grouped


def load_support_tickets() -> dict[str, list[dict[str, str]]]:
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    with (FIXTURES_ROOT / "support_tickets.csv").open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            created_at = parse_date(row["created_at"])
            if created_at is None or created_at > AS_OF_DATE:
                continue
            grouped[row["customer_id"]].append(row)
    return grouped


def load_usage_metrics() -> dict[str, list[dict[str, str]]]:
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    with (FIXTURES_ROOT / "usage_metrics.csv").open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            month = parse_date(row["month"])
            if month is None or month > AS_OF_DATE:
                continue
            grouped[row["customer_id"]].append(row)
    return grouped


def latest_subscription_features(rows: list[dict[str, str]]) -> dict[str, str]:
    if not rows:
        return {
            "subscription_records_count": "0",
            "active_subscription_count_as_of": "0",
            "latest_plan_name": "",
            "latest_billing_cycle": "",
            "latest_mrr_usd": "",
            "latest_discount_pct": "",
            "latest_seats_purchased": "",
            "latest_auto_renew": "",
            "days_since_latest_subscription_start": "",
            "has_cancellation_history": "false",
        }

    latest = max(rows, key=lambda row: parse_date(row["start_date"]) or date.min)
    active_count = 0
    has_cancellation_history = False
    for row in rows:
        end_date = parse_date(row["end_date"])
        if end_date is None or end_date >= AS_OF_DATE:
            active_count += 1
        if row["cancellation_reason"]:
            has_cancellation_history = True

    latest_start = parse_date(latest["start_date"])
    return {
        "subscription_records_count": str(len(rows)),
        "active_subscription_count_as_of": str(active_count),
        "latest_plan_name": latest["plan_name"],
        "latest_billing_cycle": latest["billing_cycle"],
        "latest_mrr_usd": fmt_float(parse_float(latest["mrr_usd"])),
        "latest_discount_pct": fmt_float(parse_float(latest["discount_pct"])),
        "latest_seats_purchased": fmt_int(parse_int(latest["seats_purchased"])),
        "latest_auto_renew": fmt_bool(parse_bool(latest["auto_renew"])),
        "days_since_latest_subscription_start": fmt_int(
            (AS_OF_DATE - latest_start).days if latest_start else None
        ),
        "has_cancellation_history": "true" if has_cancellation_history else "false",
    }


def ticket_features(rows: list[dict[str, str]]) -> dict[str, str]:
    if not rows:
        return {
            "tickets_last_180d": "0",
            "escalated_ticket_rate_lifetime": "",
            "avg_resolution_hours_lifetime": "",
            "avg_satisfaction_score_lifetime": "",
            "days_since_last_ticket": "",
        }

    cutoff_180d = AS_OF_DATE.toordinal() - 180
    escalated_values: list[float] = []
    resolution_hours: list[float] = []
    satisfaction_scores: list[float] = []
    latest_ticket: date | None = None
    tickets_last_180d = 0

    for row in rows:
        created_at = parse_date(row["created_at"])
        if created_at and created_at.toordinal() >= cutoff_180d:
            tickets_last_180d += 1
        if created_at and (latest_ticket is None or created_at > latest_ticket):
            latest_ticket = created_at

        escalated = parse_bool(row["escalated"])
        if escalated is not None:
            escalated_values.append(1.0 if escalated else 0.0)

        resolution = parse_float(row["resolution_hours"])
        if resolution is not None:
            resolution_hours.append(resolution)

        satisfaction = parse_int(row["satisfaction_score"])
        if satisfaction is not None:
            satisfaction_scores.append(float(satisfaction))

    return {
        "tickets_last_180d": str(tickets_last_180d),
        "escalated_ticket_rate_lifetime": fmt_float(mean_or_none(escalated_values), 4),
        "avg_resolution_hours_lifetime": fmt_float(mean_or_none(resolution_hours)),
        "avg_satisfaction_score_lifetime": fmt_float(mean_or_none(satisfaction_scores)),
        "days_since_last_ticket": fmt_int((AS_OF_DATE - latest_ticket).days if latest_ticket else None),
    }


def usage_features(rows: list[dict[str, str]]) -> dict[str, str]:
    if not rows:
        return {
            "usage_months_observed_6m": "0",
            "avg_active_users_3m": "",
            "avg_total_logins_3m": "",
            "avg_projects_created_3m": "",
            "avg_tasks_completed_3m": "",
            "avg_storage_used_gb_3m": "",
            "avg_api_calls_3m": "",
            "avg_integrations_active_3m": "",
            "avg_session_minutes_3m": "",
            "avg_feature_adoption_pct_3m": "",
            "avg_nps_response_6m": "",
            "total_exports_6m": "0",
            "days_since_last_usage_month": "",
        }

    months_sorted = sorted(rows, key=lambda row: parse_date(row["month"]) or date.min)
    latest_month = parse_date(months_sorted[-1]["month"])
    recent_3m = months_sorted[-3:]
    recent_6m = months_sorted[-6:]

    def avg_recent(source_rows: list[dict[str, str]], field: str, parser) -> str:
        values = [parser(row[field]) for row in source_rows]
        numeric = [float(value) for value in values if value is not None]
        return fmt_float(mean_or_none(numeric))

    total_exports = 0
    nps_values: list[float] = []
    for row in recent_6m:
        export_count = parse_int(row["export_count"])
        if export_count is not None:
            total_exports += export_count
        nps = parse_int(row["nps_response"])
        if nps is not None:
            nps_values.append(float(nps))

    return {
        "usage_months_observed_6m": str(len(recent_6m)),
        "avg_active_users_3m": avg_recent(recent_3m, "active_users", parse_int),
        "avg_total_logins_3m": avg_recent(recent_3m, "total_logins", parse_int),
        "avg_projects_created_3m": avg_recent(recent_3m, "projects_created", parse_int),
        "avg_tasks_completed_3m": avg_recent(recent_3m, "tasks_completed", parse_int),
        "avg_storage_used_gb_3m": avg_recent(recent_3m, "storage_used_gb", parse_float),
        "avg_api_calls_3m": avg_recent(recent_3m, "api_calls", parse_int),
        "avg_integrations_active_3m": avg_recent(recent_3m, "integrations_active", parse_int),
        "avg_session_minutes_3m": avg_recent(recent_3m, "avg_session_minutes", parse_float),
        "avg_feature_adoption_pct_3m": avg_recent(recent_3m, "feature_adoption_pct", parse_float),
        "avg_nps_response_6m": fmt_float(mean_or_none(nps_values)),
        "total_exports_6m": str(total_exports),
        "days_since_last_usage_month": fmt_int(
            (AS_OF_DATE - latest_month).days if latest_month else None
        ),
    }


def build_row(
    customer: dict[str, str],
    subscriptions: list[dict[str, str]],
    tickets: list[dict[str, str]],
    usage: list[dict[str, str]],
) -> dict[str, str]:
    signup_date = parse_date(customer["signup_date"])
    churn_risk_flag = "true" if not parse_bool(customer["is_active"]) else "false"

    row = {
        "industry": customer["industry"],
        "company_size": customer["company_size"],
        "country": customer["country"],
        "plan_tier": customer["plan_tier"],
        "annual_revenue_usd": fmt_float(parse_float(customer["annual_revenue_usd"])),
        "employee_count": fmt_int(parse_int(customer["employee_count"])),
        "acquisition_channel": customer["acquisition_channel"],
        "has_account_manager": "true" if customer["account_manager"] else "false",
        "tenure_days": fmt_int((AS_OF_DATE - signup_date).days if signup_date else None),
    }
    row.update(latest_subscription_features(subscriptions))
    row.update(ticket_features(tickets))
    row.update(usage_features(usage))
    row["churn_risk_flag"] = churn_risk_flag
    return row


def main() -> None:
    customers = load_customers()
    subscriptions = load_subscriptions()
    tickets = load_support_tickets()
    usage = load_usage_metrics()

    fieldnames = [
        "industry",
        "company_size",
        "country",
        "plan_tier",
        "annual_revenue_usd",
        "employee_count",
        "acquisition_channel",
        "has_account_manager",
        "tenure_days",
        "subscription_records_count",
        "active_subscription_count_as_of",
        "latest_plan_name",
        "latest_billing_cycle",
        "latest_mrr_usd",
        "latest_discount_pct",
        "latest_seats_purchased",
        "latest_auto_renew",
        "days_since_latest_subscription_start",
        "has_cancellation_history",
        "tickets_last_180d",
        "escalated_ticket_rate_lifetime",
        "avg_resolution_hours_lifetime",
        "avg_satisfaction_score_lifetime",
        "days_since_last_ticket",
        "usage_months_observed_6m",
        "avg_active_users_3m",
        "avg_total_logins_3m",
        "avg_projects_created_3m",
        "avg_tasks_completed_3m",
        "avg_storage_used_gb_3m",
        "avg_api_calls_3m",
        "avg_integrations_active_3m",
        "avg_session_minutes_3m",
        "avg_feature_adoption_pct_3m",
        "avg_nps_response_6m",
        "total_exports_6m",
        "days_since_last_usage_month",
        "churn_risk_flag",
    ]

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_FILE.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for customer_id in sorted(customers):
            writer.writerow(
                build_row(
                    customers[customer_id],
                    subscriptions.get(customer_id, []),
                    tickets.get(customer_id, []),
                    usage.get(customer_id, []),
                )
            )


if __name__ == "__main__":
    main()
