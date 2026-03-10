# NovaCraft B2B SaaS — Mock Data Package

Comprehensive mock data for the AutoML platform, simulating a mid-market B2B SaaS company ("NovaCraft") that provides project management tools to ~2,500 business customers.

## Quick Start

```bash
# Regenerate all datasets (deterministic, seed=42)
pip install faker   # optional, improves company name variety
python3 generate_data.py
```

## Entity Relationship Diagram

```
┌──────────────────┐       ┌────────────────────┐
│   customers      │       │  subscriptions      │
│──────────────────│       │────────────────────│
│ customer_id (PK) │◄──┐   │ subscription_id (PK)│
│ company_name     │   ├───│ customer_id (FK)    │
│ industry         │   │   │ plan_name           │
│ company_size     │   │   │ billing_cycle       │
│ country          │   │   │ mrr_usd             │
│ signup_date      │   │   │ start_date          │
│ plan_tier        │   │   │ end_date            │
│ annual_revenue   │   │   │ cancellation_reason │
│ employee_count   │   │   │ discount_pct        │
│ acq_channel      │   │   │ seats_purchased     │
│ account_manager  │   │   │ payment_method      │
│ is_active        │   │   │ auto_renew          │
│ region_code      │   │   └────────────────────┘
│ data_source      │   │
└──────────────────┘   │   ┌────────────────────┐
                       │   │  support_tickets    │
                       ├───│ ticket_id (PK)      │
                       │   │ customer_id (FK)    │
                       │   │ created_at          │
                       │   │ resolved_at         │
                       │   │ category            │
                       │   │ priority            │
                       │   │ resolution_hours    │
                       │   │ satisfaction_score  │
                       │   │ agent_id            │
                       │   │ escalated           │
                       │   │ description_length  │
                       │   └────────────────────┘
                       │
                       │   ┌────────────────────┐
                       ├───│  usage_metrics      │
                       │   │ customer_id (FK)    │
                       │   │ month               │
                       │   │ active_users        │
                       │   │ total_logins        │
                       │   │ projects_created    │
                       │   │ tasks_completed     │
                       │   │ storage_used_gb     │
                       │   │ api_calls           │
                       │   │ integrations_active │
                       │   │ avg_session_minutes │
                       │   │ feature_adoption_pct│
                       │   │ nps_response        │
                       │   │ export_count        │
                       │   └────────────────────┘
                       │
                       │   ┌────────────────────┐
                       └───│marketing_campaigns  │
                           │ campaign_id (PK)    │
                           │ campaign_name       │
                           │ channel             │
                           │ start_date          │
                           │ end_date            │
                           │ budget_usd          │
                           │ leads_generated     │
                           │ conversions         │
                           │ cost_per_lead       │
                           │ target_industry     │
                           └────────────────────┘
```

> **Note:** `marketing_campaigns` links to customers conceptually via `target_industry` → `industry`, not via a direct FK.

## Datasets

### 1. `customers.csv` (~2,530 rows incl. 30 duplicates)

Primary customer master table. Each row represents a NovaCraft account.

| Column | Type | Description | Notes |
|--------|------|-------------|-------|
| `customer_id` | string | Primary key, format `NC-XXXXX` | |
| `company_name` | string | Business name | High cardinality (~2,500 unique) |
| `industry` | string | Business vertical | 12 categories |
| `company_size` | string | Employee band | Ordinal: 1-10, 11-50, 51-200, 201-1000, 1000+ |
| `country` | string | Country of HQ | ~35 countries |
| `signup_date` | date | Account creation date | 2019-01-01 to 2025-06-30 |
| `plan_tier` | string | Current subscription tier | Free / Starter / Professional / Enterprise |
| `annual_revenue_usd` | float | Reported annual revenue | Right-skewed, 8% missing, outliers |
| `employee_count` | integer | Number of employees | Right-skewed, 5% missing |
| `acquisition_channel` | string | How they found NovaCraft | 7 categories |
| `account_manager` | string | Assigned AM | ~15 names, 12% missing |
| `is_active` | boolean | Currently active? | **Classification target** |
| `region_code` | string | Region identifier | **Constant** (all "GLOBAL") |
| `data_source` | string | Data ingestion source | <20 unique → triggers type conversion suggestion |

### 2. `subscriptions.csv` (~3,200 rows)

Subscription history — customers may have multiple records (upgrades, renewals).

| Column | Type | Description | Notes |
|--------|------|-------------|-------|
| `subscription_id` | string | Primary key | |
| `customer_id` | string | FK → customers | |
| `plan_name` | string | Plan at time of subscription | 4 tiers |
| `billing_cycle` | string | Billing frequency | monthly / annual |
| `mrr_usd` | float | Monthly recurring revenue | Right-skewed, 3% missing |
| `start_date` | date | Subscription start | |
| `end_date` | date | Subscription end | ~39% missing (still active) |
| `cancellation_reason` | string | Reason for cancellation | ~51% missing |
| `discount_pct` | float | Applied discount | 15% missing, outliers |
| `seats_purchased` | integer | License seats | Right-skewed |
| `payment_method` | string | Payment type | 4 categories |
| `auto_renew` | boolean | Auto-renewal enabled? | 2% missing |

