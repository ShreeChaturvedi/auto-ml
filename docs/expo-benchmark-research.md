# Expo Benchmark Research

Research and findings for designing the capstone expo benchmark suite. Use this document to continue brainstorming in future sessions.

---

## 1. How Top Companies Present Benchmarks

### Patterns

| Company | Lead With | Visual Format | Narrative |
|---------|----------|---------------|-----------|
| Anthropic | Grouped horizontal bar charts, one color per model, sorted by score | Bar charts, simple and scannable | "Best-in-class on X while being cheaper/faster" — efficiency frontier positioning |
| OpenAI | Scatter plots (capability vs. efficiency), step-function improvement charts | Radar charts for multi-dimensional profiles, line graphs for generational jumps | "State-of-the-art across the board" — generalist champion framing |
| Cursor/Devin | Screen recordings — "watch it work" | Side-by-side before/after timelines | Demo-first, metrics reinforce the demo |
| AutoML platforms (H2O, DataRobot, AutoGluon) | Accuracy on dataset suites, time-to-model | Tables + bar charts | "Expert-level results without expertise" — ROI and time-saved narratives |

### What Makes Benchmarks Compelling vs. Forgettable

**Compelling**: One clear headline metric anchoring the story. Clean minimal chart design. Third-party validation. A live demo that matches the benchmarks.

**Forgettable**: Too many metrics with no hierarchy. Self-reported with no reproduction path. Charts requiring explanation. Benchmarks on synthetic tasks nobody cares about.

### Metric Categories by Domain

- **LLM providers** benchmark on: coding (SWE-bench), reasoning (MATH, GPQA), general knowledge (MMLU), safety
- **Developer tools** benchmark on: task completion rate, time-to-completion vs. manual, accuracy/acceptance rate
- **AutoML platforms** benchmark on: accuracy across dataset suites, time-to-model, model diversity, framework comparison tables

---

## 2. Platform Capabilities (from codebase analysis)

### Phase-Based Workflow

7 sequential phases: Upload → Data-Viewer (Explore) → Preprocessing → Feature-Engineering → Training → Experiments → Deployment. Each phase unlocks the next. AI assistance embedded in preprocessing, feature engineering, and training.

### Key Differentiators

1. **LangGraph Preprocessing State Machine** — 8-stage FSM (context_ready → plan_step → generate_code → execute_code → validate_outcome → await_approval → commit_or_revise → completed) with auto-repair and human-in-the-loop approval gates
2. **MCP Tool Orchestration** — 20+ dynamically registered tools (list_project_files, get_dataset_profile, search_documents, execute_cell, propose_features, etc.) exposed to LLMs via in-memory MCP server
3. **Sandboxed Jupyter Kernels** — Docker-containerized Python with real-time code intelligence (Jedi completions, hover, signatures, diagnostics)
4. **NL→SQL + RAG** — Two-pass pipeline (planning + generation) with auto-repair loop (`runRepairPipeline`)
5. **Voice Input** — OpenAI Realtime API session for voice-to-notebook interaction
6. **Real-Time Collaboration** — WebSocket-based notebook updates with cell binding and interruption handling

### Full API Surface (benchmarkable via HTTP)

```
POST /auth/register, /auth/login
POST /projects
POST /upload/dataset (multipart)
POST /workflows/turns/stream (phase=preprocessing|feature_engineering|training, NDJSON response)
POST /preprocessing/step-decision (approve/reject transformation steps)
POST /models/train → GET /experiments/:modelId/evaluation
POST /query/nl (NL→SQL) → POST /query/sql (raw SQL execution)
POST /upload/doc (RAG documents)
GET /docs/search (vector search)
```

### Existing Benchmark Infrastructure

| What | Location | Does |
|------|----------|------|
| Playwright E2E | `testing/benchmark.spec.ts` | Project creation + dataset upload workflow |
| API load test | `backend/src/scripts/benchmarkApi.ts` | autocannon on /health and /projects |
| NL→SQL eval | `testing/tests/evalRunner.ts` + `testing/fixtures/nl2sql_eval.json` | 3 test cases, POST to /api/query/nl |
| RAG eval | `testing/fixtures/rag_eval.json` | 15 test cases, phrase-matching |
| Test fixtures | `testing/fixtures/` | `sample_customers.csv` (4 rows), `mock_customer_churn_clean.csv` (150 rows, 19 cols) |
| Playwright helpers | `testing/helpers.ts` | `resetBackendData()`, `apiCreateProject()` |

---

## 3. Published Baseline Data

### Kaggle Leaderboard Distributions (Public Scores)

| Dataset | Metric | Top 1% | Top 10% | Median | Naive Baseline |
|---------|--------|--------|---------|--------|----------------|
| Titanic | Accuracy | ~0.82+ | ~0.79 | ~0.76 | ~0.62 (all-female) |
| House Prices (Ames) | RMSE (log) | ~0.11 | ~0.13 | ~0.15 | ~0.22 (mean pred) |
| Credit Card Fraud | AUC | N/A (no comp) | N/A | N/A | ~0.97 (LogReg) |
| Wine Quality | Accuracy | N/A (no comp) | N/A | N/A | ~0.52 (majority) |
| Spaceship Titanic | Accuracy | ~0.81+ | ~0.80 | ~0.78 | ~0.50 (random) |

