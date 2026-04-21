# Expo Benchmark Data Architecture

Concrete design for the benchmark data layer. This is narrower than the full benchmark suite design: it defines how benchmark datasets are acquired, staged, versioned, validated, and connected to run artifacts. It does not yet specify the full runner implementation.

## Scope

- In scope:
  - dataset acquisition boundary
  - dataset manifest contract
  - local staging layout
  - poisoned benchmark dataset architecture
  - run artifact and result-data contract
- Out of scope for this pass:
  - exact runner code
  - exact visualization/dashboard implementation
  - full benchmark scoring formulas outside the data contract

## Decision Summary

- Treat benchmark data as a separate reproducibility layer, not as part of backend runtime storage.
- Add a new benchmark root under `testing/benchmarks/`.
- Keep manifests and modest repo-native derived benchmark assets in git.
- Do not commit staged public benchmark bytes or per-run raw artifacts.
- Split the system into two phases:
  - `prepare/stage`: acquire, normalize, derive, validate, checksum
  - `execute`: upload/copy staged bytes, run benchmarks, collect artifacts
- Use one clean repo-native base table for the poisoned benchmark:
  - `derived.novacraft-customer-health-clean.v1`
- Represent poisoned variants as deterministic patch manifests plus scoring contracts, not hand-maintained full CSVs where avoidable.

## Rejected Approaches

### 1. Put benchmark data into backend runtime storage

Rejected because `backend/storage/**` is mutable runtime state. The benchmark source of truth cannot live in the same layer as app uploads, workspace copies, or derived runtime artifacts.

### 2. Fold benchmark datasets into `testing/fixtures/`

Rejected because `testing/fixtures/` already serves small E2E and eval fixtures. Benchmark-grade datasets, manifests, and result bundles are a separate concern and need clearer lifecycle rules.

### 3. Let the scored harness fetch datasets on demand

Rejected because it mixes acquisition failures with benchmark execution, weakens provenance, and is legally brittle for Kaggle-style gated sources.

## Design Principles

- Immutable inputs: benchmark runs consume frozen staged bytes, never mutable workspace copies.
- Manifest-first: every benchmark dataset is identified by a versioned manifest in git.
- Provenance is mandatory: source, license, acquisition mode, and checksums are required.
- Separate control plane from data plane:
  - control plane = manifests, schemas, suite definitions, scoring expectations
  - data plane = staged bytes, generated poison variants, run artifacts
- No hidden network in scored runs.
- No silent drift: a checksum mismatch makes the case non-runnable.
- Honest lanes: direct `/api/models/train` and agentic workflow benchmarking remain separate lanes.

## Directory Contract

```text
testing/
  fixtures/                      # existing small dev/E2E fixtures remain here
  benchmarks/
    README.md
    catalog/
      datasets/
        public/
          titanic-v1.json
          ames-housing-v1.json
          credit-card-fraud-v1.json
          spaceship-titanic-v1.json
          adult-income-v1.json
        derived/
          novacraft-customer-health-clean-v1.json
        poison/
          novacraft-customer-health-clean--target-leakage-v1.json
          novacraft-customer-health-clean--hidden-missing-v1.json
          novacraft-customer-health-clean--mixed-types-v1.json
      suites/
        expo-p0-v1.json
        poison-guardrails-v1.json
      schemas/
        dataset-manifest.schema.json
        suite-manifest.schema.json
        run-manifest.schema.json
        poison-variant.schema.json
    data/
      public/                    # gitignored except README/.gitkeep
        titanic/v1/
          upstream/
          canonical/
            data.csv
          profile.json
          README.md
      derived/                   # tracked when repo-native and modest size
        novacraft-customer-health-clean/v1/
          canonical/
            data.csv
          profile.json
          schema.json
      poison/                    # tracked when repo-native and modest size
        novacraft-customer-health-clean/v1/
          target-leakage/
            canonical/
              data.csv
            expectations.json
            profile.json
          hidden-missing/
            canonical/
              data.csv
            expectations.json
            profile.json
    runs/                        # gitignored
      expo-p0-v1/
        2026-04-16T04-41-48Z--main--abc1234/
          run.json
          env.json
          dataset-lock.json
          cases.jsonl
          summary.json
          raw/
            titanic--rep01/
              workflow.ndjson
              evaluation.json
              logs.txt
          reports/
            summary.md
            metrics.csv
            hero-chart.png

docs/
  benchmarks/                   # committed published snapshots only
    expo-p0-v1/
      latest.md
      latest.json
      hero-chart.png
```

## Ownership Rules

