#!/usr/bin/env python3
"""
NovaCraft B2B SaaS Mock Data Generator
=======================================
Generates five interrelated CSV datasets for the AutoML platform demo.
All datasets share `customer_id` as a join key.

Usage:
    python3 generate_data.py

Requirements:
    pip install faker pandas numpy  (or use stdlib fallback)

Output:
    customers.csv           (~2,500 rows)
    subscriptions.csv       (~3,200 rows)
    support_tickets.csv     (~8,000 rows)
    usage_metrics.csv       (~12,000 rows)
    marketing_campaigns.csv (~500 rows)
"""

import csv
import os
import random
import math
from datetime import datetime, timedelta, date

# Seed for reproducibility
random.seed(42)

# Try importing optional deps; fall back to stdlib if unavailable
try:
    import numpy as np
    np.random.seed(42)
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

try:
    from faker import Faker
    fake = Faker()
    Faker.seed(42)
    HAS_FAKER = True
except ImportError:
    HAS_FAKER = False

# ── Constants ──────────────────────────────────────────────────────────────────

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

INDUSTRIES = [
    "Technology", "Healthcare", "Finance", "Manufacturing", "Retail",
    "Education", "Real Estate", "Logistics", "Media", "Energy",
    "Consulting", "Legal"
]

COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"]
COMPANY_SIZE_WEIGHTS = [0.15, 0.30, 0.30, 0.18, 0.07]

PLAN_TIERS = ["Free", "Starter", "Professional", "Enterprise"]
PLAN_TIER_WEIGHTS = [0.10, 0.30, 0.35, 0.25]
PLAN_MRR_RANGES = {
    "Free": (0, 0),
    "Starter": (29, 99),
    "Professional": (99, 499),
    "Enterprise": (499, 2500),
}

COUNTRIES = [
    "United States", "United Kingdom", "Canada", "Germany", "France",
    "Australia", "Netherlands", "Sweden", "Norway", "Denmark",
    "Spain", "Italy", "Brazil", "Mexico", "India",
    "Japan", "South Korea", "Singapore", "Ireland", "Switzerland",
    "Belgium", "Austria", "Portugal", "Poland", "Czech Republic",
    "New Zealand", "Israel", "United Arab Emirates", "South Africa",
    "Chile", "Colombia", "Argentina", "Finland", "Estonia", "Latvia"
]

ACQUISITION_CHANNELS = [
    "Organic Search", "Paid Search", "Social Media", "Referral",
    "Direct", "Partner", "Content Marketing"
]
CHANNEL_WEIGHTS = [0.25, 0.15, 0.15, 0.15, 0.10, 0.10, 0.10]

ACCOUNT_MANAGERS = [
    "Sarah Chen", "James Rodriguez", "Emily Watson", "Michael Park",
    "Lisa Thompson", "David Kim", "Rachel Green", "Tom Anderson",
    "Priya Sharma", "Marcus Johnson", "Anna Mueller", "Chris Lee",
    "Sofia Martinez", "Kevin O'Brien", "Nina Petrov"
]

BILLING_CYCLES = ["monthly", "annual"]
PAYMENT_METHODS = ["credit_card", "bank_transfer", "paypal", "invoice"]

CANCELLATION_REASONS = [
    "Too expensive", "Switched to competitor", "No longer needed",
    "Missing features", "Poor support", "Company closed",
    "Downgraded to free", "Budget cuts"
]

TICKET_CATEGORIES = [
    "Billing", "Technical", "Feature Request", "Account",
    "Integration", "Performance", "Security", "Onboarding"
]
TICKET_PRIORITIES = ["low", "medium", "high", "critical"]
TICKET_PRIORITY_WEIGHTS = [0.25, 0.40, 0.25, 0.10]

CAMPAIGN_CHANNELS = [
    "Email", "LinkedIn", "Google Ads", "Content", "Webinar", "Events"
]

