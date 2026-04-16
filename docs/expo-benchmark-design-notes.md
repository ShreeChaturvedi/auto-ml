# Expo Benchmark Design Notes

Working document for refining the capstone expo benchmark suite. This is not the final implementation plan. It captures repo-grounded constraints, weak spots in the current concept, and the design decisions still open.

## Source Inputs

- [Research: expo benchmark findings](./expo-benchmark-research.md)
- [Concrete data architecture](./expo-benchmark-data-architecture.md)
- Previous plan: `~/.claude/plans/graceful-snuggling-teapot.md`

## Repo-Grounded Constraints

### Automation surface is real, but not as simple as the draft implies

- The app does expose benchmarkable HTTP surfaces for upload, workflows, training, experiments, and NL->SQL.
- The workflow endpoint is `POST /api/workflows/turns/stream` and returns NDJSON, not a simple one-shot JSON response.
- The workflow router has a concurrency guard for active runs and treats runs as stale only after 10 minutes.
- Preprocessing may pause for approval and requires a follow-up `POST /api/preprocessing/step-decision` to continue.

### Auth must be part of the benchmark harness

- When Postgres is configured, the backend mounts `requireAuth` across `/api`.
- That means the benchmark harness must own account bootstrap or login, token persistence, and likely token refresh handling for long runs.
- The earlier draft mentions `/auth/register` and `/auth/login`, but this is not optional plumbing. It is a first-class benchmark-runner requirement.

### There are two distinct training products in the repo

- `POST /api/models/train` is a direct template-driven training surface.
- `POST /api/workflows/turns/stream` with `phase=training` is the agentic, notebook-mediated training lifecycle that better matches the core product story.
- These paths should not be conflated. Benchmark design needs an explicit choice:
  - benchmark the user-facing agentic workflow end-to-end
  - benchmark the direct training engine
  - or benchmark both, but present them as different claims

### Existing benchmark/eval infrastructure is partial

- Playwright benchmark coverage currently proves project creation + dataset upload, not the full expo suite.
- `testing/tests/evalRunner.ts` is a minimal NL->SQL and RAG harness and is a plausible seed for an expanded query benchmark.
- The current repo does not yet have a unified benchmark runner, results schema, or aggregation pipeline for the proposed suite.

### The real end-to-end automation path is multi-turn

- The truthful API-driven product path is:
  - auth
  - create project
  - upload dataset
  - run preprocessing workflow stream
  - handle approval pauses
  - continue the workflow
  - run training workflow stream
  - handle training proposal approval by prompt
  - continue the workflow
  - harvest `modelId`
  - poll evaluation until ready
- `done` on the workflow stream only means the NDJSON response is finished. It does not imply success.
- The runner must inspect:
  - final `workflow_state.status`
  - `workflow_pause`
  - `workflow_error`
  - `tool_executed` payloads
- The runner must also track multiple IDs, not one:
  - workflow `runId`
  - workflow `threadId`
  - preprocessing run id for step approvals
  - training `experimentId`
  - final `modelId`

## Current Weak Spots In The Draft

### 1. The automation story is underspecified

- The current draft says "100% API-driven" but does not yet account for:
  - auth bootstrap
  - NDJSON stream parsing
  - workflow pause/resume behavior
  - approval loops
  - stale-run recovery
  - the distinction between agentic training and direct model training

### 2. The dataset suite is not internally coherent yet

- The current draft mixes `Favorita` into P0 time-to-model and `Wine Quality` into P0 model quality.
- That creates two different dataset suites instead of one coherent P0 benchmark set.
- Current best direction from pressure-testing:
  - Keep: Titanic, Ames Housing, Credit Card Fraud, Spaceship Titanic
  - Replace the shaky fifth slot with: Adult Income
  - Drop from P0: Wine Quality, Favorita
- External validation reinforces that choice:
  - `Adult Income`, `Bank Marketing`, and `Default of Credit Card Clients` have cleaner official/open provenance than Kaggle-native competition datasets.
  - `Titanic`, `Ames`, and `Spaceship Titanic` are still worth keeping because judges instantly recognize them, not because their provenance is strongest.
  - `Melbourne Housing` remains a backup, but it is weaker on provenance and less aligned with the single clear expo story.

### 3. The poisoned dataset benchmark is too easy to read

- Several proposed flaws are telegraphed by suspicious names or cartoonish values.
- A single synthetic `loan_applications.csv` with obvious one-off defects will look benchmark-y rather than credible.
- Better direction:
  - build one realistic clean base dataset
  - inject one seeded flaw family per variant
  - score with accepted intent families + postcondition checks, not exact `intentType` equality

### 4. Preprocessing-agreement scoring is too naive

- Exact or lightly normalized Jaccard over operations will underweight high-stakes mistakes and overweight cosmetic differences.
- Current scoring also assumes operation labels are stable enough to compare directly, which is not clearly true in the repo.
- This benchmark likely needs weighted operation families and column-aware normalization before it becomes credible.

