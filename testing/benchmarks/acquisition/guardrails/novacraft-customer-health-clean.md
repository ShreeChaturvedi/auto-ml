# NovaCraft Customer Health Clean

- Dataset slug: `novacraft-customer-health-clean`
- Benchmark role: guardrails and poisoned-data clean base
- Acquisition mode: `derived`
- Status: `pending`

## Source

- Repo-native source family: `testing/fixtures/mock-business/`
- Primary context: `testing/fixtures/mock-business/README.md`

## Canonical Staging Target

- Root: `testing/benchmarks/data/derived/novacraft-customer-health-clean/v1/`
- Canonical file: `testing/benchmarks/data/derived/novacraft-customer-health-clean/v1/canonical/data.csv`

## Derivation Direction

- one row per deduplicated customer
- frozen `as_of_date`
- leakage-safe aggregates only
- no raw identifiers as model features
- no constant columns
- no accidental mixed dtypes

## Follow-on Poison Targets

- `testing/benchmarks/data/poison/novacraft-customer-health-clean/v1/<issue-family>/`

## Risks

- the exact clean-base column contract is still open
- the derived base must be frozen before poison manifests are authored, or every variant fingerprint will drift

## Notes

- this playbook is safe to advance now because it stays entirely inside repo-owned benchmark assets
- later implementation can derive this dataset without touching backend training logic
