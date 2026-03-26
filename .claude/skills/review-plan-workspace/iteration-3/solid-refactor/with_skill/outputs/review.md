# Plan Review: Refactor NlQueryWorkflow Component

**Verdict: This plan should not be implemented.** Both reviewers independently concluded that the plan is based on incorrect assumptions about the codebase. The extractions it proposes have already been done, and the streaming API it describes does not match the actual architecture.

---

## Critical Issues

### 1. "Suggestion chips" extraction duplicates existing `NlApprovalDialog.tsx` (CRITICAL — both reviewers converged)

**Evidence:**
- `frontend/src/components/data/NlApprovalDialog.tsx` (50 lines) already exists and renders the suggestion autocomplete dropdown with labels, prompts, active-index highlighting, and click handlers.
- `frontend/src/components/data/hooks/useNlSuggestions.ts` (91 lines) already exists and manages suggestion filtering, placeholder prompts, open/close state, active index, and the `applySuggestion` callback.
- The only suggestion-related code remaining in `NlQueryWorkflow.tsx` is: a 13-line hook call (lines 141-153), keyboard navigation (lines 248-288), and a 6-line JSX conditional (lines 332-338).
- There are no "chips" anywhere in the component. There is no loading skeleton for suggestions — the word "skeleton" does not appear in `NlQueryWorkflow.tsx`.

**Impact:** Creating `SuggestionChips.tsx` would either duplicate `NlApprovalDialog.tsx` or be a pointless wrapper around already-extracted code.

### 2. Proposed streaming hook API describes functionality that does not exist (CRITICAL — both reviewers converged)

**Evidence:**
- The plan says to extract "SSE connection setup, event parsing" and return `{ streamedSql, streamedRationale, isStreaming, startStream, cancelStream }`.
- **No SSE exists in NlQueryWorkflow.** The component receives `onGenerate` as a prop (a Promise-returning function) and passes a typed callback to receive stream events. SSE parsing happens in the API layer, not here.
- **No streamed SQL or rationale exists.** SQL arrives as a complete string in `NlGenerationResult` when `onGenerate` resolves (line 205). The streaming is exclusively for work-phase progress indicators and model-work-block deltas (thinking/planning text).
- **`handleGenerate` is tightly coupled to component state.** It calls `dispatch()` on the component's `useReducer`, calls `setWorkPhases()` and `setModelWorkBlocks()` state setters, and manages `streamAbortRef`. Extracting it into a hook would require passing 5+ state setters and refs, creating a leaky abstraction.

**Impact:** Implementing the proposed hook would require either inventing non-existent streaming-SQL functionality or creating a hook whose API doesn't match reality.

---

## Strong Recommendations

### 3. Plan's file modification list is incomplete — 4 files in the import chain are missing (IMPORTANT — both reviewers converged)

**Evidence from import chain analysis:**
- `frontend/src/components/data/NlWorkflowSteps.tsx` line 14: `import type { ApproveThemeClasses, NlPhase } from './NlQueryWorkflow'`
- `frontend/src/components/data/SqlRevealBlock.tsx` line 22: `import type { ApproveThemeClasses } from './NlQueryWorkflow'`
- `frontend/src/components/data/QueryPanel.tsx` line 26: `import type { NlQueryWorkflowHandle, NlPhase, ApproveThemeClasses } from './NlQueryWorkflow'`
- `frontend/src/components/data/__tests__/NlQueryWorkflow.stream.test.tsx` lines 7, 16: imports component and handle type

Any change to NlQueryWorkflow's export surface would break these files. The plan lists only 3 files to modify.

### 4. `NlQueryWorkflow.stream.test.tsx` (241 lines) is entirely omitted from the plan (IMPORTANT — both reviewers converged)

**Evidence:** `frontend/src/components/data/__tests__/NlQueryWorkflow.stream.test.tsx` directly tests the streaming/generation logic the plan proposes to extract — streamed phase events, abort-via-reject, stale run deduplication, model work blocks, constrained-height panel behavior. The plan only mentions `NlQueryWorkflow.core.test.tsx`.

---

## Minor Suggestions

### 5. 367-line file is not unusually large (MINOR — both reviewers converged)

The component has already been through systematic extraction:
| Extracted module | Lines |
|---|---|
| `NlQueryReducer.ts` | 70 |
| `NlWorkflowSteps.tsx` | 232 |
| `NlApprovalDialog.tsx` | 50 |
| `useNlSuggestions.ts` | 91 |
| `useTypewriter.ts` | 65 |

The remaining 367-line orchestrator has ~70 lines of JSX and ~60 lines for the generation handler. This is normal for a component with `useReducer`, `useImperativeHandle`, and keyboard navigation.

### 6. Proposed `SuggestionChips.test.tsx` would duplicate existing test coverage (MINOR)

Suggestion placeholder rendering and interaction are already tested in `NlQueryWorkflow.core.test.tsx` (lines 28-58).

---

## Alternative Approaches

### Alternative A: Do nothing (recommended)

The codebase is already well-factored. The prior extraction round addressed exactly the concerns this plan raises. Further splitting creates more files and indirection without improving readability.

**Effort: 0 lines. Risk: 0.**

### Alternative B: Move keyboard navigation into `useNlSuggestions` (minor, optional)

The keyboard handler (NlQueryWorkflow lines 248-288) logically belongs with the suggestion state it manages. Moving it into `useNlSuggestions` would save ~40 lines and improve cohesion.

**Steps:**
1. Add `phase`, `englishQuery`, `onGenerate` params to `useNlSuggestions`
2. Move `handleKeyDown` logic into the hook, return it
3. Remove handler from NlQueryWorkflow
4. No new files needed

**Effort: ~30 lines moved, 0 new files. Risk: low.**

### Alternative C: Clean up type re-exports (minor, optional)

`ApproveThemeClasses` and `NlPhase` are defined in `NlQueryReducer.ts` but re-exported through `NlQueryWorkflow.tsx`. Three downstream files (`NlWorkflowSteps.tsx`, `SqlRevealBlock.tsx`, `QueryPanel.tsx`) import them from NlQueryWorkflow. Updating those imports to point directly at `NlQueryReducer` removes the re-export indirection.

**Steps:**
1. Update imports in 3 files to use `'./NlQueryReducer'` instead of `'./NlQueryWorkflow'`
2. Remove `export { type ApproveThemeClasses, type NlPhase } from './NlQueryReducer'` from NlQueryWorkflow.tsx line 367

**Effort: ~10 lines changed across 4 files. Risk: trivial.**

---

## Revised Plan

Given the critical issues, the original 5-step plan should be replaced with either **"do nothing"** or, if minor cleanup is desired, a combined Alternative B+C:

1. Move keyboard navigation handler from `NlQueryWorkflow.tsx` (lines 248-288) into `useNlSuggestions.ts` hook
2. Update `NlWorkflowSteps.tsx`, `SqlRevealBlock.tsx`, `QueryPanel.tsx` to import `ApproveThemeClasses`/`NlPhase` directly from `NlQueryReducer`
3. Remove type re-exports from `NlQueryWorkflow.tsx` line 367
4. Run existing tests (`npm run test`) — no new test files needed
5. Run `npm run lint`

**Files to modify:** 5 (`NlQueryWorkflow.tsx`, `useNlSuggestions.ts`, `NlWorkflowSteps.tsx`, `SqlRevealBlock.tsx`, `QueryPanel.tsx`)
**Files to create:** 0
**Net line change:** approximately -35 lines

---

Want me to update the plan based on this feedback?
