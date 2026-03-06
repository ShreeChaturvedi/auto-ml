# Explorer NL Query Builder - Comprehensive Improvement Plan

## 1) What We Are Solving

The Explorer tab NL flow works, but four issues are causing a weak user experience:

1. English-mode suggestions are hardcoded and generic.
2. Model Work shows coarse phase labels instead of real model output.
3. Heuristic planning bypass makes reliability labels look misleading (even when outputs are good).
4. Streaming UX is fragmented (phase progress and SQL reveal are separate from model-work narration).

This plan upgrades the flow to a single, model-first pipeline with rich streaming visibility and schema-aware suggestion quality.

---

## 2) Decisions (Locked)

- Keep NL->SQL in the existing imperative service (`backend/src/services/nlToSqlV2.ts`).
- Do **not** migrate NL->SQL to LangGraph.
- Make model planning the default path for all NL queries.
- Keep deterministic/repair logic as fallback/recovery only.
- Reuse existing frontend streaming stack (Streamdown + progressive reveal), no heavy new libraries.

---

## 3) Current-State Findings (From Code Review + Research)

### Backend
- `nlToSqlV2` currently skips model planning for likely single-table prompts (`shouldUseModelPlanning` can return false).
- `/query/nl/stream` emits only phase events + final result + done; no true model-work payloads.
- LLM client already supports streaming callbacks (`onToken`, `onThinking`, `onToolCall`) in Gemini provider.
- OpenAI-compatible provider currently streams text deltas only (no dedicated thought callback), so fallback behavior must be provider-aware.

### Frontend
- `NlWorkPlanPanel` shows phase summaries and post-run explanation; it does not render live model deltas.
- `NlQueryWorkflow` already consumes stream events and tracks work phases, so this is the right integration point for new model-work events.
- Streamdown reveal primitives already exist and are suitable for progressive Model Work rendering.
- English placeholders are hardcoded in `NL_PLACEHOLDER_QUERIES`.

### Reliability label confusion
- The current heuristic bypass can set `confidenceMode='heuristic'` on successful simple queries.
- UI then shows "Heuristic reliability" / low-medium tiers even when intent+SQL look strong.

---

## 4) Target UX/Behavior

### Model Work card (while generating)
- Show a live, ordered timeline of model-work blocks:
  - Thinking summaries
  - Plan updates
  - Tool activity (if any)
  - SQL generation updates
  - Validation/repair updates
- Outer card scrolls automatically as new content arrives.
- Top edge has fade/blur mask so scrolled-out content visually fades away.
- Thinking blocks are height-capped and independently scrollable (one block never consumes whole card).
- Streamdown reveal effect is used for deltas.

### Reliability clarity
- Successful model-path generations should display model reliability (not heuristic reliability).
- Low reliability must include explicit reasons (confidence threshold, ambiguous joins, risky assumptions).

### Suggestions
- English suggestions come from LLM using active schema context.
- Suggestions are richer, realistic, and diverse (joins, trends, segmentation, top-N, time windows, ratio analyses).

---

## 5) Implementation Plan

## Phase A - Model-First Reliability Foundation

### Files
- `backend/src/services/nlToSqlV2.ts`
- `backend/src/services/nlToSqlV2.test.ts`

### Changes
1. Update planning selection so normal flow always attempts model planning.
2. Keep heuristic planning object only as explicit fallback when model planning fails.
3. Preserve deterministic fallback and repair behavior.
4. Ensure confidence mode on successful runs is `model`.

### Acceptance
- Single-table prompt with healthy provider ends in `confidenceMode='model'`.
- Heuristic mode appears only when planning actually falls back.

---

## Phase B - Stream Real Model Work from Backend

### Files
- `backend/src/services/nlToSqlV2.ts`
- `backend/src/routes/query.ts`
- `backend/src/routes/query.test.ts`

