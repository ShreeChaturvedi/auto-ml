# Plan Review: Refactor NlQueryWorkflow Component

## Critical Issues

### 1. The plan proposes extracting "suggestion chips" but that component already exists as `NlApprovalDialog`

**Convergent finding -- both review perspectives flagged this.**

The plan says to "extract suggestion chips into `SuggestionChips.tsx`" and move "chip rendering, click handlers, and loading skeleton." However, the suggestion dropdown UI is **already extracted** into `NlApprovalDialog.tsx` (50 lines, self-contained, only imported by `NlQueryWorkflow.tsx`). The suggestion filtering/state logic is **already extracted** into `hooks/useNlSuggestions.ts` (91 lines). There is no "loading skeleton" for suggestions in `NlQueryWorkflow.tsx` -- the component simply shows the `NlApprovalDialog` when `suggestionsOpen && filteredSuggestions.length > 0`.

Creating `SuggestionChips.tsx` would duplicate `NlApprovalDialog.tsx` -- or the plan misidentifies what code exists. Either way, Step 1 and Step 5 of the plan are based on a false premise.

**What to do instead:** Skip Step 1 entirely. The suggestion UI extraction is already done. If the goal is to rename `NlApprovalDialog` to `SuggestionChips` for clarity, that's a simple rename -- not an extraction.

**Files:** `frontend/src/components/data/NlApprovalDialog.tsx`, `frontend/src/components/data/hooks/useNlSuggestions.ts`

---

### 2. The plan proposes extracting "SSE connection setup and event parsing" but no SSE logic exists in `NlQueryWorkflow.tsx`

**Convergent finding -- both review perspectives flagged this.**

The plan says to extract "the SSE connection setup, event parsing, and state management" into `useNlQueryStream.ts` and return `{ streamedSql, streamedRationale, isStreaming, startStream, cancelStream }`. This fundamentally misidentifies what `NlQueryWorkflow.tsx` does.

`NlQueryWorkflow` does **not** manage any SSE/streaming connection. It receives an `onGenerate` callback prop from its parent (`QueryPanel`) and passes a `handleScopedStreamEvent` callback into it. The actual SSE/NDJSON streaming connection lives in `frontend/src/lib/api/query.ts` (`streamNlQuery` function, lines 173-212). The component only dispatches received events to phase state machine functions.

The proposed return signature `{ streamedSql, streamedRationale, isStreaming, startStream, cancelStream }` doesn't match the actual data flow. There is no `streamedSql` or `streamedRationale` -- the SQL comes back as a complete `NlGenerationResult` from the resolved promise, not streamed token-by-token. The streaming events are phase progress updates and model work blocks, not SQL tokens.

**What to do instead:** If the goal is to extract the generation orchestration (lines 159-220 of `NlQueryWorkflow.tsx`), the hook should be named something like `useNlGeneration` and its return signature should match the actual state: `{ workPhases, modelWorkBlocks, isGenerating, handleGenerate, handleReject, streamAbortRef }`. But first, verify this extraction adds real value -- see "Alternative Approaches" below.

**Files:** `frontend/src/components/data/NlQueryWorkflow.tsx` (lines 159-220), `frontend/src/lib/api/query.ts` (lines 173-212)

---

## Strong Recommendations

### 3. Missing files from the modification list

The plan lists only 3 files to modify but misses several downstream consumers that import from `NlQueryWorkflow.tsx`:

| File | Import |
|------|--------|
| `NlWorkflowSteps.tsx` | `import type { ApproveThemeClasses, NlPhase } from './NlQueryWorkflow'` |
| `SqlRevealBlock.tsx` | `import type { ApproveThemeClasses } from './NlQueryWorkflow'` |
| `QueryPanel.tsx` | `import { NlQueryWorkflow } from './NlQueryWorkflow'` + types |
| `__tests__/NlQueryWorkflow.stream.test.tsx` | `import { NlQueryWorkflow } from '../NlQueryWorkflow'` + handle type |

If the refactoring changes the module's export surface (e.g., moving types to a shared file), **all four** of these files need updating. The plan's modification list only covers `NlQueryWorkflow.tsx`, the core test, and the test utils -- but not the stream test file or the two sibling components that import types.