### Known sklearn Baselines (from thousands of Kaggle notebooks)

| Dataset | Model | Score |
|---------|-------|-------|
| Titanic | LogReg basic | ~0.77 acc |
| Titanic | RF tuned | ~0.79-0.80 acc |
| House Prices | Ridge (log-transformed) | ~0.14 RMSLE |
| Credit Fraud | LogReg | ~0.97 AUC |
| Wine Quality | RF | ~0.67 acc (multiclass) |
| Spaceship Titanic | XGBoost basic | ~0.79 acc |

### Published Time-to-Model Data

- No rigorous published study gives citable "AutoML is X times faster" numbers on these specific datasets
- Wang et al. (2021, AutoDS) and Xanthopoulos et al. (2020): manual ML pipelines take **1-4 hours** for a competent user on Kaggle-class datasets; AutoML tools produce competitive results in **10-60 minutes**
- Zöller & Huber (2021) "Benchmark and Survey of Automated ML Frameworks": reports AutoML wall-clock times but no human comparison

### What's NOT Available

- No major AutoML paper publishes reproducible numbers on Titanic/Ames/Fraud/Wine/Spaceship specifically
- The OpenML AutoML Benchmark (Gijsbers et al., 2024, JMLR) uses different datasets (adult, kc1, blood-transfusion)
- **Must run our own baselines locally** — this is actually more credible at an expo than citing secondhand numbers

---

## 4. Benchmark Designs

### Benchmark 1: Time-to-Model (P0)

**Hero metric**: Wall-clock minutes from CSV upload to evaluation metric.

**Datasets**: Titanic (891 rows), Ames Housing (1,460 rows, 79 features), Credit Card Fraud (284K rows), Spaceship Titanic (8,693 rows), Store Sales Favorita (3M+ rows, multi-table).

**Clock rules**: Start = upload API returns 200. Stop = evaluation endpoint returns metrics. "Done" = trained model with held-out metric. Quality gate: metric must be within 2 percentage points of best baseline.

**Expected results (minutes)**:

| Dataset | Our Platform | Jupyter Manual | Chat-Assisted | AutoGluon |
|---------|-------------|---------------|---------------|-----------|
| Titanic | 2-3 | 15-25 | 8-12 | 1-2 |
| Ames Housing | 3-5 | 25-40 | 12-20 | 2-4 |
| Credit Fraud | 4-7 | 30-50 | 15-25 | 5-10 |
| Spaceship Titanic | 3-5 | 20-35 | 10-18 | 2-4 |
| Favorita | 8-15 | 60-120 | 30-50 | 10-20 |

**Known risks**: AutoGluon beats us on clean datasets (Titanic, Ames). Our edge is compound datasets where preprocessing intelligence matters. LLM may have memorized Titanic pipelines — counter with Spaceship Titanic (newer).

### Benchmark 2: Model Quality (P0)

**Hero metric**: Accuracy/F1/AUC compared to baselines and Kaggle leaderboards.

**Methodology**: Fixed `random_state=42`, 80/20 stratified split. 5 reps per dataset (LLM non-determinism). Report median + IQR. All AutoML systems get 4-minute time budget.

**Scoring rubric (per dataset, 0-20 pts)**: Metric performance (0-10) + preprocessing choices (0-4) + model selection (0-3) + no pitfalls (0-3). Total: 100 pts across 5 datasets.

**Honest expectations**: Beat competent baselines on Titanic/Ames/Spaceship. Match but not beat AutoGluon on Credit Fraud/Wine. Target: within Kaggle top-10% on at least 1 dataset.

### Benchmark 3: Poisoned Dataset Guardrails (P0)

**Hero metric**: Detection + remediation score out of 20 (10 flaws × 2 pts each).

**Base dataset**: Synthetic `loan_applications.csv` (2,000 rows). 10 variants with single injected flaws:

1. Target leakage (`approval_letter_date` non-null iff `approved=1`)
2. Hidden missing values (`"N/A"`, `-999`, `""`)
3. Datetime as numeric (YYYYMMDD ints)
4. Extreme class imbalance (99.5% / 0.5%)
5. Duplicate rows (20% exact + 5% near-dupes)
6. Mixed types (`"$25,000"`, `"25K"`, `"pending"` in numeric column)
7. High-cardinality categorical (1,200 unique employer names)
8. Row index as feature (`record_number` = 1..2000)
9. Extreme outliers (`income = 1e9`)
10. Text in numeric column (`"see attachment"`, `"TBD"`)

**Scoring**: Deterministic — match `intentType` from `propose_transformation_step` tool calls against expected intents. No LLM judge needed.