### Changes
1. Extend generation interfaces to support model-work callback channel (separate from phase progress).
2. Emit structured model-work events during planning, SQL generation, validation, and repair.
3. Add NDJSON event variants in `/query/nl/stream` for model-work entries/deltas.
4. Keep existing `phase_*`, `result`, `done` events unchanged for compatibility.

### Event Contract (proposed)
- `model_work_block_started`
- `model_work_delta`
- `model_work_block_completed`

Each event includes block metadata (`blockId`, `kind`, `title`, `timestamp`) and, for delta events, markdown/text payload.

### Provider behavior
- Gemini: stream thinking summaries via `onThinking`, stream text/tool updates via existing callbacks.
- OpenAI-compatible: stream text deltas; if no dedicated thinking channel, still produce SQL/plan/validation model-work blocks from streamed text and phase milestones.

### Acceptance
- Stream payload includes live model-work events before final `result`.
- Event order remains valid: active stream -> result -> done phase -> terminal done event.

---

## Phase C - Frontend Event Type + State Wiring

### Files
- `frontend/src/lib/api/query.ts`
- `frontend/src/types/nlQuery.ts`
- `frontend/src/components/data/NlQueryWorkflow.tsx`
- `frontend/src/components/data/__tests__/NlQueryWorkflow.test.tsx`
- `frontend/src/types/__tests__/nlQuery.test.ts`

### Changes
1. Extend `NlQueryStreamEvent` union to include model-work event variants.
2. In `NlQueryWorkflow`, maintain model-work timeline state (separate from existing phase tracker).
3. Route incoming model-work events to block state reducer; keep existing phase handling untouched.
4. Reset model-work state cleanly on new generation and abort.

### Acceptance
- Workflow state captures model-work stream without regressing phase progress behavior.
- Existing phase-based tests still pass; new tests cover model-work ingestion.

---

## Phase D - Model Work Card Redesign (UX)

### Files
- `frontend/src/components/data/NlWorkPlanPanel.tsx`
- `frontend/src/components/data/__tests__/NlWorkPlanPanel.test.tsx`
- `frontend/src/index.css`

### Changes
1. Add props for live model-work blocks and streaming status.
2. Render timeline blocks with Streamdown reveal effect.
3. Implement outer container auto-follow behavior:
   - auto-follow while user is near bottom
   - pause follow if user scrolls up
   - resume when user returns near bottom
4. Add top fade/blur overlay to outer scroll viewport.
5. Add per-thinking-block max height + internal scroll.
6. Preserve current review section (intent/tables/joins/assumptions/reliability) once generation ends.

### Acceptance
- Model Work card streams continuously and remains readable during long output.
- Thinking blocks do not consume full card height.
- Fade mask appears only when content has scrolled.

---

## Phase E - LLM-Powered Schema-Aware Suggestions

### Files
- `backend/src/services/nlSuggestions.ts` (new)
- `backend/src/services/nlSuggestions.test.ts` (new)
- `backend/src/routes/query.ts`
- `backend/src/routes/query.test.ts`
- `frontend/src/lib/api/query.ts`
- `frontend/src/components/data/NlQueryWorkflow.tsx`
- `frontend/src/components/data/QueryPanel.tsx` (integration as needed)

### Backend changes
1. Build schema summary from project datasets (table + column + type + lightweight relationship hints).
2. Add suggestion generator prompt with strict JSON response schema.
3. Add in-memory cache keyed by `(projectId + schemaFingerprint)` with TTL.
4. Add endpoint for fetching suggestions (query builder use).

### Frontend changes
1. Fetch suggestions when NL mode opens / project changes.
2. Replace hardcoded placeholder list with fetched suggestions.
3. Add suggestion dropdown/autocomplete interaction while typing:
   - filter by current input
   - keyboard navigation + click-to-fill
   - cap visible suggestions

### Quality bar for suggestions
- No short generic prompts like "Show all rows".
- Include realistic business-analysis phrasing.
- Include multi-step asks (joins, windows, rates, segmentation).
- Keep language clear and executable.