### 3. `support_tickets.csv` (~6,800 rows)

Customer support interactions.

| Column | Type | Description | Notes |
|--------|------|-------------|-------|
| `ticket_id` | string | Primary key | |
| `customer_id` | string | FK → customers | |
| `created_at` | date | Ticket creation date | |
| `resolved_at` | date | Resolution date | 20% missing (correlated w/ resolution_hours) |
| `category` | string | Ticket category | 8 categories |
| `priority` | string | Severity level | low / medium / high / critical |
| `resolution_hours` | float | Time to resolve | Right-skewed, 20% missing, heavy outliers |
| `satisfaction_score` | integer | CSAT rating | 1-5, 25% missing, left-skewed |
| `agent_id` | string | Support agent ID | ~25 agents |
| `escalated` | boolean | Was ticket escalated? | **Classification target** |
| `description_length` | integer | Ticket text length | Right-skewed |

### 4. `usage_metrics.csv` (~10,700 rows)

Monthly product usage aggregates per customer.

| Column | Type | Description | Notes |
|--------|------|-------------|-------|
| `customer_id` | string | FK → customers | |
| `month` | date | First of month (YYYY-MM-01) | |
| `active_users` | integer | Unique active users | |
| `total_logins` | integer | Login count | Right-skewed |
| `projects_created` | integer | New projects | |
| `tasks_completed` | integer | Completed tasks | Right-skewed, outliers |
| `storage_used_gb` | float | Storage consumption | 7% missing |
| `api_calls` | integer | API request count | Extreme right-skew, heavy outliers |
| `integrations_active` | integer | Active integrations | |
| `avg_session_minutes` | float | Average session length | 10% missing |
| `feature_adoption_pct` | float | % of features used | 5% missing |
| `nps_response` | integer | Net Promoter Score | 0-10, **50% missing** |
| `export_count` | integer | Data exports | Near-constant (95% = 0) |

### 5. `marketing_campaigns.csv` (~505 rows incl. 5 duplicates)

Marketing campaign performance data.

| Column | Type | Description | Notes |
|--------|------|-------------|-------|
| `campaign_id` | string | Primary key | |
| `campaign_name` | string | Descriptive name | High cardinality |
| `channel` | string | Marketing channel | 6 categories |
| `start_date` | date | Campaign start | |
| `end_date` | date | Campaign end | |
| `budget_usd` | float | Campaign budget | Right-skewed |
| `leads_generated` | integer | Leads produced | Right-skewed, outliers |
| `conversions` | integer | Successful conversions | **Regression target** |
| `cost_per_lead` | float | Cost per lead | 8% missing |
| `target_industry` | string | Target vertical | 12 industries + "All" |

## Data Quality Summary

| Issue | Where | Severity |
|-------|-------|----------|
| Missing values (low ~5%) | employee_count, feature_adoption_pct | Low |
| Missing values (medium ~10-25%) | account_manager, discount_pct, satisfaction_score, avg_session_minutes | Medium |
| Missing values (critical ~40-60%) | end_date, cancellation_reason, nps_response | High |
| Outliers (IQR method) | annual_revenue_usd, resolution_hours, api_calls, cost_per_lead, tasks_completed | Medium |
| Right-skewed distributions | mrr_usd, api_calls, tasks_completed, budget_usd, resolution_hours | Medium |
| Left-skewed distribution | satisfaction_score | Low |
| Constant column | region_code (all "GLOBAL") | High |
| Near-constant column | export_count (95% zeros) | Medium |
| Duplicate rows | customers (30), marketing_campaigns (5) | Medium |
| Type conversion opportunity | data_source (<20 unique strings) | Low |
| High cardinality | company_name, campaign_name | Info |
| Correlated missingness | resolved_at ↔ resolution_hours | Medium |

## Suggested ML Tasks

1. **Customer churn classification** — Predict `is_active` using customer attributes, usage, and support history
2. **MRR regression** — Predict `mrr_usd` from customer profile and usage patterns
3. **Ticket escalation classification** — Predict `escalated` from ticket metadata
4. **Campaign conversion regression** — Predict `conversions` from campaign attributes
5. **Churn timing** — Derive churn label from `end_date` presence, predict with survival analysis features

## Regeneration

```bash
cd testing/fixtures/mock-business/
python3 generate_data.py
```

The script uses `random.seed(42)` for full reproducibility. Optional dependencies (`faker`, `numpy`) improve name variety but are not required.