**Target**: Platform 16+/20. sklearn baseline 2-4/20.

### Benchmark 4: Preprocessing Agreement (P1)

**Hero metric**: Composite score combining Jaccard similarity, downstream metric ratio, outperformance bonus.

**Expert reference plans** (defined as JSON):

- **Titanic** (7 ops): Drop Ticket/Cabin, impute Age by Pclass median, one-hot Sex/Embarked, engineer FamilySize, bin Fare
- **Ames Housing** (8 ops): Drop >80% null cols, grouped imputation, log-transform SalePrice, ordinal-encode quality features, winsorize outliers
- **Credit Fraud** (5 ops): Drop Time, RobustScaler on Amount, verify no nulls, flag imbalance, skip encoding for PCA features
- **Adult Income** (6 ops): Strip whitespace, replace `" ?"` sentinels, impute categoricals, one-hot 7 columns, drop `education-num`/`fnlwgt`
- **Melbourne Housing** (7 ops): Drop/parse Address+Date, impute BuildingArea+YearBuilt, one-hot low-cardinality, log-transform Price, frequency-encode Suburb

**Composite**: `0.4 × mean_jaccard + 0.4 × mean_downstream_ratio + 0.2 × outperformance_bonus`

**Target**: Jaccard >0.65, downstream ratio >0.95, at least 1 outperformance case.

### Benchmark 5: NL→SQL Accuracy (P1)

**Hero metric**: Weighted accuracy across 30 queries. Secondary: repair recovery rate.

**Test dataset**: `mock_customer_churn_clean.csv` (150 rows, 19 columns, mixed types).

**Query tiers**:
- Tier 1 (10 simple): COUNT, AVG, single-condition → expect >95%
- Tier 2 (10 medium): GROUP BY, HAVING, multi-condition → expect >80%
- Tier 3 (10 hard): Window functions, subqueries, CASE → expect >60%

**Scoring**: 3 pts per query (execution + result + semantic equivalence). Tier weighting: 1×/1.5×/2×. Total: 135 weighted points.

**Key differentiator**: Repair recovery rate — how often `runRepairPipeline` fixes initially-failing Tier 3 queries. Target: >50% recovery.

**Baseline**: GPT-4o single-shot with identical schema context. Isolates the value of our two-pass pipeline + repair loop.

---

## 5. Automation Architecture

### Approach: 100% API-driven

No Playwright for data collection. The backend has full HTTP coverage for the entire workflow:

```
POST /auth/register → POST /projects → POST /upload/dataset
→ POST /workflows/turns/stream (NDJSON) → POST /models/train
→ GET /experiments/:modelId/evaluation
```

### Baselines: what we run vs. cite

| Baseline | Method | Effort |
|----------|--------|--------|
| Naive sklearn | Python script, default params | ~30 min to write |
| Competent sklearn | Python script, Pipeline + RandomizedSearchCV | ~1 hr to write |
| AutoGluon | Python script, `medium_quality` preset | ~15 min to write |
| Manual Jupyter | Cite literature (1-4 hrs per Wang et al. 2021) | Zero |
| ChatGPT-assisted | Cite + one recorded session | ~30 min |
| GPT-4o NL→SQL | OpenAI API script, single-shot | ~30 min to write |

**Total baseline effort: ~2-3 hours scripting.**

### Statistical approach

- 5 reps per LLM-driven condition
- Report median (IQR), not mean ± std
- Wilcoxon signed-rank for paired comparisons
- Pin LLM model version + temperature=0
- Fixed `random_state=42` across all systems

### Run budget

| Benchmark | Runs | Est. Time | Total |
|-----------|------|-----------|-------|
| Time-to-Model + Quality | 25 (5×5) | ~3 min each | ~75 min |
| Poisoned Dataset | 30 (10×3) | ~2 min each | ~60 min |
| Preprocessing Agreement | 15 (5×3) | ~2 min each | ~30 min |
| NL→SQL | 90 (30×3) | ~5 sec each | ~8 min |
| **Total** | | | **~2.5 hrs** |

---

## 6. Open Questions for Future Sessions

- **Dataset selection**: Should we swap Wine Quality or Favorita for something more compelling? Favorita (3M+ rows, multi-table) may be too complex for reliable automated benchmarking.
- **Poisoned dataset generation**: The synthetic `loan_applications.csv` needs to be realistic enough that the flaws aren't trivially detectable by column names alone.
- **Preprocessing agreement scoring**: The Jaccard approach treats all operations as equally important — should we weight critical operations (leakage prevention) higher?
- **NL→SQL query design**: The 30 queries need careful design so they're unambiguous and have deterministic expected results.
- **Presentation layer**: Once results are collected, how do we present them? In the video? On the poster? As an interactive dashboard within the app?
- **Narrative framing**: What's the single headline? "8× faster than manual ML" or "catches 8/10 data issues that sklearn misses" or "expert-quality models in under 5 minutes"?