**What to do:** Add `NlWorkflowSteps.tsx`, `SqlRevealBlock.tsx`, `QueryPanel.tsx`, and `__tests__/NlQueryWorkflow.stream.test.tsx` to the files-to-modify list if any exports from `NlQueryWorkflow.tsx` change location.

---

### 4. The component is only 367 lines -- is this refactoring warranted?

`NlQueryWorkflow.tsx` is 367 lines including imports, type declarations, and JSX. The core logic (generation orchestration) is ~60 lines, the keyboard handler is ~40 lines, and the JSX return is ~70 lines. The state machine reducer is already extracted to `NlQueryReducer.ts`. The suggestions logic is already in `useNlSuggestions.ts`. The workflow step visualization is already in `NlWorkflowSteps.tsx`.

This component has already been well-decomposed. The remaining 367 lines are the orchestration glue that **should** live together -- it coordinates the reducer, the suggestions hook, the typewriter hook, the generation flow, the abort controller, and the imperative handle. Splitting this further risks creating modules that are tightly coupled yet separated, making the code harder to follow without reducing complexity.

**What to do:** Reconsider whether this refactoring is needed at all. See "Alternative Approaches" below.

---

### 5. New unit tests for `SuggestionChips` (Step 5) would duplicate existing test coverage

The plan proposes adding unit tests for the new `SuggestionChips` component. But the existing `NlQueryWorkflow.core.test.tsx` already tests suggestion rendering (line 28-48: "renders provided suggestions as placeholder prompts") and the `useNlSuggestions` hook handles filtering logic which could be unit tested independently. Adding tests for a wrapper that just passes props through would be low-value.

---

## Minor Suggestions

### 6. If extracting the generation hook, preserve the abort controller semantics carefully

The current abort logic in `NlQueryWorkflow.tsx` is subtle: it uses a ref-based identity check (`streamAbortRef.current !== controller`) to detect stale runs, not just `signal.aborted`. This handles the case where a new generation starts before the old one completes. The stream test file (`NlQueryWorkflow.stream.test.tsx`, "ignores stale aborted run results") explicitly tests this. Any extraction must preserve this pattern exactly.

### 7. The `ApproveThemeClasses` type re-export chain is fragile

`ApproveThemeClasses` is defined in `NlQueryReducer.ts`, re-exported from `NlQueryWorkflow.tsx`, and imported by `NlWorkflowSteps.tsx`, `SqlRevealBlock.tsx`, and `QueryPanel.tsx`. If refactoring changes exports, consider moving shared types to a dedicated types file (e.g., alongside `NlQueryReducer.ts` or in `@/types/`) to break this chain.

---

## Alternative Approaches

### Keep the component as-is (recommended)

The strongest alternative is to **not do this refactoring**. The evidence:

1. **The file is 367 lines** -- well within reasonable component size for an orchestrator.
2. **Previous extractions already happened:** `NlQueryReducer.ts`, `useNlSuggestions.ts`, `NlWorkflowSteps.tsx`, `NlApprovalDialog.tsx`, `useTypewriter.ts`, and the phase state machine in `@/lib/nlQuery/phaseStateMachine.ts` are all already separate modules.
3. **The two proposed extractions are based on incorrect assumptions** about what code exists (suggestion chips) and what the component does (SSE parsing).
4. **The remaining logic is coordination glue** -- it ties together the reducer, hooks, props, and callbacks. Extracting pieces of it into more hooks creates indirection without reducing coupling.

If there is a specific pain point driving this refactoring (e.g., the file keeps growing, or a specific piece needs reuse elsewhere), address that specific need rather than splitting for splitting's sake.

### If you must extract something, extract only the generation orchestration

If the component is expected to grow further, the highest-value extraction would be a `useNlGeneration` hook that encapsulates:
- The `workPhases` and `modelWorkBlocks` state
- The `handleGenerate` callback (including abort controller management)
- The `handleReject` cleanup
- The stream event routing

This would reduce `NlQueryWorkflow.tsx` by ~80 lines and leave a cleaner orchestrator. But this is a different plan than what was proposed.

---

## Summary

The plan needs significant revision. Both of its core extraction targets are based on incorrect assumptions about the codebase: the suggestion chips UI already exists as `NlApprovalDialog`, and there is no SSE connection logic in this component to extract. The file is 367 lines and already well-decomposed. The strongest path forward is to either abandon this refactoring or rewrite the plan to address a specific, validated pain point.

Want me to update the plan based on this feedback?
