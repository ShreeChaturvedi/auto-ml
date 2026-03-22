# Plan Review: Refactor NlQueryWorkflow Component

## Summary Verdict

The plan has the right instinct (reduce component size, separate concerns) but misidentifies what to extract and where the actual complexity lives. Two of the three proposed extractions target code that either **does not exist** in the component or has **already been extracted**. The one extraction that could add value (the generation orchestration logic) is described inaccurately. Executing this plan as written would produce little benefit and introduce unnecessary indirection.

---

## Issue 1 (Critical): "Suggestion Chips" Do Not Exist in This Component

**What the plan says:** Extract suggestion chips UI into `SuggestionChips.tsx` -- move chip rendering, click handlers, and loading skeleton.

**What actually exists:** `NlQueryWorkflow.tsx` (367 lines) contains no "suggestion chips," no chip rendering, and no loading skeleton for suggestions. The suggestion UI that appears in this component is the `<NlApprovalDialog>` autocomplete dropdown (line 333), which is **already extracted** into its own file at `frontend/src/components/data/NlApprovalDialog.tsx`. That component is 50 lines and receives `suggestions`, `activeSuggestionIndex`, and `onApplySuggestion` as props -- exactly the pattern the plan proposes to create.

The suggestion filtering, state management, and input handling are **already extracted** into the `useNlSuggestions` hook at `frontend/src/components/data/hooks/useNlSuggestions.ts` (91 lines).

**Impact:** This extraction target is a phantom. Creating `SuggestionChips.tsx` would either duplicate `NlApprovalDialog.tsx` or wrap it in a pointless passthrough layer. Writing tests for it would test already-covered functionality.

---

## Issue 2 (Critical): No SSE/Streaming Logic Exists in the Component

**What the plan says:** Extract streaming logic into `useNlQueryStream.ts` -- move the SSE connection setup, event parsing, and state management; return `{ streamedSql, streamedRationale, isStreaming, startStream, cancelStream }`.

**What actually exists:** `NlQueryWorkflow.tsx` contains **zero SSE connection setup and zero event parsing**. The component receives an `onGenerate` callback prop (line 60-63) that the parent (`QueryPanel` / `DataViewerTab`) wires to either `executeNlQuery` or `streamNlQuery` from `frontend/src/lib/api/query.ts`. The actual NDJSON stream reading lives in `streamNlQuery()` (query.ts lines 173-212) and `readNdjsonStream` (a separate `streamReader` module). The component never touches `fetch`, `EventSource`, `Response.body`, or any stream primitive.

What the component *does* contain is **generation orchestration** -- the `handleGenerate` callback (lines 159-220) that:
- Creates an `AbortController`
- Resets work phase state
- Dispatches to the reducer
- Provides a scoped stream event handler that routes events to the correct state updaters
- Handles the try/catch/finally lifecycle

The proposed return signature (`streamedSql`, `streamedRationale`) does not match what this logic actually manages. The component tracks `workPhases` (via `NlWorkPhaseState[]`) and `modelWorkBlocks` (via `NlModelWorkBlockState[]`), not streamed SQL/rationale text. The `result` (containing `.sql` and `.rationale`) arrives as a single resolved promise payload, not incrementally streamed tokens.

**Impact:** Implementing the proposed API would require inventing functionality that does not exist, or would mismatch the actual data flow. A hook extraction here is viable, but the interface needs to be redesigned to match reality.

---

## Issue 3 (Moderate): The File Is Not Actually Large

At 367 lines (including imports, type definitions, and JSX), `NlQueryWorkflow.tsx` is a moderately sized React component. For context:
- `QueryPanel.tsx` is 418 lines
- `SqlRevealBlock.tsx` is at least 30+ lines of imports alone
- `NlWorkflowSteps.tsx` is 232 lines

The component has already undergone significant decomposition:
- State machine logic is in `NlQueryReducer.ts` (70 lines)
- Suggestion management is in `hooks/useNlSuggestions.ts` (91 lines)
- Suggestion dropdown UI is in `NlApprovalDialog.tsx` (50 lines)
- Workflow step visualization is in `NlWorkflowSteps.tsx` (232 lines)
- Phase state machine functions are in `@/lib/nlQuery/phaseStateMachine.ts`
- Typewriter animation is in `hooks/useTypewriter.ts`

