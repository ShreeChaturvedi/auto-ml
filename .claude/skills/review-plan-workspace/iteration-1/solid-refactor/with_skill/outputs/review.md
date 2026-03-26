# Plan Review: Refactor NlQueryWorkflow Component

## Reviewer Reports

---

### Reviewer 1 — Architecture & Design

#### 1. Architecture Concerns

**The plan misidentifies what to extract.** The plan proposes extracting "suggestion chips UI" into `SuggestionChips.tsx`, but the codebase already has this component — it is called `NlApprovalDialog` (`frontend/src/components/data/NlApprovalDialog.tsx`). The "chip rendering, click handlers, and loading skeleton" described in the plan already live in `NlApprovalDialog` (chip rendering + click handlers) and `useNlSuggestions` hook (filtering, keyboard nav, state management). Creating `SuggestionChips.tsx` would duplicate an extraction that was already done.

**The streaming logic is not SSE.** The plan describes extracting "the SSE connection setup, event parsing, and state management" but the actual implementation uses NDJSON streaming via `fetch` + `ReadableStream` (see `streamNlQuery` in `frontend/src/lib/api/query.ts` and `readNdjsonStream`). The connection setup and event parsing already live in the API layer (`lib/api/query.ts`). What remains in `NlQueryWorkflow.tsx` is the *state reduction* of stream events into `workPhases` and `modelWorkBlocks` — this is application state management, not streaming logic.

**NlQueryWorkflow is already well-decomposed at 368 lines.** The component delegates:
- State machine logic to `NlQueryReducer.ts` (separate file)
- Suggestion management to `useNlSuggestions` hook (separate file)
- Phase/model-work state machine functions to `lib/nlQuery/phaseStateMachine.ts` (separate file)
- Suggestion dropdown UI to `NlApprovalDialog.tsx` (separate file)
- Workflow visualization to `NlWorkflowSteps` (separate file)
- SQL tokenization to `sqlTokenize` (separate file)
- Typewriter animation to `useTypewriter` hook (separate file)

The remaining ~368 lines in `NlQueryWorkflow.tsx` are almost entirely glue: wiring hooks together, managing the `AbortController` lifecycle, the `handleGenerate` callback, keyboard event routing, and JSX composition. This is the irreducible orchestration logic of the component.

#### 2. Design Alternatives

**If the goal is reducing file size, the highest-value extraction is `handleGenerate`.** The `handleGenerate` callback (lines 159-220, ~62 lines) contains the stream event dispatch, abort controller lifecycle, error handling, and phase state updates. This could become a custom hook like `useNlGeneration` that accepts `onGenerate` and returns `{ handleGenerate, workPhases, modelWorkBlocks }`. This is a more meaningful boundary than what the plan proposes.

**The keyboard handler could be extracted.** The `handleKeyDown` callback (lines 248-288) is a self-contained block that could move into the `useNlSuggestions` hook since it primarily manages suggestion navigation. This would be a cleaner extraction than creating a new `SuggestionChips` component.

#### 3. Complexity Check

The plan adds 3 new files where the codebase already has equivalent decomposition. This is over-engineering — it creates new module boundaries that don't align with the actual coupling in the code. The suggestion UI is already extracted (`NlApprovalDialog`). The streaming connection logic is already extracted (`lib/api/query.ts`). What remains is orchestration that *should* live in one place.

#### 4. Existing Code Leverage

- `NlApprovalDialog.tsx` — already does what `SuggestionChips.tsx` is supposed to do
- `useNlSuggestions.ts` — already manages the suggestion state, filtering, and keyboard handlers
- `lib/nlQuery/phaseStateMachine.ts` — already houses the pure state reduction functions for streaming events
- `NlQueryReducer.ts` — already manages the phase state machine

---

### Reviewer 2 — Bugs, Risks & Edge Cases

#### 1. Likely Bugs

**AbortController lifecycle split across modules.** The plan proposes moving streaming logic into `useNlQueryStream.ts`, which would mean the `AbortController` (`streamAbortRef`) would need to be managed across two modules — the new hook and the parent component (which calls `handleReject` to abort). Splitting abort controller ownership is a common source of race conditions: if the hook creates the controller but the parent aborts it via `reject()`, the hook may not know the stream was cancelled externally. The current code avoids this by keeping the abort ref and all its consumers in a single scope.

**`handleReject` depends on `streamAbortRef`.** The `handleReject` callback (line 228-233) calls `streamAbortRef.current?.abort()` and resets `workPhases` and `modelWorkBlocks`. If `useNlQueryStream` owns the abort controller and the phase state, then `handleReject` must call into the hook's `cancelStream` — but the hook's return value must be stable across renders (via refs or stable callbacks), and the parent must not hold a stale reference. This is tricky to get right and easy to break.

**Stale closure risk with extracted stream handler.** The `handleScopedStreamEvent` closure (lines 171-196) reads `controller.signal.aborted` and checks `streamAbortRef.current !== controller` as a guard against stale invocations. Moving this into a hook means the hook needs access to the same abort controller identity check. If the hook recreates the controller on each `startStream` call, the parent's ref to it may be stale.

