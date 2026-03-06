# Comprehensive Plan: Agentic Preprocessing with LangGraph + Deterministic Tool UI

## 0. Why This Rewrite Exists
The previous plan optimized around bespoke preprocessing endpoints and a local pipeline builder model. That direction increases code bloat and drifts from the app's most successful interaction model.

This rewritten plan aligns our your clarified requirements:
- Reuse the training-style split/notebook architecture (modular, no duplication).
- Keep notebook code fully visible (no hidden execution).
- Make tool calls the source of left-pane deterministic UI.
- Introduce first-time dataset selection modal (no dumb default assumptions).
- Adopt LangGraph for robust orchestration as complexity grows.
- Design tool contracts across workflow stages to avoid tool bloat/conflicts.

## 1. Product Principles (Non-Negotiable)

1) **Notebook is source of truth for execution**
- Data manipulation always happens via Python cells in the notebook runtime.
- Left pane never claims work happened unless corresponding notebook/tool events exist.

2) **Deterministic UI is source of truth for user understanding**
- Left pane renders structured, typed transformation events (not vague prose).
- Every transformation card maps to one or more notebook cells and tool calls.

3) **Tool contracts are domain-designed, not ad-hoc**
- No duplicate/conflicting tools.
- Each tool has a strict role, schema, error policy, and lifecycle state.

4) **One runtime shell, many domain adapters**
- Preprocessing should use the same modular shell as training (split layout + streaming loop + notebook integration), with domain-specific prompt/tool adapter.

5) **Human control where risk exists**
- Use interrupt/review checkpoints for destructive or expensive operations.
- User can inspect, approve, edit, or reject sensitive steps.

---

## 2. Conceptual Architecture (Three Layers)

This abstraction is a key difference from the current approach where a single agent handles all work

### Layer A: Execution Layer (Notebook Runtime)
Responsibilities:
- `write_cell`, `run_cell`, capture stdout/stderr/artifacts.
- Stable identity for notebook cells (`cell.id`) and metadata binding.

Key invariant:
- If a semantic step says "done", there is a successful tool result and bound executed cell(s).

### Layer B: Semantic Orchestration Layer (LangGraph)
Responsibilities:
- Manage state machine for preprocessing run.
- Route between planner/transformer/validator substeps.
- Handle interrupts (approve/edit/reject) and resume.

Why LangGraph here:
- Persistence/checkpointing/thread semantics for long runs.
- Native interrupt model (HITL) for reviewable tool actions.
- Strong fit for growing multi-stage complexity.

### Layer C: Presentation Layer (Deterministic Left Pane)
Responsibilities:
- Render tool-call derived cards with typed statuses:
  - `pending`, `running`, `awaiting_approval`, `applied`, `failed`, `diverged`.
- Expand card to show exact code, outputs, and rationale.

Key invariant:
- Left-pane cards are projections of structured tool events, not freeform generated text.

---

## 3. Dataset Selection + Context UX

### First-time behavior
- If no active dataset context exists for preprocessing thread, show modal dialog:
  - searchable dataset list
  - file + row/column preview
  - explicit "Start with this dataset" action

### Ongoing behavior
- Selected dataset becomes pinned context in top ribbon selector.
- User can switch dataset from ribbon selector (not hidden), with explicit context-change event.

### Why this model
- Avoids bad default assumptions (e.g., "latest dataset").
- Avoids blocked empty-state anti-pattern.
- Preserves user agency and clear context provenance.

### Processing state model decision
- Adopt **Hybrid mode**.
- Inside one active preprocessing run/thread, transformations chain statefully through notebook/runtime execution.
- Switching dataset context or using **Reset Tab** starts a fresh run context explicitly.
- Replay/checkpoint lineage remains explicit and backend-authoritative.

---

## 4. Stage-Wise Tool Design Methodology (Bloat Prevention)

We design tools by stage contract, not by convenience.

### 4.1 Global Tool Taxonomy

**Execution primitives (shared across stages)**
- `write_cell`
- `run_cell`
- `read_cell_output`
- `list_notebook_cells`

**Data context tools (shared)**
- `list_project_datasets`
- `set_active_dataset`
- `profile_active_dataset`

