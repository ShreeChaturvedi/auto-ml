# Advisor Meeting: Sprint 6-9 Walkthrough

**Presenter:** Shree Chaturvedi
**Course:** CSE 449 Senior Design Capstone, Miami University
**Date:** March 2026

---

## 1. Opening Context (2 min)

### Elevator Pitch

> "We're building an AI-augmented AutoML platform that guides users through the
> complete machine learning workflow -- from data upload through model training
> and evaluation -- with LLM-powered automation at every step. The AI proposes
> preprocessing transformations, generates feature engineering code, and writes
> training scripts, but the human always approves before anything executes."

**Key emphasis:** This is not a black-box AutoML tool. The user stays in the loop
at every decision point. The AI accelerates -- it does not replace -- the
practitioner.

### Team

| Member           | Role / Notes                                              |
| ---------------- | --------------------------------------------------------- |
| Shree Chaturvedi | Primary developer; Sprint 8 was 100% solo (205 commits)  |
| Ayush Yadav      | Contributed 113 commits in Sprint 7                       |
| Zarif            | Contributed 6 commits in Sprint 7                         |

### Sprint Timeline

| Sprint | Window                   | Commits | Character                        |
| ------ | ------------------------ | ------- | -------------------------------- |
| 6      | Jan -- Feb 21, 2026      | 54      | Foundation                       |
| 7      | Feb 22 -- Mar 5, 2026    | 293     | Architecture push                |
| 8      | Mar 6 -- Mar 17, 2026    | 205     | Structural maturity              |
| 9      | Mar 17 -- present        | ongoing | Experiments feature + UI polish  |

- Point out that Sprints 7 and 8 together represent nearly 500 commits in under
  a month. The codebase went through two full architectural generations in that
  window.

---

## 2. Sprint 6 Recap (3 min)

### What Existed Before Sprint 6

- Pyodide (in-browser Python) for code execution
- Basic forms for data input
- No real notebook system, no persistent kernel

### Key Achievements

**Cloud-based Docker execution.** Removed the Pyodide browser runtime entirely.
Python now runs in Docker containers with hard resource limits: 2 GB RAM, 1 CPU,
non-root user, read-only root filesystem.

- `backend/src/services/containerManager.ts`
- `backend/src/services/container/dockerBuilder.ts`

**Notebook system foundation.** WebSocket server for real-time cell
synchronization. Cell execution, output rendering, Python LSP support for
autocomplete.

- `backend/src/services/websocket/wsServer.ts`
- `backend/src/services/notebook/`

**Runtime manager UI.** Users can install PyPI packages from the browser, with
progress tracking and package preview before installation.

**Feature engineering workflow v1.** Backend planning service and panel UI
redesign -- the first version of the AI-driven feature engineering loop.

**Auth pages redesign.** Frosted glass effects, glowing borders, neural network
logo. Purely cosmetic, but sets the visual tone for the product.

**MCP integration.** Model Context Protocol server for LLM tool dispatch. This
becomes the backbone of every AI-driven phase later.

### Anticipated Question

> **"Why Docker over Pyodide?"**

Three hard limitations in Pyodide: it cannot install arbitrary pip packages
(only packages that have been compiled to WebAssembly), it has no persistent
kernel state between cells (every execution is a fresh Python context), and it
cannot handle large datasets because the browser's memory is the ceiling. Docker
gives us real CPython with persistent kernel sessions via Jupyter Kernel Gateway,
full pip access, and server-side memory that scales independently of the
client.

---

## 3. Sprint 7 Recap (5 min)

**This was the biggest sprint: 293 commits, 254 files changed, 46 linked issues,
+45,012 / -7,185 net lines.**

### Theme 1: NL-to-SQL v2

Replaced the placeholder natural-language query path with a streamed, two-phase
pipeline:

1. **Planning phase** -- LLM identifies intent, selects relevant tables,
   determines join strategy.
2. **SQL generation** -- LLM produces executable SQL with a rationale and
   confidence score.

The backend emits `phase_*` and `model_work_*` events over an NDJSON stream so
the frontend can show real-time progress. Users review and optionally edit the
generated SQL before it runs. On execution failure, the system captures the
Postgres error, sends it back to the LLM, and generates a corrected query
automatically.

- `backend/src/services/nlToSql/pipeline.ts`
- `backend/src/routes/query/nlHandler.ts`

### Theme 2: LangGraph Preprocessing State Machine