DATA_SOURCES = [
    "web_signup", "api_import", "csv_upload", "salesforce_sync",
    "hubspot_sync", "manual_entry", "partner_api", "migration_tool",
    "bulk_import", "webhook", "zapier", "segment", "intercom"
]

# Agent names for support tickets
AGENT_NAMES = [
    "A-001", "A-002", "A-003", "A-004", "A-005",
    "A-006", "A-007", "A-008", "A-009", "A-010",
    "A-011", "A-012", "A-013", "A-014", "A-015",
    "A-016", "A-017", "A-018", "A-019", "A-020",
    "A-021", "A-022", "A-023", "A-024", "A-025"
]

# ── Helpers ────────────────────────────────────────────────────────────────────

def random_date(start: date, end: date) -> date:
    """Random date between start and end (inclusive)."""
    delta = (end - start).days
    if delta <= 0:
        return start
    return start + timedelta(days=random.randint(0, delta))


def right_skewed(low: float, high: float, alpha: float = 2.0, beta: float = 5.0) -> float:
    """Generate a right-skewed value using beta distribution."""
    return low + random.betavariate(alpha, beta) * (high - low)


def left_skewed(low: float, high: float, alpha: float = 5.0, beta: float = 2.0) -> float:
    """Generate a left-skewed value using beta distribution."""
    return low + random.betavariate(alpha, beta) * (high - low)


def maybe_missing(value, missing_rate: float = 0.05):
    """Return empty string with given probability, else the value."""
    if random.random() < missing_rate:
        return ""
    return value


def generate_company_name(index: int) -> str:
    """Generate a unique company name."""
    if HAS_FAKER:
        return fake.company()
    prefixes = [
        "Apex", "Nova", "Vertex", "Stellar", "Quantum", "Pinnacle",
        "Atlas", "Zenith", "Nexus", "Prism", "Cipher", "Echo",
        "Forge", "Summit", "Harbor", "Beacon", "Vector", "Matrix",
        "Flux", "Core", "Pulse", "Wave", "Arc", "Orbit", "Helix"
    ]
    suffixes = [
        "Solutions", "Technologies", "Systems", "Labs", "Corp",
        "Group", "Inc", "Digital", "Dynamics", "Ventures",
        "Industries", "Partners", "Analytics", "Networks", "Software"
    ]
    p = prefixes[index % len(prefixes)]
    s = suffixes[(index * 7) % len(suffixes)]
    num = index // (len(prefixes) * len(suffixes))
    if num > 0:
        return f"{p} {s} {num}"
    return f"{p} {s}"