**Artifact/lineage tools (shared)**
- `checkpoint_dataset`
- `register_derived_dataset`
- `list_checkpoints`
- `restore_checkpoint`

### 4.2 Processing-stage semantic tools (this phase)

These sit above notebook primitives and are what the left pane renders.

- `propose_transformation_step`
  - Declares intent and expected impact before code execution.
- `materialize_step_code`
  - Produces/revises code tied to `step_id`.
- `execute_transformation_step`
  - Runs bound cells, captures outputs/errors.
- `validate_step_result`
  - Runs validation checks (row counts/null drift/schema checks).
- `commit_transformation_step`
  - Marks step as accepted + snapshots lineage metadata.

**Do not add duplicate tools** that overlap these responsibilities.

### 4.3 Tool design checklist (applies to every tool)
- clear ownership (what this tool does and does not do)
- strict input schema and bounded output schema
- deterministic error channel (`isError` + typed reason)
- idempotency behavior
- retry/edit policy
- observability tags (`run_id`, `step_id`, `cell_id`, `dataset_id`)

---

## 5. LangGraph Orchestration Blueprint

## 5.1 Graph roles (within preprocessing workflow)
- `Supervisor`: interprets user intent and decides next semantic action.
- `Transformer`: maps semantic action to notebook code operations.
- `Validator`: checks post-step invariants and suggests rollback/revision.

This is a StateFlow-like pattern (explicit states/transitions), implemented in LangGraph runtime.

## 5.2 Explicit states (processing phase)
1. `ContextReady`
2. `PlanStep`
3. `GenerateCode`
4. `ExecuteCode`
5. `ValidateOutcome`
6. `AwaitApproval` (interrupt)
7. `CommitOrRevise`
8. `Completed`

## 5.3 Transition guard examples
- `ExecuteCode -> ValidateOutcome` only if run succeeded.
- `ValidateOutcome -> AwaitApproval` for destructive ops or high-impact drift.
- `ValidateOutcome -> GenerateCode` if validation fails and auto-repair allowed.
- `AwaitApproval -> CommitOrRevise` only after user decision.

## 5.4 Why not "use AutoGen StateFlow directly"
- StateFlow is valuable as a conceptual process model (FSM discipline).
- LangGraph is selected runtime because it gives stronger persistence/interrupt semantics compatible with current Node stack direction.
- We adopt StateFlow principles inside LangGraph graph design.

---

## 6. Bi-Directional Sync Design (Conceptual Validation)

This is feasible and coherent if we enforce hard invariants.

## 6.1 Binding model
- Each semantic step has immutable `step_id`.
- Each generated notebook cell stores metadata:
  - `step_id`, `tool_call_id`, `intent_type`, `version`, `code_hash`.
- Mapping table maintained in run state.

## 6.2 Forward sync (semantic -> notebook)
- Semantic tool event creates/updates bound cell(s).
- Cell execution output updates corresponding step card status.

## 6.3 Reverse sync (notebook -> semantic)
- Manual edit in notebook changes `code_hash`.
- System marks step as `diverged`.
- LLM is prompted to reconcile:
  - either absorb manual edit into semantic step,
  - or create a new semantic step linked to edited cell.

## 6.4 Replay support (Mito-inspired)
- Persist ordered transformation event log (`analysis_to_replay` equivalent).
- Replay attempt performs compatibility checks (schema presence/type constraints).
- On mismatch, produce typed repair suggestions instead of silent failure.

---

## 7. UI Architecture (Processing Tab)

### 7.1 Top ribbon
- Keep identical shell style as training.
- Include:
  - active dataset chip/selector
  - run/thread status
  - minimal context actions only

### 7.2 Left pane
- Deterministic transformation timeline (cards from tool events).
- Expandable details per card:
  - rationale
  - generated code snippet reference
  - validation metrics
  - approval controls when interrupted

### 7.3 Right pane
- Shared notebook component (same modular runtime used by training).
- Full visibility of code and outputs.

### 7.4 Empty/init state
- If no dataset context, show first-time modal, not a static empty message.
- After selection, show suggestion chips tied to stage goals.

---

## 8. Implementation Plan (Processing Only)

## Phase A - Foundation Refactor (shared runtime, no feature bloat)

1. Extract shared agentic shell from training:
   - split-pane shell
   - streaming message loop
   - tool-call execution handler
   - notebook binding hooks