#### 2. Security & Safety

No security concerns specific to this refactor.

#### 3. Edge Cases

**Double-invoke during React StrictMode.** If `useNlQueryStream` sets up any effects that start streams or register cleanup, React 18/19 StrictMode double-invokes effects in development. The current code avoids this by making stream initiation purely callback-driven (no effects start streams). A hook with `useEffect`-based cleanup could introduce double-stream bugs in dev mode.

**Unmount during active stream.** The current cleanup effect (lines 133-137) aborts the stream on unmount. If the abort controller lives inside a hook, the hook must handle its own cleanup — and the parent must not also try to abort, or you get double-abort errors.

#### 4. Test Gaps

**Existing tests test the integrated component.** The tests in `NlQueryWorkflow.core.test.tsx` render `<NlQueryWorkflow>` and drive it through its full lifecycle via `handleRef.current?.triggerGenerate()`. This works because the component is self-contained. After extraction, these tests should still pass without modification IF the refactor is purely internal — but the plan says "Update existing tests in __tests__/NlQueryWorkflow.core.test.tsx to work with the refactored structure", implying the public API changes. Any test that needs updating suggests the refactor is changing the component's interface, which is a red flag for a "pure extraction" refactor.

**The proposed `SuggestionChips.test.tsx` would duplicate coverage.** The existing test "renders provided suggestions as placeholder prompts" already covers suggestion rendering through the integrated component. Adding a separate test file for an already-extracted component (`NlApprovalDialog`) adds maintenance burden without new coverage.

#### 5. Side Effects

**QueryPanel imports from NlQueryWorkflow.** `QueryPanel.tsx` imports `NlQueryWorkflowHandle`, `NlPhase`, and `ApproveThemeClasses` from `./NlQueryWorkflow`. The plan does not mention updating these re-exports. If the extraction changes the export surface, `QueryPanel` breaks.

**The plan does not mention `NlApprovalDialog`.** If `SuggestionChips.tsx` replaces `NlApprovalDialog`, the plan must also delete `NlApprovalDialog.tsx` and update its import in `NlQueryWorkflow.tsx`. If it's a new component alongside `NlApprovalDialog`, there's confusion about which to use.

---

### Reviewer 3 — Completeness & Alternatives

#### 1. Missing Requirements

**No mention of the existing `NlApprovalDialog` component.** The plan doesn't acknowledge that the suggestion dropdown UI is already extracted into `NlApprovalDialog.tsx`. This is a fundamental gap — the plan is proposing to create something that already exists under a different name.

**No mention of the `useNlSuggestions` hook.** The plan says to "move the chip rendering, click handlers, and loading skeleton" but doesn't mention the existing `useNlSuggestions` hook that already manages suggestion filtering, active index state, keyboard navigation, and suggestion application. The plan should reference this hook and explain how `SuggestionChips.tsx` relates to it.

**No mention of `useTypewriter` or `NlQueryReducer`.** These are already-extracted pieces that represent the pattern the codebase has already established. The plan should survey what's already extracted before proposing new extractions.

#### 2. Simpler Alternatives

**Do nothing.** `NlQueryWorkflow.tsx` is 368 lines. After removing imports (18 lines), type definitions (22 lines), and the JSX return block (70 lines), the actual logic is roughly 258 lines of hooks, callbacks, and effects. This is within normal bounds for a React orchestration component. The file is not "getting large" by any reasonable standard, especially given the complexity it manages.

**Extract only `handleGenerate` into `useNlGeneration`.** If something must be extracted, the single highest-value target is the `handleGenerate` callback and its associated state (`workPhases`, `modelWorkBlocks`, `streamAbortRef`). This would remove ~80 lines from the component and create a hook with a clear, well-bounded responsibility: "manage a single NL generation lifecycle." The return type would be `{ handleGenerate, handleCancel, workPhases, modelWorkBlocks }`.

**Move keyboard handling into `useNlSuggestions`.** The `handleKeyDown` callback is tightly coupled to suggestion state. Moving it into `useNlSuggestions` and having the hook return `handleKeyDown` would be a natural boundary that removes ~40 lines from the parent.

#### 3. Bigger Picture

The codebase shows a clear pattern of thoughtful decomposition: `NlQueryReducer`, `useNlSuggestions`, `NlApprovalDialog`, `phaseStateMachine`, `useTypewriter`, `NlWorkflowSteps`. The plan seems unaware of this existing decomposition and proposes extractions that overlap with what's already been done. A better approach would be to survey the existing architecture first, identify the remaining irreducible complexity, and only then decide if further extraction is warranted.

#### 4. UX & User Impact

This is a pure refactor — no UX impact expected. However, if the refactor inadvertently changes the abort/stream lifecycle (as Reviewer 2 warns), users could experience stuck loading states or phantom streams that don't cancel properly.