def generate_campaign_name(index: int) -> str:
    """Generate a unique campaign name."""
    themes = [
        "Spring Launch", "Winter Promo", "Growth Sprint", "Q1 Push",
        "Brand Awareness", "Lead Gen", "Product Launch", "Renewal Drive",
        "Upsell Blitz", "Holiday Special", "Year End", "Summer Series",
        "Demo Day", "Webinar Series", "Partner Co-market", "ABM Target",
        "Nurture Flow", "Win-back", "Expansion Play", "Trial Convert"
    ]
    years = ["2022", "2023", "2024", "2025"]
    quarters = ["Q1", "Q2", "Q3", "Q4"]
    theme = themes[index % len(themes)]
    year = years[(index // len(themes)) % len(years)]
    quarter = quarters[(index // (len(themes) * len(years))) % len(quarters)]
    suffix = index // (len(themes) * len(years) * len(quarters))
    name = f"{theme} {year} {quarter}"
    if suffix > 0:
        name += f" v{suffix + 1}"
    return name


# ── Data Generation ───────────────────────────────────────────────────────────

def generate_customers(n: int = 2500) -> list[dict]:
    """Generate customer records."""
    print(f"Generating {n} customers...")
    customers = []
    company_names_used = set()

    for i in range(n):
        cid = f"NC-{i + 10001:05d}"

        # Ensure unique company names
        name = generate_company_name(i)
        while name in company_names_used:
            name = name + f" ({random.randint(1, 999)})"
        company_names_used.add(name)

        industry = random.choice(INDUSTRIES)
        company_size = random.choices(COMPANY_SIZES, weights=COMPANY_SIZE_WEIGHTS, k=1)[0]
        country = random.choice(COUNTRIES)
        signup_date = random_date(date(2019, 1, 1), date(2025, 6, 30))
        plan_tier = random.choices(PLAN_TIERS, weights=PLAN_TIER_WEIGHTS, k=1)[0]

        # Revenue: right-skewed with outliers
        base_rev = right_skewed(50_000, 5_000_000, alpha=2, beta=6)
        if random.random() < 0.03:  # 3% outliers
            base_rev *= random.uniform(3, 10)
        annual_revenue = maybe_missing(round(base_rev, 2), missing_rate=0.08)

        # Employee count: right-skewed
        size_map = {"1-10": (3, 10), "11-50": (11, 50), "51-200": (51, 200),
                     "201-1000": (201, 1000), "1000+": (1000, 15000)}
        lo, hi = size_map[company_size]
        emp = int(right_skewed(lo, hi, alpha=2, beta=4))
        employee_count = maybe_missing(emp, missing_rate=0.05)

        acq_channel = random.choices(ACQUISITION_CHANNELS, weights=CHANNEL_WEIGHTS, k=1)[0]
        account_mgr = maybe_missing(random.choice(ACCOUNT_MANAGERS), missing_rate=0.12)

        # Active: ~82% active
        is_active = random.random() < 0.82

        data_source = random.choice(DATA_SOURCES)

        customers.append({
            "customer_id": cid,
            "company_name": name,
            "industry": industry,
            "company_size": company_size,
            "country": country,
            "signup_date": signup_date.isoformat(),
            "plan_tier": plan_tier,
            "annual_revenue_usd": annual_revenue,
            "employee_count": employee_count,
            "acquisition_channel": acq_channel,
            "account_manager": account_mgr,
            "is_active": str(is_active).lower(),
            "region_code": "GLOBAL",  # Constant column (intentional)
            "data_source": data_source,
        })

    # Inject 30 duplicate rows
    for _ in range(30):
        dup = random.choice(customers[:n]).copy()
        customers.append(dup)

    random.shuffle(customers)
    print(f"  → {len(customers)} rows (including 30 duplicates)")
    return customers


def generate_subscriptions(customers: list[dict], target_rows: int = 3200) -> list[dict]:
    """Generate subscription records linked to customers."""
    print(f"Generating ~{target_rows} subscriptions...")
    subscriptions = []
    sub_id = 1

    customer_ids = [c["customer_id"] for c in customers if not any(
        c2["customer_id"] == c["customer_id"] for c2 in customers[:customers.index(c)]
    )]
    # Deduplicate customer IDs
    seen = set()
    unique_cids = []
    for c in customers:
        if c["customer_id"] not in seen:
            seen.add(c["customer_id"])
            unique_cids.append(c)

    # Distribute: most customers get 1 sub, some get 2-3
    rows_left = target_rows
    for c in unique_cids:
        if rows_left <= 0:
            break
        num_subs = random.choices([1, 2, 3], weights=[0.65, 0.25, 0.10], k=1)[0]
        num_subs = min(num_subs, rows_left)

        signup = date.fromisoformat(c["signup_date"])
        plan = c["plan_tier"]

        for j in range(num_subs):
            sid = f"SUB-{sub_id:06d}"
            sub_id += 1

            if j == 0:
                start = signup
                sub_plan = plan
            else:
                start = random_date(signup + timedelta(days=90), min(signup + timedelta(days=365 * j), date(2025, 6, 30)))
                sub_plan = random.choices(PLAN_TIERS, weights=PLAN_TIER_WEIGHTS, k=1)[0]

            billing = random.choices(BILLING_CYCLES, weights=[0.55, 0.45], k=1)[0]

            # MRR based on plan
            lo, hi = PLAN_MRR_RANGES[sub_plan]
            if lo == hi == 0:
                mrr = 0.0
            else:
                mrr = right_skewed(lo, hi, alpha=2, beta=4)
                if random.random() < 0.02:
                    mrr *= random.uniform(1.5, 3)
            mrr_val = maybe_missing(round(mrr, 2), missing_rate=0.03)

            # End date: 40% missing (still active)
            is_active = c["is_active"] == "true"
            if j < num_subs - 1:
                # Earlier subs always ended
                end = random_date(start + timedelta(days=30), start + timedelta(days=365))
                end_date = end.isoformat()
                cancel_reason = random.choice(CANCELLATION_REASONS)
            elif is_active and random.random() < 0.7:
                end_date = ""
                cancel_reason = ""
            else:
                end = random_date(start + timedelta(days=30), min(start + timedelta(days=730), date(2025, 6, 30)))
                end_date = end.isoformat()
                if random.random() < 0.4:
                    cancel_reason = ""
                else:
                    cancel_reason = random.choice(CANCELLATION_REASONS)

            # Ensure ~60% missing for cancellation_reason overall
            if end_date == "":
                cancel_reason = ""

            discount = maybe_missing(
                round(random.betavariate(2, 5) * 50, 1) if random.random() < 0.4 else 0.0,
                missing_rate=0.15
            )
            # Inject discount outliers
            if discount != "" and random.random() < 0.02:
                discount = round(random.uniform(60, 95), 1)

            seats = max(1, int(right_skewed(1, 200, alpha=2, beta=6)))

            payment = random.choice(PAYMENT_METHODS)
            auto_renew = maybe_missing(
                str(random.random() < 0.75).lower(),
                missing_rate=0.02
            )

            subscriptions.append({
                "subscription_id": sid,
                "customer_id": c["customer_id"],
                "plan_name": sub_plan,
                "billing_cycle": billing,
                "mrr_usd": mrr_val,
                "start_date": start.isoformat(),
                "end_date": end_date,
                "cancellation_reason": cancel_reason,
                "discount_pct": discount,
                "seats_purchased": seats,
                "payment_method": payment,
                "auto_renew": auto_renew,
            })
            rows_left -= 1

    print(f"  → {len(subscriptions)} rows")
    return subscriptions


def generate_support_tickets(customers: list[dict], target_rows: int = 8000) -> list[dict]:
    """Generate support ticket records."""
    print(f"Generating ~{target_rows} support tickets...")
    tickets = []
    ticket_id = 1

    # Deduplicate
    seen = set()
    unique_cids = []
    for c in customers:
        if c["customer_id"] not in seen:
            seen.add(c["customer_id"])
            unique_cids.append(c)

    per_customer = target_rows / len(unique_cids)

    for c in unique_cids:
        signup = date.fromisoformat(c["signup_date"])
        # Vary tickets per customer (Poisson-like)
        n_tickets = max(0, int(random.gauss(per_customer, per_customer * 0.6)))
        n_tickets = min(n_tickets, 20)  # Cap per customer

        for _ in range(n_tickets):
            tid = f"TK-{ticket_id:07d}"
            ticket_id += 1

            created = random_date(signup, date(2025, 6, 30))
            category = random.choice(TICKET_CATEGORIES)
            priority = random.choices(TICKET_PRIORITIES, weights=TICKET_PRIORITY_WEIGHTS, k=1)[0]

            # Resolution hours: right-skewed with heavy outliers
            base_hours = right_skewed(0.5, 72, alpha=2, beta=5)
            if priority == "critical":
                base_hours *= 0.5
            elif priority == "low":
                base_hours *= 1.5
            if random.random() < 0.05:  # Heavy outliers
                base_hours *= random.uniform(3, 15)

            # Correlated missingness: resolved_at and resolution_hours missing together
            is_unresolved = random.random() < 0.20
            if is_unresolved:
                resolved_at = ""
                resolution_hours = ""
            else:
                resolve_delta = timedelta(hours=base_hours)
                resolved = datetime.combine(created, datetime.min.time()) + resolve_delta
                resolved_at = resolved.strftime("%Y-%m-%d")
                resolution_hours = round(base_hours, 2)

            # Satisfaction: left-skewed (most are happy), 25% missing
            sat_raw = left_skewed(1, 5, alpha=5, beta=2)
            satisfaction = maybe_missing(int(round(sat_raw)), missing_rate=0.25)

            agent = random.choice(AGENT_NAMES)

            # Escalated: correlated with priority
            escalation_rates = {"low": 0.02, "medium": 0.08, "high": 0.25, "critical": 0.55}
            escalated = random.random() < escalation_rates[priority]

            # Description length: right-skewed
            desc_len = int(right_skewed(20, 2000, alpha=2, beta=5))

            tickets.append({
                "ticket_id": tid,
                "customer_id": c["customer_id"],
                "created_at": created.isoformat(),
                "resolved_at": resolved_at,
                "category": category,
                "priority": priority,
                "resolution_hours": resolution_hours,
                "satisfaction_score": satisfaction,
                "agent_id": agent,
                "escalated": str(escalated).lower(),
                "description_length": desc_len,
            })

    random.shuffle(tickets)
    print(f"  → {len(tickets)} rows")
    return tickets


def generate_usage_metrics(customers: list[dict], target_rows: int = 12000) -> list[dict]:
    """Generate monthly usage metric records."""
    print(f"Generating ~{target_rows} usage metrics...")
    metrics = []

    seen = set()
    unique_customers = []
    for c in customers:
        if c["customer_id"] not in seen:
            seen.add(c["customer_id"])
            unique_customers.append(c)

    # ~5 months per customer on average
    months_per = target_rows / len(unique_customers)

    for c in unique_customers:
        signup = date.fromisoformat(c["signup_date"])
        # Start from signup month
        start_month = date(signup.year, signup.month, 1)
        end_month = date(2025, 6, 1)

        # Generate list of months
        all_months = []
        current = start_month
        while current <= end_month:
            all_months.append(current)
            if current.month == 12:
                current = date(current.year + 1, 1, 1)
            else:
                current = date(current.year, current.month + 1, 1)

        # Sample some months
        n_months = max(1, min(len(all_months), int(random.gauss(months_per, 2))))
        n_months = min(n_months, len(all_months))
        selected = sorted(random.sample(all_months, n_months))

        is_active = c["is_active"] == "true"
        plan = c["plan_tier"]

        # Base activity level by plan
        activity_mult = {"Free": 0.3, "Starter": 0.6, "Professional": 1.0, "Enterprise": 1.5}
        mult = activity_mult.get(plan, 1.0)

        for month in selected:
            active_users = max(1, int(random.gauss(15 * mult, 8)))
            total_logins = max(active_users, int(right_skewed(10, 500 * mult, alpha=2, beta=4)))
            projects = max(0, int(random.gauss(5 * mult, 3)))
            tasks = max(0, int(right_skewed(10, 1000 * mult, alpha=2, beta=5)))
            if random.random() < 0.03:  # Task outliers
                tasks = int(tasks * random.uniform(3, 8))

            storage = maybe_missing(round(right_skewed(0.1, 50 * mult, alpha=2, beta=5), 2), missing_rate=0.07)

            # API calls: extreme right-skew with heavy outliers
            api = max(0, int(right_skewed(0, 5000 * mult, alpha=1.5, beta=6)))
            if random.random() < 0.04:
                api = int(api * random.uniform(5, 20))

            integrations = max(0, int(random.gauss(3 * mult, 2)))

            avg_session = maybe_missing(
                round(max(1, random.gauss(25 * mult, 10)), 1),
                missing_rate=0.10
            )

            feature_adoption = maybe_missing(
                round(min(100, max(0, random.gauss(55 * mult, 20))), 1),
                missing_rate=0.05
            )

            # NPS: 50% missing (critical severity)
            nps = maybe_missing(
                min(10, max(0, int(random.gauss(7, 2)))),
                missing_rate=0.50
            )

            # Export count: near-constant (95% = 0)
            export = 0 if random.random() < 0.95 else random.randint(1, 5)

            metrics.append({
                "customer_id": c["customer_id"],
                "month": month.isoformat(),
                "active_users": active_users,
                "total_logins": total_logins,
                "projects_created": projects,
                "tasks_completed": tasks,
                "storage_used_gb": storage,
                "api_calls": api,
                "integrations_active": integrations,
                "avg_session_minutes": avg_session,
                "feature_adoption_pct": feature_adoption,
                "nps_response": nps,
                "export_count": export,
            })

    random.shuffle(metrics)
    print(f"  → {len(metrics)} rows")
    return metrics


def generate_marketing_campaigns(n: int = 500) -> list[dict]:
    """Generate marketing campaign records."""
    print(f"Generating {n} marketing campaigns...")
    campaigns = []

    for i in range(n):
        cid = f"CMP-{i + 1001:05d}"
        name = generate_campaign_name(i)
        channel = random.choice(CAMPAIGN_CHANNELS)

        start = random_date(date(2022, 1, 1), date(2025, 5, 1))
        duration = random.randint(7, 90)
        end = start + timedelta(days=duration)

        budget = right_skewed(500, 100_000, alpha=2, beta=5)
        if random.random() < 0.03:
            budget *= random.uniform(2, 5)

        leads = max(0, int(right_skewed(5, 500, alpha=2, beta=5)))
        if random.random() < 0.04:
            leads = int(leads * random.uniform(2, 5))

        conversions = max(0, int(leads * random.betavariate(2, 5)))

        if leads > 0:
            cpl = maybe_missing(round(budget / leads, 2), missing_rate=0.08)
        else:
            cpl = maybe_missing(0.0, missing_rate=0.08)

        target_ind = random.choices(
            INDUSTRIES + ["All"],
            weights=[1] * len(INDUSTRIES) + [3],
            k=1
        )[0]

        campaigns.append({
            "campaign_id": cid,
            "campaign_name": name,
            "channel": channel,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "budget_usd": round(budget, 2),
            "leads_generated": leads,
            "conversions": conversions,
            "cost_per_lead": cpl,
            "target_industry": target_ind,
        })

    # Inject 5 duplicate rows
    for _ in range(5):
        dup = random.choice(campaigns[:n]).copy()
        campaigns.append(dup)

    random.shuffle(campaigns)
    print(f"  → {len(campaigns)} rows (including 5 duplicates)")
    return campaigns


def write_csv(filename: str, rows: list[dict]) -> None:
    """Write rows to CSV file."""
    if not rows:
        return
    filepath = os.path.join(OUTPUT_DIR, filename)
    fieldnames = list(rows[0].keys())
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"  ✓ Wrote {filepath} ({len(rows)} rows)")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("NovaCraft B2B SaaS — Mock Data Generator")
    print("=" * 60)
    print()

    # Generate in FK order
    customers = generate_customers(2500)
    subscriptions = generate_subscriptions(customers, 3200)
    tickets = generate_support_tickets(customers, 8000)
    usage = generate_usage_metrics(customers, 12000)
    campaigns = generate_marketing_campaigns(500)

    print()
    print("Writing CSV files...")
    write_csv("customers.csv", customers)
    write_csv("subscriptions.csv", subscriptions)
    write_csv("support_tickets.csv", tickets)
    write_csv("usage_metrics.csv", usage)
    write_csv("marketing_campaigns.csv", campaigns)

    print()
    print("✓ All datasets generated successfully!")
    print()

    # Summary statistics
    print("Summary:")
    print(f"  customers.csv:           {len(customers):>6} rows  (14 columns)")
    print(f"  subscriptions.csv:       {len(subscriptions):>6} rows  (12 columns)")
    print(f"  support_tickets.csv:     {len(tickets):>6} rows  (11 columns)")
    print(f"  usage_metrics.csv:       {len(usage):>6} rows  (13 columns)")
    print(f"  marketing_campaigns.csv: {len(campaigns):>6} rows  (10 columns)")


if __name__ == "__main__":
    main()