- `testing/benchmarks/catalog/**` is committed and reviewed like code.
- `testing/benchmarks/data/public/**` is local staging for public datasets and is gitignored.
- `testing/benchmarks/data/derived/**` and `testing/benchmarks/data/poison/**` may be committed when they are repo-native, modest in size, and important for reproducibility.
- `testing/benchmarks/runs/**` is always gitignored.
- `docs/benchmarks/**` contains only curated published outputs, never raw traces.

## Dataset Identity

Each dataset is identified by three layers:

- `slug`: stable human-facing name, for example `adult-income`
- `version`: benchmark contract version, for example `v1`
- `sha256`: exact content fingerprint of the canonical file

These solve different problems:

- `slug` is readable
- `version` defines comparability across benchmark reports
- `sha256` detects silent drift

Stable manifest ID format:

- `public.titanic.v1`
- `public.adult-income.v1`
- `derived.novacraft-customer-health-clean.v1`
- `poison.novacraft-customer-health-clean--target-leakage.v1`

## Dataset Manifest Contract

Minimum fields for every dataset manifest:

```json
{
  "schemaVersion": 1,
  "id": "public.titanic.v1",
  "kind": "public",
  "slug": "titanic",
  "version": 1,
  "task": {
    "type": "classification",
    "targetColumn": "survived",
    "primaryMetric": "accuracy"
  },
  "storage": {
    "root": "testing/benchmarks/data/public/titanic/v1",
    "canonicalFile": "canonical/data.csv"
  },
  "integrity": {
    "canonicalSha256": "..."
  },
  "provenance": {
    "upstreamUrl": "...",
    "license": "...",
    "acquisition": "manual-stage"
  },
  "splitContract": {
    "method": "fixed-holdout",
    "seed": 42
  },
  "suiteRefs": ["expo-p0-v1"]
}
```

Required sections:

- identity:
  - `id`, `kind`, `slug`, `version`
- task contract:
  - task type, target column, primary metric
- storage contract:
  - canonical root, canonical file path
- integrity:
  - canonical file checksum and size
- provenance:
  - upstream location, acquisition mode, license, notes
- split contract:
  - fixed split method and seed policy
- suite references:
  - which suite manifests consume this dataset

Optional but strongly preferred:

- expected rows and columns
- schema fingerprint
- profile checksum
- lineage to parent manifests
- benchmark notes and caveats

## Acquisition Modes

The design supports exactly three acquisition modes:

- `scripted-open`
  - stable open source
  - no auth
  - no click-through license during scored execution
- `manual-stage`
  - gated source such as Kaggle exports
  - human places the upstream artifact locally before preparation
- `derived`
  - repo-native deterministic derivation from committed assets

Current expected mapping:

- `Adult Income`: `scripted-open`
- `Titanic`, `Ames Housing`, `Spaceship Titanic`, `Credit Card Fraud`: `manual-stage` unless replaced with cleaner open-source equivalents
- NovaCraft-derived clean and poison datasets: `derived`

## Preparation Boundary

Preparation and execution are separate by design.

### `prepare/stage` owns

- source download or manual import checks
- unpacking and filename normalization
- canonical CSV creation
- derived dataset generation
- poison variant generation
- schema/profile computation
- checksum validation
- manifest conformance validation

### `execute` owns

- copying or uploading canonical bytes into fresh runtime storage
- auth/bootstrap
- workflow execution
- evaluation polling
- raw trace capture
- normalized run summary generation

Scored execution must not:

- fetch remote data
- discover dataset files implicitly
- mutate canonical staged inputs
- reuse prior workspace copies as benchmark truth

## Public Dataset Policy

For the current P0 public suite, the benchmark data contract assumes one canonical runner input file per dataset:

- `canonical/data.csv`

That means any dataset with multiple raw upstream files or awkward packaging must still resolve to one frozen canonical file before execution.

This keeps the benchmark honest relative to the platform’s current one-file upload path.

## Poisoned Benchmark Design

### Base Dataset

Use one clean base table:

- `derived.novacraft-customer-health-clean.v1`

This is a single customer-level table derived from `testing/fixtures/mock-business/`, frozen at one `as_of_date`, and cleaned before any poison injection.

Base-table rules:

- one row per deduplicated customer
- no raw identifiers as model features
- no constant columns
- no raw target proxies
- no mixed dtypes
- no sentinel strings posing as missing values

Provisional target:

- `is_active`

This is acceptable for preprocessing and guardrail benchmarking, but not yet assumed to be a hero model-quality dataset.

### Base Feature Contract

The design direction is:

- customer-level attributes
- leakage-safe aggregates from subscriptions
- leakage-safe aggregates from usage
- leakage-safe aggregates from support history

Explicitly excluded from the clean base:

- `customer_id`
- raw duplicate rows
- constant `region_code`
- high-cardinality `company_name`
- target proxies such as churn or cancellation outcome fields

### Variant Model

Each poisoned variant is defined by a manifest, not by hand-maintained benchmark logic hidden in runner code.