#### 5. Hidden Dependencies

- `NlApprovalDialog.tsx` must be addressed (renamed, replaced, or acknowledged)
- The re-exports from `NlQueryWorkflow.tsx` (`ApproveThemeClasses`, `NlPhase`, `NlQueryWorkflowHandle`) consumed by `QueryPanel.tsx` must be preserved
- The `useImperativeHandle` contract (the `NlQueryWorkflowHandle` ref API) must be preserved exactly — `QueryPanel` and tests rely on it

---

## Synthesized Review

### Critical Issues

1. **The "SuggestionChips" extraction duplicates an existing component.** (Reviewers 1, 3) The plan proposes creating `SuggestionChips.tsx` to hold "chip rendering, click handlers, and loading skeleton." This component already exists as `NlApprovalDialog.tsx` (51 lines, handles suggestion rendering and click application) combined with the `useNlSuggestions` hook (91 lines, handles filtering, keyboard nav, and state). Creating `SuggestionChips.tsx` would either duplicate `NlApprovalDialog` or need to replace it — neither scenario is addressed in the plan.

2. **The "streaming logic" extraction misidentifies what lives in this component.** (Reviewers 1, 2) The plan describes extracting "SSE connection setup, event parsing, and state management." But the connection setup and event parsing already live in `lib/api/query.ts` (`streamNlQuery` function). What actually lives in `NlQueryWorkflow.tsx` is the *abort controller lifecycle* and *state reduction dispatch* — splitting this across modules introduces race condition risks (abort controller ownership split, stale closures on the stream event handler, double-cleanup on unmount).

### Strong Recommendations

3. **If extraction is still desired, extract `handleGenerate` into `useNlGeneration`.** (Reviewer 3) The highest-value extraction is the `handleGenerate` callback plus its associated state (`workPhases`, `modelWorkBlocks`, `streamAbortRef`). This creates a hook with a clear responsibility boundary ("manage a single NL generation lifecycle") and removes ~80 lines. The return type would be `{ handleGenerate, handleCancel, workPhases, modelWorkBlocks }`. This avoids the abort controller ownership split because the hook owns both the controller and the state it protects.

4. **Move keyboard handling into `useNlSuggestions`.** (Reviewer 3) The `handleKeyDown` callback (lines 248-288) is tightly coupled to suggestion state (`suggestionsOpen`, `filteredSuggestions`, `activeSuggestionIndex`, `applySuggestion`). Having `useNlSuggestions` return a `handleKeyDown` callback would be a natural boundary. The only addition needed is passing `englishQuery`, `phase`, and `handleGenerate` so the hook can handle Cmd+Enter.

5. **Preserve the public API exactly.** (Reviewer 2) The `NlQueryWorkflowHandle` ref API, the `NlQueryWorkflowProps` interface, and the re-exports (`ApproveThemeClasses`, `NlPhase`) must remain unchanged. `QueryPanel.tsx` imports from `./NlQueryWorkflow` and tests drive the component via `handleRef.current?.triggerGenerate()`. Any change to these contracts is a breaking change.

### Minor Suggestions

6. **Survey existing decomposition before proposing new extractions.** (Reviewer 3) The plan should document what's already extracted (`NlQueryReducer`, `useNlSuggestions`, `NlApprovalDialog`, `phaseStateMachine`, `useTypewriter`, `NlWorkflowSteps`) and identify remaining irreducible orchestration. At 368 lines with this level of decomposition, the component may not need further splitting.

7. **Don't create `SuggestionChips.test.tsx` if the component already has coverage.** (Reviewer 2) The existing integration tests in `NlQueryWorkflow.core.test.tsx` cover suggestion rendering. If `NlApprovalDialog` needs its own unit tests, add them in `__tests__/NlApprovalDialog.test.tsx` — don't create a parallel test file for a component under a different name.

### Alternative Approaches

**The strongest alternative is: don't refactor this file at all.** (Reviewers 1, 3 convergent) `NlQueryWorkflow.tsx` is 368 lines of orchestration code that glues together 7 already-extracted modules. The remaining logic is irreducible wiring — hooks, callbacks, effects, and JSX composition. The file is not large by any reasonable standard, and forcing extractions creates artificial module boundaries that obscure the data flow. If the team feels the file is hard to navigate, a better investment would be adding section comments or collapsible regions rather than splitting tightly-coupled orchestration across files.

If the team is committed to reducing the file size, the **"extract `useNlGeneration` hook + move keyboard handling into `useNlSuggestions`"** approach (recommendations 3 and 4) would remove ~120 lines without introducing the architectural risks of the current plan. This approach aligns with the existing decomposition pattern and preserves the abort controller ownership model.

---

**Overall assessment: The plan needs significant revision.** It proposes extractions that duplicate existing components, misidentifies the location of streaming logic, and introduces abort controller ownership risks. The file it targets is already well-decomposed at a reasonable size. The alternative approaches above are more aligned with the codebase's existing architecture.

Want me to update the plan based on this feedback?