This is the most architecturally significant piece introduced in Sprint 7. An
8-stage finite state machine powered by LangGraph:

```
context_ready -> plan_step -> generate_code -> execute_code
     -> validate_outcome -> await_approval -> commit_or_revise -> completed
```

- A **supervisor node** routes to the next stage based on state flags.
- **Auto-repair:** on execution failure, the system decrements a counter and
  regenerates code (maximum 2 attempts before surfacing the error to the user).
- **Approval gates:** the user must approve each transformation before it is
  committed to the dataset.
- **Divergence detection and reconciliation** handles cases where the dataset
  state drifts from the plan.
- **Checkpointing** allows recovery in longer preprocessing sessions.

File: `backend/src/services/llm/langgraph/preprocessingRuntime.ts`

### Theme 3: Shared Agentic Shell

Before Sprint 7, each AI-driven phase (preprocessing, feature engineering,
training) had its own chat implementation -- duplicated streaming logic,
duplicated message rendering, duplicated tool dispatch.

The `AgenticShell` component and `useAgenticLoop` hook unified all of this.
Domain adapters (preprocessing, feature engineering, training) plug into the
same shell. One chat UI, one streaming parser, one tool dispatch mechanism --
three different behaviors via adapter injection.

- `frontend/src/components/agentic/AgenticShell.tsx`
- `frontend/src/hooks/useAgenticLoop.ts`

### Theme 4: Multi-Notebook Support

Notebook state moved from a single-project assumption to explicit multi-notebook
CRUD. A `notebookId` is now threaded through routes, tools, and state. Cell
locking prevents concurrent edits in shared sessions.

---

## 4. Sprint 8 Deep-Dive (15 min)

Sprint 8 was entirely solo work (205 commits, all by Shree). It focused on
turning the Sprint 7 prototype into a production-grade architecture.

### 4a. Unified Workflow Engine

**The problem.** Each phase had its own ad-hoc streaming handler, tool
dispatcher, and state management. Adding a new phase meant duplicating hundreds
of lines of boilerplate and hoping nothing diverged.

**The solution -- PhaseConfig pattern.** Each phase is now defined as a single
`PhaseConfig` object containing its tools, system prompts, adapters, and
lifecycle hooks. A single `turnExecutor.ts` orchestrates all phases through the
same LangGraph state machine. An `EventSink` abstraction decouples event
emission from phase-specific logic.

```
PhaseConfig = {
  tools: [...phase-specific MCP tools],
  systemPrompt: "...",
  adapter: preprocessingAdapter | featureAdapter | trainingAdapter,
  onToolCall: (call) => ...,
  onComplete: (result) => ...
}

turnExecutor(sink, turn, phaseConfig) {
  graph = getCompiledGraph()
  graph.invoke({ turn, run, toolCallHistory, ... })
  // Single execution loop for ALL phases
}
```

- `backend/src/services/workflows/phaseConfig.ts`
- `backend/src/services/workflows/turnExecutor.ts`
- `backend/src/services/workflows/eventSink.ts`

**Impact:** When the experiments phase was added in Sprint 9, it was a config
object and a route -- not a rewrite. The workflow engine handles streaming, tool
dispatch, error recovery, and state persistence automatically.

> **Anticipated question: "Why LangGraph and not a simpler state machine?"**
>
> LangGraph gives us conditional edges (the supervisor routes based on runtime
> state), automatic state checkpointing for crash recovery, and a recursion
> limit for safety. A hand-rolled switch-case FSM would require manual
> serialization, offer no built-in rollback, and become unwieldy as branching
> grows (auto-repair, divergence handling, approval gates all introduce
> conditional paths).

### 4b. EDA Redesign

The Explorer tab went from a basic table plus column statistics to a four-tab
scientific exploration interface.

| Tab             | Contents                                                                        |
| --------------- | ------------------------------------------------------------------------------- |
| **Overview**    | Auto-generated histograms for all numeric columns, dataset summary statistics   |
| **Quality**     | Missing value matrix, health cards with severity labels, data quality scores    |
| **Relationships** | Scatter regression for top 15 correlated pairs, correlation heatmap, 3D scatter, parallel coordinates |
| **Insights**    | AI-generated insight actions: filter, query, preprocess                         |

The backend EDA service (`backend/src/services/edaSummary.ts`, 442 lines) was
split into dedicated modules:

- `eda/categoricalAnalysis.ts` -- categorical column analysis
- `eda/numericAnalysis.ts` -- numeric distributions, KDE
- `eda/statistics.ts` -- summary statistics computation
- `eda/visualizations.ts` -- chart data generation
- `eda/missingMatrix.ts` -- missing value patterns