The remaining 367 lines are the irreducible orchestration glue that connects these pieces. Further extraction would move complexity rather than reduce it.

---

## Issue 4 (Moderate): Missing Files from Modification List

The plan lists files to modify but misses several that import from `NlQueryWorkflow.tsx`:

| File | Imports from NlQueryWorkflow |
|------|------------------------------|
| `NlWorkflowSteps.tsx` | `ApproveThemeClasses`, `NlPhase` (type re-exports) |
| `SqlRevealBlock.tsx` | `ApproveThemeClasses` (type import) |
| `QueryPanel.tsx` | `NlQueryWorkflowHandle`, `NlPhase`, `ApproveThemeClasses` |
| `__tests__/NlQueryWorkflow.stream.test.tsx` | `NlQueryWorkflow`, `NlQueryWorkflowHandle` |

If the refactoring changes the export surface of `NlQueryWorkflow.tsx` (e.g., moving type exports to new modules), all of these files would need updates. The plan only lists `NlQueryWorkflow.tsx`, the core test file, and the test utils -- omitting the stream test file and three production consumers.

---

## Issue 5 (Minor): Test Strategy Gaps

The plan says to "update existing tests to work with the refactored structure" and "add unit tests for the new SuggestionChips component." This is underspecified:

1. **The stream test file** (`NlQueryWorkflow.stream.test.tsx`, 241 lines) is not mentioned at all. It exercises the exact generation orchestration logic the plan targets for extraction and would need significant updates.

2. **If a `useNlQueryStream` hook were created**, it would need its own unit tests using `renderHook` from `@testing-library/react`. The plan does not mention this -- it only proposes tests for the (phantom) SuggestionChips component.

3. **Integration coverage risk:** The existing tests render the full `NlQueryWorkflow` and test end-to-end behavior (trigger generate -> phase transitions -> approve/reject). Splitting logic into hooks changes the test boundary. The plan does not discuss whether existing integration tests should be preserved as-is or restructured.

---

## Issue 6 (Minor): Naming Confusion

The plan names the suggestion component `SuggestionChips.tsx`, but the existing UI pattern is not "chips" -- it is an autocomplete dropdown list (see `NlApprovalDialog.tsx`). There are no chip-style elements (rounded pill badges). Using "chips" in the name would mislead future developers about what the component renders.

---

## Recommended Alternative

If the goal is to reduce the orchestration weight of `NlQueryWorkflow.tsx`, a more accurate plan would be:

1. **Extract `useNlGeneration` hook** containing:
   - The `handleGenerate` callback (lines 159-220)
   - The `handleReject` callback (lines 228-233)
   - The `workPhases` and `modelWorkBlocks` state
   - The `streamAbortRef` lifecycle
   - Return `{ workPhases, modelWorkBlocks, handleGenerate, handleReject }`

2. **Move `ApproveThemeClasses` and `NlPhase` type exports** to `NlQueryReducer.ts` (where they are defined) and re-export from `NlQueryWorkflow.tsx` for backward compatibility. This fixes the awkward circular-feeling import where `NlWorkflowSteps.tsx` and `SqlRevealBlock.tsx` import types from the component they are children of.

3. **Do not create new UI components** -- the suggestion UI is already properly extracted.

4. **Update all six consumer files**, not just the three listed.

5. **Preserve existing integration tests** and add targeted `renderHook` tests for the new `useNlGeneration` hook.

This would reduce `NlQueryWorkflow.tsx` from ~367 lines to ~200 lines and remove the most complex logic (abort controller lifecycle, error handling, stream event routing) into a testable, reusable hook -- without creating phantom components or mismatched abstractions.

---

## Checklist Summary

| Aspect | Status | Notes |
|--------|--------|-------|
| Correctly identifies what code exists | No | Both extraction targets misidentify content |
| Proposed API matches actual data flow | No | `streamedSql`/`streamedRationale` do not exist as streamed values |
| All affected files listed | No | Missing 4 files (NlWorkflowSteps, SqlRevealBlock, QueryPanel, stream test) |
| Avoids duplication with existing code | No | SuggestionChips duplicates NlApprovalDialog + useNlSuggestions |
| Test plan is complete | No | Missing stream test file and hook unit tests |
| Naming is accurate | No | "Chips" does not match the existing dropdown UI pattern |
| Net complexity reduction | Uncertain | Risk of adding indirection without removing complexity |