### 5. The suite still risks telling too many stories

- Time-to-model, quality, guardrails, preprocessing intelligence, and NL->SQL can all be valid.
- But the expo narrative still needs a single headline, with the rest clearly supporting it rather than competing with it.

### 6. Dataset acquisition is being conflated with benchmark execution

- The draft treats Kaggle-style dataset retrieval as if it can sit inside the benchmark harness.
- That is the wrong failure boundary for an expo benchmark.
- Dataset acquisition should be a separate preparation layer with:
  - fixed manifests
  - checksums
  - provenance/license notes
  - a local staging convention
- Benchmark execution should assume datasets are already present and validated.

### 7. The current NL->SQL benchmark concept is ahead of the current fixture reality

- `testing/tests/evalRunner.ts` is only a seed.
- `testing/fixtures/nl2sql_eval.json` is currently trivial, so the proposed 30-query benchmark still needs a real corpus and scoring design.
- The stronger local candidate for future query work is the `testing/fixtures/mock-business/` dataset family, not the current tiny fixture alone.

### 8. Preprocessing agreement is not headline-ready in its current form

- Raw Jaccard over preprocessing operations is too brittle for the current workflow data model.
- The step schema does not expose stable canonical operation objects with reliable column/parameter structure.
- If this benchmark stays, it should be rubric-based and secondary, not a hero metric.

## Candidate Working Direction

### P0 benchmark set

- Unified dataset set:
  - Titanic
  - Ames Housing
  - Credit Card Fraud
  - Spaceship Titanic
  - Adult Income

### Dataset positioning

- Public headline suite:
  - use the unified five-dataset set above
  - treat `Adult Income` as the fifth-slot anchor because it adds mixed-type preprocessing friction, fairness-adjacent discussion, and clean public provenance
- Poisoned guardrails suite:
  - do not reuse the public headline datasets as the poisoned benchmark base
  - instead derive one clean, single-table customer-level dataset from `testing/fixtures/mock-business/`, then inject one flaw family per variant
  - the raw multi-file NovaCraft fixture is too messy to use as the base without sanitizing it first
- Reserve options:
  - `Bank Marketing` is the strongest public replacement candidate if `Adult Income` becomes awkward to stage
  - `Melbourne Housing` is still a viable appendix or fallback dataset, but not the best current fifth-slot choice

### P0 benchmark claims

- One combined headline benchmark:
  - time to a quality-gated model on a unified five-dataset suite
- Supporting proof:
  - poisoned dataset guardrails on a realistic seeded-poison benchmark

### P1 benchmark claims

- Preprocessing agreement
- NL->SQL accuracy + repair recovery

## Decisions Still Open

### Automation

- Should the headline benchmark use the agentic training workflow, the direct `/models/train` path, or both in separate lanes?
- For preprocessing automation, do we intentionally constrain prompts to low-risk auto-approved transformations, or do we explicitly automate approval responses?
- What should the benchmark runner persist as its canonical result artifact: raw NDJSON traces, normalized per-step JSON, or both?
- What is the correct dataset preparation boundary:
  - pre-staged local datasets
  - validated download/setup script
  - or manual placement plus checksum verification

### Poisoned dataset benchmark

- What exact clean customer-level base table should we derive from `testing/fixtures/mock-business/`?
- Which flaw families are truly benchmark-worthy versus noisy or ambiguous?
- What normalization scheme should map repo `intentType` values into stable scoring families?

### Preprocessing agreement benchmark

- Do we keep Jaccard at all?
- If yes, what operations deserve heavier weight:
  - leakage prevention
  - target handling
  - missing-value normalization
  - type correction
- Should downstream performance be the dominant score instead of operation overlap?

### NL->SQL benchmark

- How do we write 30 queries that are hard enough to matter but unambiguous enough for deterministic scoring?
- How should repair recovery be measured:
  - initial failure -> final success
  - semantic equivalence after repair
  - or both

### Presentation

- What is the single headline at the expo?
- Which benchmark result belongs in:
  - poster
  - live demo
  - recorded video
  - in-app dashboard

## Current Leaning

- The benchmark suite should center on one simple claim:
  - the platform gets you to a credible model on messy real datasets in minutes
- Best current headline phrasing:
  - `Expert-quality models in minutes`
- Best current narrative rule:
  - one workflow
  - one hero chart
  - one technical deep dive
- Guardrails should be the secondary differentiator because they are more distinctive than pure leaderboard chasing.
- Best current dataset split:
  - public P0 suite on well-known single-table datasets
  - poisoned benchmark on a sanitized repo-native business table derived from `mock-business`
- NL->SQL should remain in the suite, but probably not as the hero claim unless the demo emphasis shifts toward data exploration.
- Dataset preparation should be treated as a separate reproducibility layer, not something the benchmark runner improvises at execution time.