The AI Insight Actions are particularly worth demonstrating live: a streaming
endpoint generates notebook cells from insights, and insights can suggest
cross-phase actions (e.g., an insight about missing values can recommend a
preprocessing step).

- `backend/src/routes/notebooks/insightCodegen.ts`

### 4c. Jupyter Kernel Gateway Migration

**Before:** A custom Python wrapper spawned a new Python process per cell
execution. Variables from cell 1 were not available in cell 2 -- no persistent
kernel state.

**After:** Full Jupyter Kernel Gateway protocol (JSON-RPC over WebSocket).
The kernel persists across cells within a session. Protocol compliance gives us
proper execution counts, stdin support, and clean interrupt handling.

- `backend/src/services/kernelManager.ts` (283 lines)
- `backend/src/services/kernel/jupyterProtocol.ts`
- `backend/src/services/kernel/execution.ts`

**Security hardening applied during migration:**

- Iframe sandbox set to `allow-scripts` only (no `allow-same-origin`)
- tmpfs permissions tightened
- Non-root sandbox user enforced inside the container

**Testing:** 143 new tests in `backend/src/services/kernelManager.test.ts`
(853 lines). This is the most heavily tested service in the codebase.

### 4d. Code Architecture Transformation

This was the largest single effort in Sprint 8 -- roughly 133 of the 205
commits were devoted to splitting, extracting, and deleting code.

**Monolithic files split into directories:**

| Original file             | Lines | Split into                                                   |
| ------------------------- | ----- | ------------------------------------------------------------ |
| `nlToSqlV2.ts`            | 1,976 | `services/nlToSql/` (pipeline, repair, formatting, etc.)     |
| `routes/llm.ts`           | 1,306 | `routes/llm/` (index, catalogRoutes, planValidation, etc.)   |
| `preprocessingGraph.ts`   | 1,796 | `preprocessingTools/` (datasetTools, transformationTools)     |
| `notebookStore.ts`        | 829+  | Slices: sessionSlice, cellSlice, lockSlice, etc.             |
| `preprocessingStore.ts`   | 747+  | Slices: stepDecision, eventBuilders, timelineOps, etc.       |
| `routes/notebooks.ts`     | 625   | `routes/notebooks/` (notebookRoutes, cellRoutes, etc.)       |

**Shared modules extracted (each used across 3+ files):**

- Markdown component -- deduplicated across 7+ files
- NDJSON stream reader -- deduplicated across 3 API modules
- Type coercion utilities -- shared between frontend and backend
- SQL intelligence utilities
- ChatMessageList component

**Dead code removed:** approximately 4,000 lines total, including 9 unused
components, a dead notebook/chat directory (1,226 lines), a dead features
library (1,830 lines), and a dead `preprocessingSuggestions.ts` (763 lines).

**Architecture documentation:** 7 documents in `.planning/codebase/` totaling
1,492 lines -- ARCHITECTURE.md, CONCERNS.md, CONVENTIONS.md, INTEGRATIONS.md,
STACK.md, STRUCTURE.md, TESTING.md.

### 4e. OpenAI GPT-5 Migration

Migrated from Gemini to OpenAI GPT-5, using the Responses API (not Chat
Completions). Three streaming event types are handled:

- `response.output_text.delta` -- incremental text
- `response.reasoning_summary_text.delta` -- reasoning chain deltas
- `response.function_call_arguments.done` -- completed tool calls

Added a model catalog with reasoning effort resolution (low / medium / high) and
updated the model selector UI from a Crown icon to a Brain icon.

- `backend/src/services/llm/providers/openaiClient.ts`

---

## 5. LangGraph Workflow Model (5 min)

This is the core orchestration architecture. Every AI-driven phase flows
through it.

### State Annotation

```typescript
PreprocessingGraphAnnotation = {
  runId, projectId, activeDatasetId,
  currentStage, nextStage,
  contextReady, planReady, codeReady, executeSucceeded, validationPassed,
  requiresApproval, approvalDecision: 'pending' | 'approved' | 'rejected',
  autoRepairAllowed, autoRepairAttempts, maxAutoRepairAttempts,
  steps: Map<stepId, PreprocessingGraphStep>,
  stepOrder: string[],
  checkpoints: [...],
  nodeVisits, lastError, updatedAt
}
```