Variant manifest sections:

- identity:
  - `variantId`, `issueFamily`, `difficulty`, `seed`, `baseDatasetRef`
- patch contract:
  - declarative injectors such as `add_column`, `rewrite_values`, `clone_rows`, `cast_column`, `swap_dtype`, `inject_outliers`
- ground truth:
  - primary poisoned columns
  - acceptable remediation families
- observable symptoms:
  - what should be visible from profile/sample surfaces
- scoring contract:
  - required postconditions
  - no-harm guards
  - optional probe checks

Representative issue families:

- target leakage
- hidden missing sentinels
- semantic dtype corruption
- duplicates
- mixed numeric formats
- identifier proxy leakage
- realistic outlier corruption

### Scoring Attachment

Do not score poisoned variants by exact `intentType`.

Use three evidence sources instead:

- workflow trace:
  - normalized action families from NDJSON or tool history
- preprocessing run snapshot:
  - step metadata, validation counters, approval state
- final processed dataset:
  - derived output linked to the preprocessing run

Default scoring split:

- 25% detection evidence
- 55% remediation postconditions
- 20% no-harm guards

Representative postconditions:

- `column_absent`
- `dtype_equals`
- `sentinel_count_equals`
- `duplicate_rate_le`
- `row_count_delta_between`
- `target_preserved`
- `probe_metric_delta_le`
- `schema_fingerprint_matches`

## Run Artifact Contract

Canonical run artifact root:

- `testing/benchmarks/runs/<suite-id>/<run-id>/`

Each run must write both raw and normalized artifacts.

### Run-level files

- `run.json`
- `env.json`
- `dataset-lock.json`
- `cases.jsonl`
- `summary.json`

### Case-level raw artifacts

- workflow stream NDJSON
- final workflow state JSON
- preprocessing run snapshot JSON
- model record JSON
- evaluation JSON
- request/response log JSONL
- stdout/stderr logs
- optional Playwright traces for UI lanes

### Case-level normalized artifacts

- case summary JSON
- stage timeline JSON
- metrics JSON
- artifact index JSON

The stable aggregation contract is the normalized layer, especially:

- `cases.jsonl`
- `summary.json`

The raw layer exists for auditability and rescoring.

## Dataset Lock

Every scored run must emit `dataset-lock.json`.

It should snapshot:

- suite ID and suite version
- dataset manifest IDs
- canonical file paths
- canonical SHA-256 values
- manifest checksums

This prevents the benchmark from quietly picking up changed local bytes after a manifest was authored.

## Suite Manifest Contract

Each suite manifest declares:

- suite ID and version
- benchmark lane
- ordered dataset entries
- repetitions
- quality gate contract
- scoring contract reference

Example entry:

```json
{
  "datasetRef": "public.titanic.v1",
  "repetitions": 5,
  "qualityGate": {
    "metric": "accuracy",
    "op": ">=",
    "value": 0.77
  }
}
```

## Hard Constraints For Publishable Runs

- fresh staged inputs per run
- no mutable workspace reuse as source truth
- no network during scored execution
- pinned LLM model IDs and temperatures
- pinned container image identity
- fixed split contract
- explicit approval policy
- raw and normalized artifacts both persisted
- commit SHA captured
- manifest IDs captured

If any of these are missing, the run should be treated as non-publishable.

## Why Not Reuse Existing Workspace Copies?

The current workspace model is optimized for product behavior, not benchmark reproducibility. It can preserve prior copied datasets and rely on path freshness or modification time. That is acceptable in an interactive product, but it is disqualifying for benchmark truth.

Benchmark execution should therefore always begin from the canonical staged file referenced by the dataset manifest and materialize a fresh runtime copy.

## Incremental Rollout

### Pass 1

- create `testing/benchmarks/` contract
- define schemas and manifests
- stage one public dataset
- define one suite manifest

### Pass 2

- define `derived.novacraft-customer-health-clean.v1`
- define first poison families and expectations
- define run artifact bundle shape

### Pass 3

- build preparation tooling
- build validation tooling
- build benchmark runner against this contract

## Open Questions Left For The Next Pass

- Which public datasets remain `manual-stage` versus being replaced by cleaner open-source equivalents?
- What exact column set should the clean NovaCraft-derived base freeze at `v1`?
- Should repo-native poison materializations be committed in full, or generated locally from tracked manifests plus checked-in base data?
- Do we want normalized run summaries persisted only as files at first, or mirrored into a benchmark-specific table later?

## Current Recommendation

Adopt `testing/benchmarks/` as the benchmark control plane now. Treat manifests, suite definitions, and repo-native guardrail datasets as first-class repo assets. Keep public staged bytes and run traces out of git. Build the runner later against this contract rather than letting the runner invent the data layer on the fly.