### Acceptance
- Suggestions are schema-grounded and visibly more useful than static placeholders.
- Cached response returns quickly on repeated visits.

---

## Phase F - Reliability Messaging Cleanup

### Files
- `backend/src/services/nlToSqlV2.ts`
- `frontend/src/components/data/NlWorkPlanPanel.tsx`
- `frontend/src/lib/api/query.ts` (if explanation contract expands)

### Changes
1. Ensure reliability label aligns with actual confidence mode path.
2. Surface reliability factors explicitly in UI (not opaque labels):
   - low confidence score
   - ambiguous joins (confidence < threshold)
   - risky assumptions detected
3. Keep conservative warnings for fallback/repair paths.

### Acceptance
- Users can immediately understand why reliability is low/high.
- Misleading "heuristic reliability" on healthy model runs is eliminated.

---

## 6) Streaming Stability/Bug-Fix Checklist

While implementing, explicitly harden these cases:

1. NDJSON partial-line parsing at chunk boundaries.
2. Stream end without final done (frontend synthesizes done safely).
3. Aborted generation should not leak stale events into new run.
4. Duplicate terminal events should not break state.
5. Scroll performance under high-frequency deltas.

---

## 7) Test & Verification Plan

### Backend tests
- `backend/src/services/nlToSqlV2.test.ts`
  - model-first planning behavior
  - fallback behavior unchanged
  - reliability mapping correctness
- `backend/src/routes/query.test.ts`
  - model-work NDJSON event serialization + ordering
  - stream terminal behavior with success/failure
- `backend/src/services/nlSuggestions.test.ts`
  - parse/validation/caching behavior

### Frontend tests
- `frontend/src/types/__tests__/nlQuery.test.ts`
  - new stream event union handling
- `frontend/src/components/data/__tests__/NlQueryWorkflow.test.tsx`
  - model-work event consumption + reset behavior
- `frontend/src/components/data/__tests__/NlWorkPlanPanel.test.tsx`
  - streamed block rendering, auto-scroll behavior, fade/overflow behavior
- `frontend/src/components/data/__tests__/QueryPanel.test.tsx`
  - suggestion fetch and selection behavior in english mode

### Command-level verification
- `npm --prefix backend test`
- `npm --prefix backend lint`
- `npm --prefix frontend test`
- `npm --prefix frontend lint`
- `npm --prefix frontend build`

### Manual end-to-end scenarios
1. Simple single-table prompt -> model path + correct reliability label.
2. Join-heavy prompt -> visible planning + SQL reasoning stream.
3. Execution failure -> repair path shown in Model Work.
4. Long thinking stream -> nested scroll + fade works.
5. Suggestions reflect uploaded schema and remain high quality.

---

## 8) Rollout Strategy

1. Ship backend event contract + model-first planning first.
2. Ship frontend model-work timeline behind a temporary UI flag if needed.
3. Enable dynamic suggestions after cache + quality checks are stable.
4. Monitor fallback rate and low-reliability rate after release.

Suggested telemetry counters:
- model-path success rate
- planning fallback rate
- deterministic fallback rate
- repair rate
- low-reliability frequency

---

## 9) Additional High-Value Enhancements (Post-Core)

1. Persist model-work transcript with query artifact for later review/debugging.
2. Add "Generate more ideas" action for alternate suggestion sets.
3. Add quick filters for suggestion intent (trend, segmentation, anomaly, cohort, ranking).

---

## 10) Definition of Done

This initiative is complete when:

1. English suggestions are LLM-generated + schema-aware (no hardcoded list in active path).
2. Model Work card streams real model output with nested scroll and fade UX.
3. NL path is model-first and reliability labels are no longer misleading.
4. Streaming remains robust under abort/error/retry conditions.
5. Tests and manual verification pass without regressions.