Walk the advisor through the flags: `contextReady`, `planReady`, `codeReady`,
`executeSucceeded`, `validationPassed` are booleans that the supervisor reads
to decide which node to invoke next. This is how conditional routing works
without hard-coded if/else chains.

### The 8-Stage FSM

```
START -> supervisor (route decision)
  |-> context_ready:    Load dataset, validate schema
  |-> plan_step:        LLM generates transformation plan
  |-> generate_code:    LLM produces Python code
  |-> execute_code:     Run in Docker container
  |-> validate_outcome: Check results match expectations
  |-> await_approval:   User review gate
  |-> commit_or_revise: Apply or discard
  |-> completed
```

### Supervisor Routing Logic (Conditional Edges)

- `execute_code` failure + auto-repair allowed --> back to `generate_code`
  (retry with error context)
- `validate_outcome` failure + auto-repair allowed --> back to `generate_code`
- `validate_outcome` success + `requiresApproval` --> `await_approval`
- User approves --> `commit_or_revise` --> next step or `completed`

### State Sync Bridge

Tool execution results map to LangGraph state patches:

| Tool call                        | State patch                             |
| -------------------------------- | --------------------------------------- |
| `set_active_dataset`             | `{ contextReady: true }`                |
| `propose_transformation_step`    | `{ planReady: true, currentStepId }`    |
| `execute_transformation_step`    | `{ executeSucceeded: boolean }`         |

Then `advanceRun(state, patch)` merges the patch and invokes the graph at the
next node.

### MCP Tool Registry

14 preprocessing tools dispatched through `toolRegistry.ts`:

- **Dataset tools:** `list_project_datasets`, `set_active_dataset`,
  `profile_active_dataset`
- **Checkpoint tools:** `checkpoint_dataset`, `restore_checkpoint`
- **Transformation tools:** `propose_transformation_step`,
  `materialize_step_code`, `execute_transformation_step`
- **Validation tools:** `validate_step_result`, `commit_transformation_step`
- **Divergence tools:** `detect_step_divergence`, `reconcile_diverged_step`

---

## 6. Architecture Overview (5 min)

### Full Stack Diagram

```
React 19 (Vite) --> Express 5 --> LangGraph State Machine --> Docker Python (Jupyter Kernel) --> Postgres
        ^ WebSocket                        ^ NDJSON streaming
```

### Persistence: Three-Tier Strategy

1. **Postgres** -- relational data, workflows, auth, embeddings
2. **File-based** -- `projects.json`, dataset metadata (works without a
   database connection)
3. **In-memory** -- ephemeral, used in dev and testing only

### Real-Time Architecture

- **WebSocket:** notebook cell execution events (`cell:executing`,
  `cell:output`, `cell:complete`)
- **NDJSON streaming:** workflow turns, NL-to-SQL pipeline, insight generation.
  NDJSON was chosen over SSE because it naturally supports structured JSON
  payloads without encoding overhead.

### Frontend State (Zustand)

| Store                   | Responsibility                                          |
| ----------------------- | ------------------------------------------------------- |
| ProjectStore            | Projects, active project, phase progression             |
| NotebookStore           | Cells, locks, suggested cells (composed from slices)    |
| DataStore               | Dataset metadata, artifacts                             |
| PreprocessingStore      | Run state, steps, approvals                             |
| WorkflowSessionStore    | Agentic loop state                                      |

All stores use localStorage persistence so work survives page refreshes.

### Phase-Based Routing

```
/project/:projectId/:phase
  upload -> data-viewer -> preprocessing -> feature-engineering -> training -> experiments
```

Each phase has unlock gates -- a user cannot access training until preprocessing
is marked complete. This enforces the pedagogical workflow.

---

## 7. Sprint 9 and Experiments Preview (5 min)

### Current Work (fix/ui-polish branch)

Active UI refinements, approximately 15 commits:

- Theme toggle centering, workbook toolbar overhaul, voice cursor sync
- Query error toast notifications, input box integration
- Sidebar connector line fixes, explorer status ribbon
- GPT-5.4 mini and nano model offerings added to the catalog

### Experiments Feature (feat/experiments branch, unmerged)

This is the capstone feature of the platform -- where all the preprocessing
and training work converges into evaluable, comparable results.

**Backend (3,055 new lines across 15 files):**

- `evaluationService.ts` (474 lines): confusion matrices, ROC/PR curves,
  calibration curves, residual analysis, feature importance, learning curves,
  cross-validation