Critical files:
- `frontend/src/components/training/TrainingPanel.tsx`
- `frontend/src/components/preprocessing/PreprocessingPanel.tsx`
- `frontend/src/lib/api/llm.ts`
- `frontend/src/types/llmUi.ts`

2. Introduce domain adapter interface:
- `buildRequest`
- `toolRegistry`
- `toolUiRegistry`
- `suggestionProvider`

## Phase B - LangGraph preprocessing graph

Deployment decision (locked):
- Run LangGraph orchestration inside the existing backend Node service first.
- Keep clear interfaces so graph runtime can be extracted into a dedicated orchestrator service later if scaling/ops require it.

1. Add preprocessing graph route under unified llm streaming path.
2. Implement graph state schema with `step_id` + `cell_id` bindings.
3. Add interrupt points for risky operations.

Critical files:
- `backend/src/routes/llm.ts`
- `backend/src/services/llm/prompts.ts`
- `backend/src/types/llm.ts`
- new graph module (backend service folder)

## Phase C - Deterministic tool UI + modal context selection

1. Add first-time dataset selection modal and pinned selector integration.
2. Replace bespoke preprocessing cards with tool-event deterministic timeline.
3. Keep notebook right pane untouched as execution source.

Critical files:
- `frontend/src/components/preprocessing/PreprocessingPanel.tsx`
- `frontend/src/stores/dataStore.ts` (or relevant context store)
- shared modal/dialog components

## Phase D - Replay + divergence handling

1. Persist transformation event log and checkpoint metadata.
2. Implement replay compatibility checks.
3. Add diverged-step detection and reconciliation UX.

Critical files:
- preprocessing persistence services (backend)
- notebook metadata bindings (frontend/backend where applicable)

---

## 9. Risks and Mitigations

1) **Tool confusion from over-large registry**
- Mitigation: stage-scoped tool registry + strict ownership matrix.

2) **Run state drift between notebook and left-pane cards**
- Mitigation: enforce `step_id`/`cell_id` metadata + reconciliation state.

3) **Interrupt deadlocks or orphaned approvals**
- Mitigation: persisted thread/checkpoint IDs + explicit timeout/retry rules.

4) **Codebase bloat from duplicate panel logic**
- Mitigation: extract shared runtime shell before adding preprocessing features.

---

## 10. Acceptance Criteria for Processing Phase

1. User entering processing sees modal dataset chooser (first time) instead of blocked empty screen.
2. Preprocessing panel uses same modular split/notebook shell as training.
3. Left-pane transformations are rendered from typed tool events, not ad-hoc text.
4. Every applied transformation card links to concrete notebook cell(s) and execution output.
5. Risky transformations support approve/edit/reject before commit.
6. Manual notebook edits can be detected as divergence and reconciled.
7. Replay of transformation sequence is possible with compatibility validation.

---

## 11. Verification Plan

### Functional verification
- Start processing with no active context -> modal appears -> selection sets context.
- Submit prompt for preprocessing -> graph emits semantic steps -> cells written/executed -> left timeline updates deterministically.
- Trigger an operation requiring approval -> interrupt UI appears -> approve/edit/reject works.
- Edit generated notebook code manually -> left pane marks step diverged -> reconciliation path works.
- Save/checkpoint transformed dataset -> lineage metadata persists.

### Quality verification
- Frontend lint/build pass for modified modules.
- Backend lint/build/tests pass for new graph/tool orchestration logic.
- Smoke-test no regression in training tab after shared shell extraction.

### Safety verification
- Tool calls are bounded by max-iteration and timeout policies.
- Sensitive operations require explicit user decision when policy says so.
- Error surfaces are typed and traceable via run/step/cell identifiers.

---

## 12. Notes to Build Agent

- Do not reintroduce bespoke preprocessing pipeline UIs that duplicate training logic.
- Preserve transparency: notebook code/output must remain visible and inspectable.
- Prioritize architecture and contracts first, UI polish second.
- Keep stage-tool contracts clean to protect future phases (feature engineering, training, testing).
- Use multiple subagents liberally to complete work in parallel. Pick the right subagent for the task.
- Assume backend is running on 'http://localhost:4000' which can be useful to you.
