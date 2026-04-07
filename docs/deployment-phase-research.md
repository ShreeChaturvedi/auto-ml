# Deployment Phase: Research Report

Compiled 2026-04-02. This document provides research findings for designing and implementing the deployment phase of the AutoML platform. A companion document (`deployment-phase-insights.md`) contains prior analysis from MR !102.

## What This Document Covers

The deployment phase lets users deploy trained scikit-learn models as inference endpoints, test predictions interactively, and monitor deployed models. This research covers:

- **Part I** — What competitors do and what industry standards exist
- **Part II** — The preprocessing/serialization problem (the #1 technical risk)
- **Part III** — Backend system design (inference server, API routing, monitoring)
- **Part IV** — Frontend UI/UX design (dashboard, playground, graduation UX)
- **Part V** — Differentiation ideas and scope recommendations

### Key Decisions Surfaced

| Decision | Research Recommendation | Rationale |
|----------|----------------------|-----------|
| Preprocessing approach | `sklearn.Pipeline` + `ColumnTransformer` | Eliminates train/serve skew; one artifact, zero preprocessing at inference |
| Inference framework | FastAPI + Uvicorn inside Docker | ~15MB added to existing image; auto-generates OpenAPI docs for playground |
| Reverse proxy | `http-proxy-middleware` in Express | Dynamic routing via `async router(req)`, WebSocket-capable |
| UI paradigm | Dashboard (ExperimentsDashboard pattern) | Deployment is status + action, not iterative conversation |
| Drift detection | Pure scipy/numpy (KS test, PSI, chi-squared) | Zero new Python dependencies; runs in existing containers |
| Deployment state | Postgres `deployments` table (source of truth) + in-memory cache | Survives server restarts; cache rebuilds from DB + Docker inspection |

### Open Questions for the Human

1. **Pipeline refactor sequencing** — Should the Pipeline/ColumnTransformer migration (touches 5 existing files) be a prerequisite task planned separately, or bundled into the deployment phase?
2. **Scope cut** — Which of these are in-scope for initial implementation: basic deploy/status, playground, code snippets, prediction logging, monitoring, drift detection, novel features?
3. **Legacy model compatibility** — After Pipeline migration, existing bare-estimator models cannot be deployed without retraining. Is this acceptable, or do we need a compatibility shim?
4. **Feature type persistence** — The current `ModelRecord.featureColumns` stores post-encoding names as `string[]` with no type info. The Pipeline approach changes these to pre-encoding names. Where should feature types (numeric/categorical) be persisted?

---

## Table of Contents

- [Part I: Landscape & Standards](#part-i-landscape--standards)
  - [1. Competitor Analysis](#1-competitor-analysis)
  - [2. Model Serving Standards](#2-model-serving-standards)
- [Part II: The Preprocessing Problem](#part-ii-the-preprocessing-problem)
  - [3. Current Preprocessing State](#3-current-preprocessing-state)
  - [4. Train/Serve Skew: Bugs and Solution](#4-trainserve-skew-bugs-and-solution)
- [Part III: Backend System Design](#part-iii-backend-system-design)
  - [5. Codebase: Reusable Components](#5-codebase-reusable-components)
  - [6. Inference Server Implementation](#6-inference-server-implementation)
  - [7. API Design & Routing](#7-api-design--routing)
  - [8. Monitoring & Drift Detection](#8-monitoring--drift-detection)
- [Part IV: Frontend UI/UX Design](#part-iv-frontend-uiux-design)
  - [9. UI Architecture: Dashboard Pattern](#9-ui-architecture-dashboard-pattern)
  - [10. Deployment Dashboard & Flow](#10-deployment-dashboard--flow)
  - [11. Adaptive Prediction Playground](#11-adaptive-prediction-playground)
  - [12. Graduation UX: Deployment Readiness](#12-graduation-ux-deployment-readiness)
- [Part V: Differentiation & Scope](#part-v-differentiation--scope)
  - [13. Novel & Differentiating Ideas](#13-novel--differentiating-ideas)
  - [14. Scope & Dependency Ordering](#14-scope--dependency-ordering)
- [Appendix A: Requirements Checklist](#appendix-a-requirements-checklist)
- [Appendix B: Glossary](#appendix-b-glossary)

---

# Part I: Landscape & Standards

## 1. Competitor Analysis

### DataRobot
- **Deploy flow:** One-click from leaderboard. REST endpoint live in seconds.
- **Post-deploy dashboard:** Tabs for Overview, Service Health, Data Drift, Accuracy, Fairness, Predictions, Activity Log.
- **Standout features:** Champion/Challenger model comparison in production. Per-prediction SHAP explanations returned with every inference. "Humility Rules" — the model returns an "uncertain" response when confidence falls below a configured threshold.
- **Weakness:** Enterprise-only. The sheer number of monitoring tabs can overwhelm non-expert users.

### Google Vertex AI
- **Deploy flow:** Model Registry → "Deploy to Endpoint" → config wizard (machine type, replicas, traffic split).
- **Post-deploy:** Endpoint detail page with an inline "Test your model" section — paste JSON, click Predict, see response. Auto-generated Python/curl code snippets.
- **Standout:** The inline prediction testing interface is the best in the industry for tabular models. Batch prediction is a first-class operation alongside real-time.
- **Weakness:** Requires GCP expertise (projects, regions, IAM). Console is slow.

### Azure ML
- **Deploy flow:** Model → Deploy → Real-time endpoint → scoring script + environment config.
- **Post-deploy:** "Test" tab with pre-populated sample input. "Consume" tab with multi-language code snippets (Python, C#, R, curl). Inline metrics graphs (latency, request count, CPU/memory).
- **Standout:** Auto-generated Swagger/OpenAPI spec per endpoint. Blue/green deployments with traffic percentage control in the UI.
- **Weakness:** The scoring script requirement adds friction for simple models. Azure portal is dense.

### Hugging Face Inference Endpoints
- **Deploy flow:** Model page → "Deploy" → select instance + security → 1-5 min deploy.
- **Post-deploy:** Clean layout with status indicator, endpoint URL, adaptive playground (UI changes based on model task type), API snippets, live container logs streamed in-browser, basic metrics.
- **Standout:** The adaptive test interface knows whether you're testing a classifier, generator, or image model and shows appropriate I/O widgets. Scale-to-zero with automatic wake-up. Live container logs in-browser.
- **Weakness:** Limited to HF ecosystem. No drift monitoring.

### MLflow (Open Source)
- **Deploy flow:** Model Registry → stage promotion (None → Staging → Production) → `mlflow models serve` CLI.
- **Post-deploy:** No deployment dashboard in open-source. Just a REST endpoint at `/invocations`.
- **Standout:** Model flavor system — one model loadable as PyFunc, sklearn, etc. MLmodel packaging format is widely adopted across ML frameworks.
- **Weakness:** Massive gap between registry and production serving. No UI for testing or monitoring.

### Weights & Biases
- **No deployment feature.** Deliberate scope decision — W&B is a model registry, not a serving platform.
- **Standout:** Artifact lineage graph — trace from a deployed model back through all upstream runs and datasets. Best provenance tracking of any platform reviewed.

### Gradio / Streamlit
- Not traditional AutoML platforms, but the closest competitors to the **playground concept**. Gradio auto-generates prediction forms from Python function signatures. Streamlit builds interactive dashboards from scripts.
- **Relevant lesson:** Gradio's `gr.Interface` auto-infers input widgets from type hints — sliders for floats, dropdowns for categoricals. This is the same pattern the deployment playground should follow, using model metadata instead of type hints.
- **Weakness:** Both require manual setup per model. The AutoML platform's advantage is that the playground is auto-generated from training metadata with zero user effort.

### Key Patterns Worth Adopting

| Pattern | Best Example | Why It Matters |
|---------|-------------|----------------|
| One-click deploy from training results | DataRobot | Eliminates friction between training and serving |
| Inline prediction testing with form-based input | Vertex AI, HF | Users verify the endpoint works without writing code |
| Auto-generated code snippets | Azure ML "Consume" tab | Bridges "deployed" to "integrated into my app" |
| Adaptive test interface by task type | Hugging Face | Different model types need different I/O widgets |
| Per-prediction explanations | DataRobot | Builds trust and enables debugging |
| Embedded monitoring (not a separate page) | Azure ML, DataRobot | Users see health without navigating away |
| Live container logs | Hugging Face | Essential for debugging deployment issues |

---

## 2. Model Serving Standards

### Serialization

**Recommendation: `joblib`** (already what the current training pipeline produces as `model.joblib`).

| Format | Fit | Notes |
|--------|-----|-------|
| **joblib** | Primary | scikit-learn standard. Zero-friction. Version-coupled to sklearn. |
| cloudpickle | If needed | Required only if users define custom transformers in notebook cells (serializes class definitions alongside instances). |
| ONNX (via skl2onnx) | Optional v2 | 2-10x inference speedup, language-agnostic, no code execution risk. But incomplete estimator support — `GradientBoostingClassifier` and `KMeans` have known conversion edge cases. Not reliable enough for all 8 model templates. |
| PMML | Skip | Stale ecosystem, JVM dependency, no advantage over ONNX. |

**Security note:** Pickle/joblib execute arbitrary code on deserialization. The existing sandboxed Docker containers (non-root user, read-only filesystem, resource limits) mitigate this. Never deserialize user-uploaded pickle files on the host process.

### Inference Server Framework

**Recommendation: FastAPI + Uvicorn.**

| Framework | Fit | Notes |
|-----------|-----|-------|
| **FastAPI + Uvicorn** | Best | ~15MB added to container. Auto-generates OpenAPI/Swagger docs (feeds the playground). Pydantic v2 validation. Async-native. |
| Flask + Gunicorn | Inferior | No auto docs, no validation, higher memory, more boilerplate. |
| BentoML | Overkill | Adds model registry + batching + packaging the platform already has. ~200MB extra. |
| MLServer (Seldon) | Enterprise | V2 Inference Protocol compliant, but tensor-oriented format is awkward for tabular data. |

### Prediction API Format

**Recommendation: Named-feature JSON** (not the V2 Inference Protocol, which uses tensor shapes/indices instead of feature names — awkward for tabular ML).

```json
// Request — single or batch
{
  "instances": [
    {"age": 25, "income": 50000, "category": "A"}
  ]
}

// Classification response
{
  "predictions": ["approved"],
  "probabilities": [{"approved": 0.87, "denied": 0.13}],
  "model_id": "abc-123",
  "latency_ms": 12
}

// Regression response
{
  "predictions": [245000.50],
  "prediction_interval": {"lower": 220000, "upper": 270000, "confidence": 0.90},
  "model_id": "abc-123",
  "latency_ms": 8
}
```

### Health Check Endpoints

Three endpoints following the Kubernetes probe pattern (useful even outside K8s):

| Endpoint | Purpose | Returns 200 When |
|----------|---------|-------------------|
| `GET /health/live` | Liveness — is the process running? | Always (unless deadlocked) |
| `GET /health/ready` | Readiness — can it accept traffic? | Model is loaded and warm-up prediction succeeded |
| `GET /health/startup` | Startup — has initial loading finished? | After model load + warm-up (prevents premature liveness kills) |

```json
// GET /health/ready response
{"status": "ready", "model_id": "abc-123", "uptime_seconds": 3412}
```

### Container Lifecycle: Cold Start Strategy

Existing Docker images are ~2GB. Container startup: 2-5s. Model loading: 0.5-5s. Total cold start: **3-10 seconds**.

**Recommendation: Tiered lifecycle managed by the deployment manager service.**

| Tier | State | Resume Time | Trigger |
|------|-------|-------------|---------|
| **Active** | Container running, model loaded | 0ms (immediate) | Default on deploy. Deployment manager demotes to Standby after 15 minutes of zero predict requests. |
| **Standby** | Container stopped (`docker stop`), filesystem cached | ~2-3s (`docker start`) | First predict request triggers resume. Express returns 503 with `Retry-After: 3` while starting. |
| **Archived** | No container, only model artifact on disk | 5-10s (full `docker run` + model load) | Standby containers with no requests in 24h are removed. |

For expo demos: keep deployed models in Active tier during the presentation.

---

# Part II: The Preprocessing Problem

This is the highest-impact design decision for the deployment phase. Getting it wrong means every deployed model produces subtly wrong predictions that users will never catch.

## 3. Current Preprocessing State

### What `buildTrainingScript()` Does Today

**File:** `backend/src/services/modelTraining.ts` (lines 55-189)

The training script performs preprocessing in 6 steps before calling `model.fit()`:

```python
# Step 1: Auto-detect column types
numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()
categorical_cols = [col for col in X.columns if col not in numeric_cols]

# Step 2: Fill numeric missing values with column medians (computed over full training set)
X[numeric_cols] = X[numeric_cols].fillna(X[numeric_cols].median())

# Step 3: Fill categorical missing values with string 'missing'
X[categorical_cols] = X[categorical_cols].fillna('missing')

# Step 4: One-hot encode categoricals (keeps ALL categories, no drop_first)
X = pd.get_dummies(X, columns=categorical_cols, drop_first=False)

# Step 5: Fill any remaining NaN with 0
X = X.fillna(0)

# Step 6: Capture post-encoding column names
feature_columns = list(X.columns)
```

### What's Saved vs What's Lost

| Artifact | Saved? | Location |
|----------|--------|----------|
| Trained model (bare estimator) | Yes | `storage/models/artifacts/{modelId}/model.joblib` |
| Post-encoding feature column names | Yes | `storage/models/artifacts/{modelId}/metrics.json` → `featureColumns` |
| Training metrics | Yes | `metrics.json` → `metrics` |
| Training script source | Yes | `storage/models/artifacts/{modelId}/train.py` |
| **Numeric medians per column** | **No** | Computed during training, discarded |
| **Categorical value sets** | **No** | Computed during training, discarded |
| **Pre-encoding column names/types** | **No** | Only `targetColumn` is stored |
| **Column ordering guarantee** | **No** | Only implied by `featureColumns` list order |

### Where Preprocessing Is Replicated

The same preprocessing logic exists in **4 separate locations** that must stay in sync:

| File | Purpose | How It Works |
|------|---------|-------------|
| `backend/src/services/modelTraining.ts` | Initial training | Inline preprocessing code |
| `backend/src/services/pythonScriptUtils.ts` | Shared utility | `buildPreprocessingLines()` — called by evaluation + tuning |
| `backend/src/services/evaluationService.ts` | Post-training eval | Calls `buildPreprocessingLines()` |
| `backend/src/services/tuningScriptBuilder.ts` | Optuna hyperparameter tuning | Calls `buildPreprocessingLines()` |
| `frontend/src/lib/training/modelCode.ts` | Frontend code preview | Independent copy of the same logic |

All four produce correct results **only because they reload the same full training dataset**. The medians are re-derived from the same data, producing identical values. This breaks the moment inference runs on new data or a single row.

### Model Templates

All 8 templates use scikit-learn. No alternative libraries.

| Template ID | Algorithm | Task Type | `predict_proba` | `feature_importances_` | `coef_` |
|-------------|-----------|-----------|-----------------|----------------------|---------|
| `random_forest_classifier` | RandomForestClassifier | classification | Yes | Yes | No |
| `logistic_regression` | LogisticRegression | classification | Yes | No | Yes |
| `knn_classifier` | KNeighborsClassifier | classification | Yes | No | No |
| `gradient_boosting_classifier` | GradientBoostingClassifier | classification | Yes | Yes | No |
| `random_forest_regressor` | RandomForestRegressor | regression | No | Yes | No |
| `linear_regression` | LinearRegression | regression | No | No | Yes |
| `ridge_regression` | Ridge | regression | No | No | Yes |
| `kmeans` | KMeans | clustering | No | No | No |

**File:** `backend/src/services/modelTemplates.ts` (referenced in `modelTraining.ts`)

---

## 4. Train/Serve Skew: Bugs and Solution

### Specific Bugs at Inference Time

| Bug | What Happens at Training | What Happens at Inference (Single Row) | Consequence |
|-----|-------------------------|---------------------------------------|-------------|
| `fillna(median)` | Median computed over N rows — meaningful | `pd.Series([NaN]).median()` returns NaN → `fillna` is a no-op | Missing values pass through unimputed → crash or undefined behavior |
| `pd.get_dummies` column count | Produces columns for ALL categories in dataset | Produces columns for ONLY categories present in this row | Column count mismatch → `ValueError` or silent misalignment |
| Unseen category | N/A | `get_dummies` creates a new column the model never saw | Crash or garbage predictions |
| Column ordering | Deterministic for full dataset | No ordering guarantee across separate DataFrames | Tree models use feature index, not name → silent wrong splits |
| Dtype detection | `zip_code` as int → numeric | JSON API sends `"10001"` as string → detected as categorical | Completely wrong feature space, wrong encoding applied |

### Solution: `sklearn.Pipeline` + `ColumnTransformer`

Wrap preprocessing and estimator into a single serializable Pipeline. When saved with `joblib.dump(pipeline)`, ALL fitted state is captured: learned medians (`SimpleImputer.statistics_`), category mappings (`OneHotEncoder.categories_`), scaling parameters, and column routing.

```python
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder, StandardScaler

numeric_transformer = Pipeline([
    ("imputer", SimpleImputer(strategy="median")),
    ("scaler", StandardScaler()),
])
categorical_transformer = Pipeline([
    ("imputer", SimpleImputer(strategy="constant", fill_value="missing")),
    ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    # handle_unknown="ignore" silently zero-encodes unseen categories
    # sparse_output=False returns dense array — required for compatibility with all estimators
])
preprocessor = ColumnTransformer([
    ("num", numeric_transformer, numeric_cols),
    ("cat", categorical_transformer, categorical_cols),
])
pipeline = Pipeline([("preprocessor", preprocessor), ("model", estimator)])
pipeline.fit(X_train, y_train)
joblib.dump(pipeline, model_path)
```

At inference, the entire preprocessing-at-serve question disappears:

```python
pipeline = joblib.load("model.joblib")
raw_input = pd.DataFrame([{"age": 35, "income": 50000, "category": "A"}])
prediction = pipeline.predict(raw_input)     # Preprocessing happens internally
probas = pipeline.predict_proba(raw_input)   # Also works transparently
```

### Impact on Existing Services

| File | Change Required |
|------|----------------|
| `modelTraining.ts:buildTrainingScript()` | Emit Pipeline + ColumnTransformer instead of manual preprocessing. Save pipeline as `model.joblib`. |
| `pythonScriptUtils.ts:buildPreprocessingLines()` | Remove or replace — preprocessing moves inside the Pipeline. |
| `evaluationService.ts:buildEvaluationScript()` | Remove preprocessing block. Access estimator via `pipeline.named_steps['model']` for `feature_importances_`, `coef_`, `predict_proba`, `classes_`. Get post-encoding feature names from `pipeline.named_steps['preprocessor'].get_feature_names_out()`. **This is the largest change** — the evaluation script is hundreds of lines of generated Python that currently reference `model.xxx` directly. Every attribute access must change to `pipeline.named_steps['model'].xxx`. |
| `tuningScriptBuilder.ts:buildTuningScript()` | Construct a new Pipeline per Optuna trial (hyperparameters change the estimator). The Pipeline construction (~15 lines of Python) must be emitted by the TypeScript code generator, parameterized by the trial's suggested hyperparameters. |
| `frontend/src/lib/training/modelCode.ts` | Update code preview to show Pipeline construction. |

### SHAP Compatibility

SHAP explainers expect a bare estimator, not a Pipeline. Split the steps:

```python
# Transform data through preprocessing, then explain the bare estimator
X_preprocessed = pipeline.named_steps['preprocessor'].transform(X)
estimator = pipeline.named_steps['model']
explainer = shap.TreeExplainer(estimator)  # or LinearExplainer for linear models
shap_values = explainer.shap_values(X_preprocessed)

# Feature names come from the ColumnTransformer
feature_names = pipeline.named_steps['preprocessor'].get_feature_names_out()
# Returns: ['num__age', 'num__income', 'cat__category_A', 'cat__category_B', ...]
```

**Note:** The explainer should be cached in process memory (per-container) after first creation to avoid re-computation on every explain request.

### `featureColumns` Semantic Change

After Pipeline migration, the model accepts **raw, pre-encoding** feature names (e.g., `["age", "income", "category"]`), not post-encoding names (e.g., `["age", "income", "category_A", "category_B"]`). The `featureColumns` stored in the database, used by the frontend playground form, and referenced in SHAP visualizations must reflect this change. The post-encoding names are still available via `pipeline.named_steps['preprocessor'].get_feature_names_out()` when needed for internal model analysis.

### Cross-Validation Correctness (Bonus)

The current tuning code computes medians across the entire dataset (including test folds) before calling `cross_val_score`, which means the model indirectly sees test data during training. Wrapping preprocessing in a Pipeline ensures `cross_val_score` re-fits the imputer on each training fold alone — preventing data leakage and producing honest validation scores.

### Alternative: Frozen Artifacts

Instead of Pipeline, save medians/categories/column-order as a `preprocessing.json` file and re-apply at inference. **Pipeline is strictly superior** for correctness and maintenance. The only advantage of frozen artifacts is backward compatibility with existing bare-estimator models. Recommendation: apply Pipeline to all newly trained models. Existing models either (a) require retraining before deployment, or (b) receive a lightweight frozen-artifact adapter as a compatibility shim. See Open Question #3.

---

# Part III: Backend System Design

## 5. Codebase: Reusable Components

### Existing Infrastructure That Deployment Builds On

| Component | File | Reuse for Deployment |
|-----------|------|---------------------|
| Container lifecycle | `backend/src/services/containerManager.ts` | Same `Map<string, Container>` pattern for deployment registry cache. Same stale cleanup via `setInterval`. |
| Container orchestration | `backend/src/utils/containerOrchestrator.ts` | 6-step flow: get container → sync data → copy files → execute → collect results. Template for the deploy script execution. |
| Docker run args | `backend/src/services/container/dockerBuilder.ts` | Same security constraints (read-only root, tmpfs, non-root user, resource limits). Same `-p 0:PORT` dynamic port mapping. |
| Image building | `backend/src/services/container/imageManager.ts` | Promise-deduplication pattern (`imageBuilds` Map) prevents concurrent duplicate builds. Reuse for concurrent deployment creation. |
| Network management | `backend/src/services/container/networkManager.ts` | **Important:** Currently creates `automl-sandbox` network with `--internal` flag (blocks all outbound, including connections from the host). See Section 7 for how this affects inference routing. |
| Model artifacts | `backend/src/services/modelTraining.ts` | Saves `model.joblib`, `metrics.json`, `train.py` to `storage/models/artifacts/{modelId}/`. |
| Model repository | `backend/src/repositories/modelRepository.ts` | CRUD for model metadata. Postgres-backed in production. |
| Health service | `backend/src/services/healthService.ts` | Pattern for polling health endpoints with timeout (1.5s). |
| Evaluation orchestration | `backend/src/services/evaluationService.ts` | Same container orchestration pattern for background Python execution. |
| WebSocket server | `backend/src/services/websocket/wsServer.ts` | Existing pub-sub broadcast on `/ws/notebook`. Can add deployment status topics. Uses JWT from query params for auth. |

### Database Schema: Models Table

**Migration files:** `backend/migrations/014_models.sql` and `015_models_version.sql`

```sql
models (
  model_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  name TEXT NOT NULL,
  template_id TEXT NOT NULL,
  task_type TEXT CHECK (IN ('classification', 'regression', 'clustering')),
  library TEXT NOT NULL,      -- always 'sklearn' currently
  algorithm TEXT NOT NULL,
  parameters JSONB,
  metrics JSONB,
  status TEXT CHECK (IN ('completed', 'failed')),
  training_ms INTEGER,
  target_column TEXT,
  feature_columns JSONB,     -- post-encoding names (changes to pre-encoding with Pipeline)
  sample_count INTEGER,
  artifact JSONB,            -- {filename, path, size}
  error TEXT,
  metadata JSONB,
  evaluation_status TEXT,    -- 'pending' | 'computing' | 'ready' | 'failed'
  version INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

**What's missing for deployment:** No deployment status, no endpoint URL, no deployment timestamp. See Section 7 for the proposed `deployments` table.

### Frontend Phase System

- `Phase` type in `frontend/src/types/phase.ts` already includes `'deployment'`.
- Placeholder div exists in `frontend/src/pages/ProjectWorkspace.tsx` (lines 164-177).
- Phase unlock/lock managed by `useProjectStore` in `frontend/src/stores/projectStore.ts`.
- Navigation via `WorkflowPhaseTree` in `frontend/src/components/layout/WorkflowPhaseTree.tsx`.
- Project color theming via `projectColorClasses` from `frontend/src/types/project.ts`.
- API client with JWT auth and token refresh in `frontend/src/lib/api/client.ts`.

### Migration Conventions

Migration files live in `backend/migrations/` as sequential numbered `.sql` files (currently up to `016_plan_chats.sql`). Run by `backend/src/scripts/runMigrations.ts` via `npm run db:migrate`. All migrations use `IF NOT EXISTS` for idempotency.

---

## 6. Inference Server Implementation

**Assumption:** This section assumes the Pipeline approach from Part II is adopted. The inference server calls `pipeline.predict()` on raw feature DataFrames with no preprocessing code.

### Code Generation Approach

The platform already generates Python training scripts dynamically in `modelTraining.ts:buildTrainingScript()`. A parallel function — `buildInferenceServerScript()` — generates a model-specific FastAPI server.

**Where to put it:** New file `backend/src/services/inferenceServerBuilder.ts` (parallels `modelTraining.ts`).

**Input:** Model metadata from `ModelRecord` — `modelId`, `taskType`, `featureColumns` (pre-encoding names after Pipeline migration), `featureTypes` (new field: `Record<string, 'float' | 'int' | 'str'>`), `classLabels` (for classification), `sampleRequest` (example input row from training data).

**Output:** A `serve.py` file saved to `storage/models/artifacts/{modelId}/serve.py`.

### What the Generated Server Looks Like

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query
from pydantic import BaseModel, Field
import joblib, numpy as np, pandas as pd, time, uuid, json

# -- Pydantic request model with actual feature names (generated per model) --
class PredictionInput(BaseModel):
    age: float = Field(..., examples=[35.0])
    income: float = Field(..., examples=[50000.0])
    category: str = Field(..., examples=["A"])

class PredictionResponse(BaseModel):
    request_id: str
    prediction: ...          # type depends on task_type
    probabilities: dict[str, float] | None = None   # classification only
    prediction_interval: dict[str, float] | None = None  # regression only
    feature_contributions: dict[str, float] | None = None  # SHAP, opt-in
    latency_ms: float
    model_id: str

# -- Model loading at startup --
state: dict = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    state["pipeline"] = joblib.load("/workspace/model.joblib")
    # Warm-up prediction to trigger any lazy initialization
    dummy = pd.DataFrame([{col: 0 for col in FEATURE_COLUMNS}])
    state["pipeline"].predict(dummy)
    state["ready"] = True
    yield
    state.clear()

app = FastAPI(title="Inference: {model_id}", lifespan=lifespan)

@app.post("/predict", response_model=PredictionResponse)
async def predict(req: PredictionInput, explain: bool = Query(False)):
    start = time.perf_counter()
    pipeline = state["pipeline"]
    df = pd.DataFrame([req.model_dump()])
    prediction = pipeline.predict(df)[0]
    # ... task-type-specific response fields ...
    # ... optional SHAP via ?explain=true ...
    return PredictionResponse(...)

@app.get("/health/ready")
async def readiness():
    if state.get("ready"):
        return {"status": "ready", "model_id": MODEL_ID}
    return JSONResponse({"status": "loading"}, status_code=503)
```

The `PredictionInput` class is generated dynamically from the model's `featureColumns` and `featureTypes`, so the auto-generated Swagger docs at `/docs` show the exact expected input fields. Users can test predictions directly from the Swagger UI.

### Dockerfile Changes

Add two pip packages to `backend/docker/Dockerfile.python-runtime`:

```dockerfile
RUN pip install --no-cache-dir fastapi==0.115.0 uvicorn[standard]==0.30.0
```

~15MB added to the image. Everything else (numpy, pandas, scikit-learn, shap, joblib) already present.

### Container Entrypoint

For inference containers, override the default Kernel Gateway entrypoint. In `dockerBuilder.ts`, add inference-specific args:

```
'--entrypoint', 'python', imageName, '/workspace/serve.py'
```

Map the inference port (e.g., 8000) instead of the Kernel Gateway port (8888):

```
'-p', '0:8000'
```

### Prediction Logging Inside the Container

The inference server appends each prediction to `/workspace/predictions.jsonl` as structured JSON. Because `/workspace` is bind-mounted to the project's artifact directory on the host (`dockerBuilder.ts` uses `-v ${absWorkspacePath}:/workspace:rw`), the backend can read this file directly without `docker exec`.

```python
# Inside predict endpoint, after computing response:
with open("/workspace/predictions.jsonl", "a") as f:
    f.write(json.dumps({
        "ts": time.time(),
        "request_id": response.request_id,
        "input": req.model_dump(),
        "prediction": response.prediction,
        "latency_ms": response.latency_ms,
    }) + "\n")
```

The backend deployment service periodically ingests this file into the `prediction_logs` Postgres table (see Section 8).

---

## 7. API Design & Routing

### REST Endpoints

```
POST   /api/deployments                         → Create deployment (spin up container)
GET    /api/deployments                         → List active deployments for project
GET    /api/deployments/:id                     → Deployment details + status
DELETE /api/deployments/:id                     → Tear down deployment

POST   /api/deployments/:id/predict             → Proxied to container's /predict
GET    /api/deployments/:id/health              → Container health (not proxied — backend checks directly)
GET    /api/deployments/:id/schema              → Input/output schema (from model metadata, no container needed)
GET    /api/deployments/:id/logs                → Prediction history from prediction_logs table

POST   /api/deployments/:id/api-keys            → Generate API key for external consumers
DELETE /api/deployments/:id/api-keys/:keyId      → Revoke API key
```

**New route file:** `backend/src/routes/deployments.ts`

### Database: `deployments` Table

**Recommendation: Separate table** (not columns on `models`). This allows deployment history, multiple deployments per model (for A/B comparison), and clean lifecycle tracking.

```sql
-- Migration: 017_deployments.sql
CREATE TABLE IF NOT EXISTS deployments (
  deployment_id TEXT PRIMARY KEY,
  model_id      TEXT NOT NULL REFERENCES models(model_id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'starting'
                CHECK (status IN ('starting','healthy','unhealthy','stopping','stopped','failed')),
  container_id  TEXT,             -- Docker container ID
  port          INTEGER,          -- Host-mapped port
  endpoint_url  TEXT,             -- Full URL for predict endpoint
  config        JSONB DEFAULT '{}', -- Resource limits, env vars, etc.
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  stopped_at    TIMESTAMPTZ
);

CREATE INDEX idx_deployments_project ON deployments(project_id);
CREATE INDEX idx_deployments_model   ON deployments(model_id);
```

### Deployment Manager Service

**New file:** `backend/src/services/deploymentManager.ts`

This mirrors `containerManager.ts` in structure:
- **In-memory cache:** `Map<string, DeploymentEntry>` for fast lookups during predict proxying.
- **Source of truth:** The `deployments` Postgres table. On server startup, the deployment manager queries the database and reconciles with Docker (via `docker ps`) to rebuild the cache. Containers that exist in DB but not Docker are marked `stopped`. Containers that exist in Docker but not DB are killed (orphan cleanup).
- **Health check loop:** `setInterval` every 15 seconds. For each Active deployment, `fetch('http://127.0.0.1:${port}/health/ready')` with 3-second timeout. After 3 consecutive failures, mark `unhealthy` in DB and cache. Broadcast status change via WebSocket.
- **Lifecycle demotion:** `setInterval` every 5 minutes. Active deployments with no predict requests in 15 minutes → `docker stop` → status = `stopped`, tier = Standby.
- **Race condition handling:** Use a `pendingDeploys: Map<string, Promise<DeploymentEntry>>` promise-deduplication map (same pattern as `imageBuilds` in `imageManager.ts`) to prevent concurrent requests from creating duplicate containers.

### Reverse Proxy

**New dependency:** `npm install http-proxy-middleware`

```typescript
import { createProxyMiddleware } from 'http-proxy-middleware';

const predictProxy = createProxyMiddleware({
  router: async (req) => {
    const entry = deploymentCache.get(req.params.id);
    if (!entry) throw new Error('Deployment not found');
    return `http://127.0.0.1:${entry.port}`;
  },
  pathRewrite: { '^/api/deployments/[^/]+/predict': '/predict' },
});
```

### Network Configuration

**Important:** The existing `networkManager.ts` creates the `automl-sandbox` network with `--internal` flag, which blocks ALL outbound traffic — including connections from the Express backend on the host to the container's mapped port. The current Kernel Gateway approach works because it uses `-p 0:8888` port mapping, which Docker routes through the host network stack regardless of the `--internal` flag on the container's network.

**The same `-p 0:PORT` port mapping works for inference containers.** The Express backend connects to `127.0.0.1:<mapped_port>`, which Docker routes to the container. The `--internal` network still prevents the container from initiating outbound connections (no internet access from within the container), which is the desired security property. No network configuration changes needed.

### Authentication

- **Platform UI requests:** Existing `requireAuth` JWT middleware (from `backend/src/middleware/auth.ts`). Applied to all `/api/deployments` routes.
- **External API consumers:** Separate API key mechanism. Keys generated via `crypto.randomBytes(32).toString('base64url')`, shown once to the user, stored as bcrypt hash in a new `deployment_api_keys` table. The predict endpoint checks for `Authorization: Bearer <jwt>` first, then falls back to `X-API-Key: <key>` header.
- **Rate limiting:** In-memory sliding window per deployment. No Redis needed at capstone scale. The deployment manager service maintains a `Map<string, number[]>` of request timestamps per deployment ID, cleaned up every 60 seconds. Default limit: 60 requests/minute per deployment.

### Predict Request Flow

```
Frontend → POST /api/deployments/:id/predict
  → requireAuth middleware (JWT or API key)
  → rateLimitDeployment middleware
  → requireHealthyDeployment middleware (checks cache, returns 503 if starting/unhealthy)
  → http-proxy-middleware (routes to container's /predict)
  → FastAPI inside container handles prediction
  → Response flows back through proxy to frontend
```

---

## 8. Monitoring & Drift Detection

### Prediction Logging: Database Schema

```sql
-- Part of migration 017_deployments.sql
CREATE TABLE IF NOT EXISTS prediction_logs (
  id              BIGSERIAL PRIMARY KEY,
  deployment_id   TEXT NOT NULL REFERENCES deployments(deployment_id) ON DELETE CASCADE,
  model_id        TEXT NOT NULL,
  project_id      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latency_ms      INTEGER,
  input_features  JSONB NOT NULL,
  prediction      JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'success',  -- 'success' | 'error'
  error_message   TEXT,
  feedback        TEXT,          -- 'positive' | 'negative' (thumbs up/down)
  feedback_at     TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}'
);

CREATE INDEX idx_prediction_logs_deployment_time ON prediction_logs(deployment_id, created_at DESC);
CREATE INDEX idx_prediction_logs_project         ON prediction_logs(project_id, created_at DESC);
```

The deployment manager service periodically reads `/workspace/predictions.jsonl` from each active container and bulk-inserts rows into this table.

### Drift Detection

**Zero new Python dependencies.** The existing container has scipy 1.14.0 and numpy 1.26.4.

**Statistical tests:**
- **Numeric features:** Kolmogorov-Smirnov test (`scipy.stats.ks_2samp`) — compares the cumulative distribution of a feature in the reference (training) data vs recent predictions. Returns a p-value; low p-value = statistically significant shift.
- **Categorical features:** Chi-squared test (`scipy.stats.chi2_contingency`) — compares category frequency distributions.
- **Summary score:** Population Stability Index (PSI) — a single number per feature measuring distribution shift. Computed from numpy in ~15 lines. Industry-standard thresholds: PSI < 0.1 = no significant shift (green), 0.1-0.25 = moderate shift / investigate (yellow), > 0.25 = significant shift / action needed (red).

**Baseline:** Training data distribution statistics saved as `baseline.json` alongside the model artifact at training time. Contains per-feature: mean, std, min, max, quantiles, histogram bins/counts (numeric) or value_counts (categorical), plus prediction distribution from the test set. This requires extending `buildTrainingScript()` to emit baseline computation code.

**Execution:** The deployment manager service runs a drift detection Python script inside the existing container via `containerOrchestrator` pattern. Triggered either (a) by the frontend monitoring tab's "Check Drift" button, or (b) by a `setInterval` timer in the deployment manager (configurable interval, default 60 minutes, only for Active deployments).

**Alerting:** In-app only — no email/Slack. A health badge (green/yellow/red dot) on the deployment card, computed from the latest drift report. To avoid alert fatigue, require sustained drift across 3 consecutive check windows before escalating from green to yellow.

### Ground Truth Feedback

A full automated feedback loop (matching actual outcomes back to predictions) is enterprise scope. **Realistic for this project:** A thumbs-up/thumbs-down button on each prediction in the log UI. Stored as the `feedback` column on `prediction_logs`. Aggregate "user satisfaction" metric on the monitoring dashboard.

---

# Part IV: Frontend UI/UX Design

## 9. UI Architecture: Dashboard Pattern

The codebase has two existing UI paradigms:

| Paradigm | Used By | Layout | Interaction Model |
|----------|---------|--------|------------------|
| **AgenticShell** | Preprocessing, Feature Engineering, Training | Split-pane: chat + notebook | Chat-driven: user queries LLM, which invokes tools that create notebook cells |
| **ExperimentsDashboard** | Experiments | View-mode switching + detail panel | Click-driven: select models, toggle views, compare |

**Recommendation: Dashboard pattern.** Deployment is fundamentally about status and action (deploy, monitor, test, rollback), not iterative conversation. The AgenticShell requires a `DomainAdapter`, `WorkflowSessionStore`, and suggestion pills — infrastructure that adds complexity without serving the core deployment workflows.

**Note:** Adding agentic capabilities later (e.g., "deploy my best model with a 30-second timeout") would require building a `DeploymentAdapter` and integrating it with the dashboard. The current architecture does not support hybrid (dashboard + chat sidebar) within a single phase, so this would be new architecture.

**Key files to reference for the dashboard pattern:**
- `frontend/src/components/experiments/ExperimentsDashboard.tsx` — entry point with view mode switching
- `frontend/src/stores/experimentsStore.ts` — Zustand store tracking selected model, comparison set, view mode
- `frontend/src/components/experiments/utils/buildKpiCards.tsx` — KPI card generation pattern

**New files to create:**
- `frontend/src/components/deployment/DeploymentDashboard.tsx` — main phase component
- `frontend/src/stores/deploymentStore.ts` — Zustand store for deployment state
- `frontend/src/lib/api/deployments.ts` — typed API wrappers

---

## 10. Deployment Dashboard & Flow

### Tab Structure

```
[Overview]  [Playground]  [API Docs]  [Logs]  [Monitoring]
```

Mirrors Hugging Face's proven deployment detail structure.

### Overview Tab (Hero Card)

Displays at a glance:
1. **Status indicator** — CSS-animated pulsing green dot for healthy, non-animated filled amber for degraded/scaling, filled red for stopped, spinning blue for deploying. Always paired with a text label for accessibility.
2. **Endpoint URL** — monospace text with a copy-to-clipboard icon button.
3. **Model name and version** — secondary text.
4. **Three KPI sparkline charts** — request count, median latency, and uptime percentage over the last 24 hours. (Data source: aggregate queries on `prediction_logs` table. The existing `Sparkline.tsx` component from experiments is reusable.)

**Actions:** Primary "Pause" button visible in the header. Destructive actions (Stop, Delete) in a `DropdownMenu` (shadcn/ui) with confirmation dialog.

### Deploy Flow

1. User clicks "Deploy" on a model card in the Experiments leaderboard. (This requires adding a Deploy button/icon to `frontend/src/components/experiments/ModelCard.tsx` or equivalent.)
2. A `Sheet` (slide-over panel from shadcn/ui) appears with:
   - Model name (read-only, auto-selected — use `findChampionModelId()` from `frontend/src/components/experiments/utils.ts` for pre-selection)
   - Endpoint name (auto-generated, editable)
   - "Deploy" primary button
3. Below the primary fields, a collapsible "Advanced Options" section: resource limits (Small/Medium/Large presets), environment variables (key-value pairs).
4. Clicking "Deploy" → POST `/api/deployments` → Sheet closes → user navigated to deployment phase → Overview tab shows "Starting" status.

### Code Snippets Tab (API Docs)

Tabbed code blocks: `curl` | `Python` | `JavaScript`. Pre-filled with the endpoint URL and a placeholder API key. Copy button per snippet. Small "Download OpenAPI spec" link as a secondary action.

### Prediction Log Tab

Expandable-row table (shadcn/ui `Table` + custom expand):

| Column | Width | Content |
|--------|-------|---------|
| Timestamp | Fixed | Relative format ("2m ago") with tooltip for absolute |
| Status | Icon | Green check (success) / Red X (error) |
| Latency | Narrow | "42ms", color-coded (green < p50, amber < p95, red >= p95) |
| Input summary | Flexible | Truncated first few feature values |
| Prediction | Medium | Class label + confidence, or numeric value |

Expanded row: full JSON input/output, "Replay" button that pre-fills the Playground tab with that input. Filters: status toggle chips, time range presets (1h/24h/7d), latency threshold slider.

### Monitoring Tab

Four KPI summary cards at top + three charts below (7 visual elements total):

- **KPI cards:** Total requests (with sparkline), avg latency (with sparkline), error rate (with sparkline), uptime %
- **Charts:** Request volume area chart (Recharts `AreaChart`, project fill color), latency percentile lines (p50/p95/p99), prediction distribution histogram vs training baseline

Plus a **drift summary section**: per-feature drift indicators (green/yellow/red dots based on PSI thresholds), expandable to show side-by-side distribution histograms (training in gray, production in project theme color).

---

## 11. Adaptive Prediction Playground

The playground adapts its entire input surface and result visualization based on `model.taskType` (from `ModelRecord`), following the same pattern as Hugging Face's pipeline_tag-driven widget selection.

### Input Form

| Feature Type | Condition | Control |
|-------------|-----------|---------|
| Numeric (known min/max from training baseline) | Most numeric features | Slider + number input side by side |
| Numeric (no clear range) | Unbounded or sparse | Number input only |
| Categorical (2-4 values) | Small set | Radio buttons or chip group |
| Categorical (5-15 values) | Medium set | Dropdown/select |
| Categorical (15+ values) | Large set | Searchable combobox (shadcn/ui `Combobox`) |
| Boolean | Any | Toggle switch |

**For models with >20 features:** Sort by feature importance (from `evaluation.feature_importance.permutation`). Show the top features (whose cumulative importance exceeds 80%, min 5, max 8) always visible. Collapse the rest under an "Other Features" accordion.

**Pre-populated:** The form loads with example values from a `sampleRequest` field saved during training (one row from the training data, stored in `metrics.json`).

**Toggle:** `[Form]` | `[JSON]` tabs — Form for visual input, JSON editor (Monaco) for power users.

### Result Visualization by Task Type

**Classification:**
- **Predicted class** displayed prominently (large text, project theme color).
- **Probability horizontal bars** sorted descending by confidence. Color-coded: green (>0.8), amber (0.5-0.8), red (<0.5). Uses `projectColorClasses.fill` for the highest-confidence class.
- **Context (optional):** Show where this prediction falls on the pre-computed ROC curve from evaluation data.

**Regression:**
- **Predicted value** displayed prominently.
- **Prediction interval** as a horizontal range bar (for tree ensembles: computed from individual tree predictions at 5th and 95th percentiles; for linear models: from residual standard error).
- **Context:** Histogram of training target values with a vertical line at the predicted value — "your prediction is at the 73rd percentile of the training distribution."

**Clustering:**
- **Cluster assignment** with distance-to-centroids bar chart.
- **Cluster profile radar chart** showing normalized feature means per cluster (assigned cluster highlighted, others dimmed).
- **Context (if pre-computed):** 2D scatter from UMAP (Uniform Manifold Approximation and Projection — a dimensionality reduction algorithm that produces 2D coordinates from high-dimensional data) with the new point animated onto it.

### What-If Analysis (Stretch Goal)

- **Sensitivity sliders:** Change one feature value, prediction updates live (debounced 300ms). A small sparkline next to each slider shows the partial dependence curve for that feature.
- **SHAP waterfall:** "Explain this prediction" button → horizontal waterfall chart showing each feature's push/pull on the prediction. Computed via `?explain=true` query param on the predict endpoint.
- **Counterfactual explanations:** "What would need to change?" button → uses the DiCE library (`pip install dice-ml`, ~10MB — would need to be added to the Docker image) to generate diverse minimal changes for a different outcome. Displayed as annotated "diff cards." **Note:** DiCE is computationally expensive (seconds, not milliseconds) — must be async with a loading state. Requires specifying which features are mutable (e.g., cannot change age) — the UI needs a feature mutability config.
- **Comparison mode:** Original prediction pinned left, modified prediction right, delta highlighted.

### Batch Prediction (Stretch Goal)

CSV upload → validate columns match model features → progress bar (backend processes in chunks, streams progress via NDJSON) → results table with prediction column → summary visualization (class distribution for classification, value histogram for regression) → export as CSV/JSON.

---

## 12. Graduation UX: Deployment Readiness

The deployment phase is the terminal phase — `getNextPhase('deployment')` returns `undefined`. Users arrive here after investing effort across upload, explore, preprocess, features, training, and experiments. The experiments phase has 3 view modes, an AI-generated report, an 8-card KPI grid, and a 5-tab model detail panel. Deployment should honor that investment, not feel like an anti-climax.

### Data Already Available (No New Collection Needed)

All of this is computed in the experiments phase and accessible via existing stores/APIs:

| Signal | Source | Rendering |
|--------|--------|-----------|
| **Champion model** | `findChampionModelId()` in `frontend/src/components/experiments/utils.ts` | "You are deploying **Random Forest** with **95.2% accuracy**" |
| **Overfit risk** | `evaluation.learning_curve` train-test gap | Green (<4%), Yellow (4-10%), Red (>10%) — already computed in KPI card (`useKpiMetrics.ts`) |
| **CV confidence** | `evaluation.cross_validation.mean ± std` | Score badge: "CV: 0.92 ± 0.03 (5-fold)" |
| **Feature importance stability** | `evaluation.feature_importance.permutation.importances_std` | Stable (low std on top features) or Unstable |
| **Sample size adequacy** | `model.sampleCount` | Flag if < 100 samples |
| **Convergence** | Learning curve trend (last 3 deltas) | Improving / Plateaued / Declining |
| **Cross-phase recommendations** | `generateRecommendations()` in `frontend/src/components/experiments/utils.ts` | Cards linking to preprocessing/features: "Consider class balancing" |

### Deployment Readiness Checklist

Auto-populated from existing evaluation data. Displayed on the Overview tab before first deployment:

```
✅ CV Score stable (std < 0.05)
⚠️ Overfit risk: Medium (train-test gap 7%)
✅ Feature importance stable
⚠️ Sample size: 250 samples (adequate but limited)
✅ Evaluation complete (all metrics computed)
→ Recommended for deployment with monitoring
```

### Pipeline Provenance Extension

The existing `ProvenanceTab.tsx` renders a timeline: Upload → Preprocess → Features → Training → Evaluation. Extend this timeline with a Deployment milestone showing deployment timestamp, endpoint URL, and container status.

---

# Part V: Differentiation & Scope

## 13. Novel & Differentiating Ideas

### Tier 1: Recommended for Implementation

These are genuinely novel, achievable, and create strong expo demo moments.

**1. LLM-Narrated Model Story**

Feed SHAP values, evaluation metrics, feature importance, and error analysis into the existing OpenAI integration (`backend/src/services/llm/`) to generate a plain-English narrative explaining what the model does and why.

> "This model predicts loan approval primarily based on income and credit history. Applicants with income above $55k and credit scores above 700 are approved 94% of the time. The model is least confident for applicants in the $45k-$55k income range, where approval rates are close to 50/50."

The existing `experimentReport.ts` prompt system already generates structured 6-section reports from `extractEvalSummary()`. The model story would follow the same pattern with a deployment-focused prompt. **Guardrail needed:** The LLM should generate from a structured template (not free-form) to avoid hallucinating causal claims from SHAP correlation data.

**2. QR Code Playground Links**

Generate a unique URL for any deployed model that opens the playground with pre-filled sample inputs. Display a QR code on the deployment dashboard. At the expo, judges scan the poster QR code and interact with a live model on their phone.

Implementation: `npm install qrcode` (SVG generation, ~50KB). The URL points to the platform's deployment playground route. **Prerequisite:** The playground form must work on mobile — responsive design for sliders and dropdowns is essential.

**3. Auto-Generated Model Card**

Use the LLM to generate a comprehensive model card (following the Google/Hugging Face schema) from all available metadata: training data stats, preprocessing steps, model architecture, hyperparameters, evaluation metrics, SHAP values, and error analysis. Richer than existing auto-generation tools because the platform has the entire pipeline history. Render as a polished, printable component with PDF/Markdown export.

### Tier 2: Strong Additions If Time Permits

**4. What-If Playground with Counterfactual Explanations (DiCE)**

Described in Section 11. Drag feature sliders, watch predictions update live, click "What would need to change?" for counterfactual scenarios. **Caveat:** DiCE is computationally expensive (seconds per request) and has incomplete support for some Pipeline configurations. Requires adding `dice-ml` to the Docker image and specifying feature mutability. Worth the effort if time allows, but unreliable enough to keep out of Tier 1.

**5. One-Click Browser Deployment (ONNX + WebAssembly)**

Convert the sklearn model to ONNX via `skl2onnx`, bundle with `onnxruntime-web`, generate a self-contained HTML file that runs predictions entirely in the browser (no server needed). **Caveat:** `skl2onnx` has incomplete estimator support — `GradientBoostingClassifier` with certain parameters and `KMeans` have known conversion failures. For a capstone demo, a feature that works for 6 of 8 model templates is a liability. Must include a graceful fallback (offer the FastAPI bundle download instead) when conversion fails.

**6. Time-Travel Backtesting**

Before deploying, replay the model against historical data to visualize what it would have predicted. Timeline showing actual vs predicted outcomes. **Caveat:** Only meaningful for datasets with a temporal dimension; for cross-sectional datasets (most tabular ML), "6 months ago" has no meaning. Must detect applicability.

**7. Canary Predictions (Regression Testing)**

Auto-generate synthetic test cases covering decision boundary edge cases. Store as a regression suite. On each redeployment, run canaries and flag predictions that changed. **Caveat:** Generating meaningful edge cases requires understanding the decision boundary, which is non-trivial for tree ensembles. Needs more design work.

### Expo Demo Flow

This sequence creates a complete narrative arc in approximately 2 minutes — a realistic expo judge interaction window:

1. Judge reads the **Model Story** (understands the model in plain English)
2. Judge scans the **QR code** (interacts with a live model on their phone)
3. Judge sees the **playground prediction with SHAP explanation** (understands why)

---

## 14. Scope & Dependency Ordering

### Recommended Implementation Order

Each tier depends on the ones above it.

**Tier 0: Prerequisite (before deployment phase)**
1. Pipeline refactor of `buildTrainingScript()`, `evaluationService.ts`, `tuningScriptBuilder.ts` (Part II)
2. Extend training to save `baseline.json` and `sampleRequest` in metrics

**Tier 1: Core Deployment (MVP)**
3. Database migration: `deployments` table + `prediction_logs` table
4. `buildInferenceServerScript()` — generates FastAPI `serve.py`
5. Deployment manager service — container lifecycle, health checks, state recovery
6. Reverse proxy with `http-proxy-middleware`
7. Deployment REST routes
8. Frontend: Zustand deployment store + DeploymentDashboard component
9. Frontend: Playground with form-based input (adaptive by task type)
10. Frontend: Deploy button integration in Experiments phase

**Tier 2: Polish**
11. Code snippets tab (curl/Python/JS)
12. Prediction log viewer with expandable rows
13. Graduation UX: readiness checklist + champion model context
14. API key generation for external consumers
15. Monitoring charts (request volume, latency, prediction distribution)

**Tier 3: Differentiation**
16. LLM-narrated model story
17. QR code playground links
18. Drift detection with PSI/KS visualization
19. Auto-generated model card
20. SHAP waterfall per prediction (`?explain=true`)

**Tier 4: Stretch**
21. What-if sensitivity sliders
22. DiCE counterfactual explanations
23. ONNX browser deployment
24. Batch prediction with CSV upload
25. Canary prediction regression testing

### Resource Estimate

The Pipeline refactor (Tier 0) touches 5 backend files. The evaluation script refactoring is the largest part — hundreds of lines of generated Python that reference model attributes directly.

Tier 1 (core deployment) is the minimum for a functional deployment phase. Tiers 2 and 3 are what make it impressive at the expo.

---

## Appendix A: Requirements Checklist

New files to create:

| File | Purpose |
|------|---------|
| `backend/migrations/017_deployments.sql` | `deployments` + `prediction_logs` + `deployment_api_keys` tables |
| `backend/src/services/deploymentManager.ts` | Container lifecycle, health checks, state recovery |
| `backend/src/services/inferenceServerBuilder.ts` | Generates `serve.py` per model |
| `backend/src/routes/deployments.ts` | REST endpoints for deployment CRUD + predict proxy |
| `frontend/src/components/deployment/DeploymentDashboard.tsx` | Main deployment phase component |
| `frontend/src/components/deployment/PlaygroundTab.tsx` | Adaptive prediction form + results |
| `frontend/src/components/deployment/OverviewTab.tsx` | Hero card + KPIs |
| `frontend/src/stores/deploymentStore.ts` | Zustand store for deployment state |
| `frontend/src/lib/api/deployments.ts` | Typed API wrappers |

Existing files to modify:

| File | Change |
|------|--------|
| `backend/src/services/modelTraining.ts` | Pipeline + ColumnTransformer + save baseline.json + save sampleRequest |
| `backend/src/services/pythonScriptUtils.ts` | Remove or replace `buildPreprocessingLines()` |
| `backend/src/services/evaluationService.ts` | Remove preprocessing, access model via `pipeline.named_steps['model']` |
| `backend/src/services/tuningScriptBuilder.ts` | Wrap estimator in Pipeline per trial |
| `frontend/src/lib/training/modelCode.ts` | Update code preview |
| `backend/src/app.ts` | Mount deployment routes |
| `backend/docker/Dockerfile.python-runtime` | Add `fastapi` + `uvicorn` |
| `frontend/src/pages/ProjectWorkspace.tsx` | Replace deployment placeholder with `<DeploymentDashboard />` |
| `frontend/src/components/experiments/...` | Add "Deploy" button to model cards |

---

## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| **PSI** (Population Stability Index) | A single number measuring how much a feature's distribution has shifted from a reference baseline. Ranges from 0 (no shift) to unbounded. |
| **KS test** (Kolmogorov-Smirnov) | A statistical test comparing two distributions of a continuous variable. Returns a p-value; low p-value = statistically significant shift. |
| **SHAP** (SHapley Additive exPlanations) | A method for explaining individual predictions by computing each feature's contribution to the output. |
| **DiCE** (Diverse Counterfactual Explanations) | A Microsoft Research library that generates "what-if" scenarios showing minimal input changes needed for a different prediction outcome. |
| **UMAP** (Uniform Manifold Approximation and Projection) | A dimensionality reduction algorithm that produces 2D coordinates from high-dimensional data, used for visualizing clusters. |
| **t-SNE** (t-distributed Stochastic Neighbor Embedding) | Another dimensionality reduction algorithm, similar purpose to UMAP but slower and less suited to new data points. |
| **ColumnTransformer** | A scikit-learn utility that applies different preprocessing transformers to different column subsets and concatenates the results. |
| **ONNX** (Open Neural Network Exchange) | A language-agnostic model format that enables inference outside of Python. |
| **Algorithmic recourse** | The concept of giving users a concrete path to a different model outcome (e.g., "increase income by $5k to get approved"). |
| **Train/serve skew** | When preprocessing at inference time produces different results than at training time, causing subtly wrong predictions. |