- `tuningService.ts` (404 lines): Optuna-based hyperparameter optimization with
  NDJSON streaming of trial results (supports up to 200 trials)
- `errorAttributionService.ts` (249 lines): error trees (decision trees trained
  on misclassification patterns), top-50 highest-confidence misclassifications

Routes: `GET evaluation`, `GET shap`, `POST tune` (streaming), `POST insights`,
`GET error-analysis`

**Frontend (4,772 new lines across 48 files):**

- **ExperimentsDashboard:** resizable two-panel layout with leaderboard on the
  left and model detail on the right
- **Leaderboard:** sortable model table, champion badge, multi-select for
  side-by-side comparison
- **ModelDetailPanel:** 5 tabs -- Plots, Interpretability, Errors, Provenance,
  Tune
- **12 chart components:** learning curves, ROC, PR, confusion matrix, SHAP
  beeswarm, calibration, residual, and more
- **TuneTab:** real-time trial progress via NDJSON streaming
- **NL filter bar:** "show me models with accuracy > 0.9" parsed and applied
  to the leaderboard
- **LLM-powered insights:** banner summaries, metric explanations, comparison
  narratives

### What Remains

- **SHAP value generation:** structure is defined but the generation code is not
  yet implemented
- **Cross-phase provenance wiring:** recommendations from experiments should
  feed back into preprocessing and feature engineering
- **Database persistence:** evaluation and error results are currently stored as
  JSON files; need to migrate to Postgres
- **Migration 010:** `tuning_studies` table schema is drafted but not applied

---

## 8. Questions to Anticipate

### "Why LangGraph over a simpler state machine?"

LangGraph provides conditional edges (the supervisor routes based on runtime
state), automatic state checkpointing for crash recovery, and a recursion limit
for safety. A hand-rolled switch-case FSM would need manual serialization, no
built-in rollback, and would become unwieldy as conditional paths multiply
(auto-repair, divergence handling, approval gates).

### "How do you handle LLM failures and costs?"

Multiple layers:

- Per-route timeout overrides (30s default, 120s for preprocessing, 180s for
  thinking-mode queries)
- Model fallback on provider failures
- Auto-repair with max attempts prevents infinite loops
- Query cache (5-minute TTL, 500 entries) avoids redundant calls
- Reasoning effort levels: low for NL-to-SQL planning, high for complex
  preprocessing decisions

### "What's the testing strategy for non-deterministic LLM outputs?"

Three layers:

1. **Unit tests** mock the LLM client and verify tool dispatch and state
   transitions deterministically.
2. **Integration tests** verify the full pipeline against recorded responses.
3. **Evaluation suite** (NL-to-SQL accuracy, RAG retrieval precision)
   benchmarks against curated fixtures.

The 540-line preprocessing QA test suite validates the entire state machine
without any live LLM calls.

### "How does the Docker sandbox handle resource limits?"

Containers run as a non-root user with a read-only root filesystem, 2 GB memory
limit, and 1 CPU. tmpfs mounts provide temp storage (1 GB), pip cache, and
matplotlib config directories. Execution timeout is 30 seconds. Containers are
pooled per project and cleaned up on server startup.

### "What's the path to multi-user support?"

The auth system is already in place (JWT with refresh tokens, OAuth flow). Cell
locking currently prevents concurrent edits (cooperative, not enforced). Next
steps would be: notebook presence indicators (who is viewing which cell),
conflict resolution for simultaneous edits, and notebook-level permissions. The
WebSocket infrastructure already supports multi-client broadcast, so the
transport layer is ready.

### "How does the workflow engine handle a new phase being added?"

Define a `PhaseConfig` object (tools, prompts, adapter), register a route, and
`turnExecutor` handles everything else -- streaming, tool dispatch, error
recovery, state persistence. The experiments phase was added exactly this way in
Sprint 9: a config object plus a route, no engine changes required.

---

## Live Demo Sequence (if time permits)

1. Upload a CSV dataset
2. Show the EDA Overview and Quality tabs (auto-generated charts)
3. Open the Insights tab and trigger an AI insight action
4. Switch to Preprocessing -- show the agentic chat proposing a transformation
5. Walk through the approval gate (approve/reject)
6. Show the notebook with persistent kernel state (define a variable in cell 1,
   use it in cell 2)
7. If the experiments branch is merged: show the leaderboard and model
   comparison view

---

*Document prepared for advisor walkthrough. File paths are relative to the
repository root at `/home/shree/Documents/CSE449/repo/`.*
