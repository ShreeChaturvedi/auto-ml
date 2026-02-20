# Sprint Report (Due February 21, 2026)

## Project
AI-Augmented AutoML Toolchain

## My Responsibilities This Sprint
- Create/track GitLab issues for known defects.
- Make code contributions with clear commit history.
- Fix high-priority bugs affecting user workflow.
- Prepare sprint status report.

## Work Completed

### 1) Bug fix: edited chat messages now re-submit correctly
- Commit: `83f3fd2`
- File: `frontend/src/components/training/TrainingPanel.tsx`
- Changes:
  - Save/checkmark in message edit mode now immediately re-sends edited prompt to backend.
  - Save is disabled when content is unchanged or empty.
  - Enter (without Shift) submits edit.
  - Edit textarea styling is adjusted for a seamless in-bubble edit experience.

### 2) Bug fix: password show/hide for login and signup
- Commit: `ad572a6`
- Files:
  - `frontend/src/components/auth/LoginForm.tsx`
  - `frontend/src/components/auth/SignupForm.tsx`
- Changes:
  - Added eye/eye-off visibility toggle on password fields.
  - Added confirm-password visibility toggle on signup.

## Validation Performed
- Targeted lint on changed files:
  - `frontend/src/components/training/TrainingPanel.tsx`
  - `frontend/src/components/auth/LoginForm.tsx`
  - `frontend/src/components/auth/SignupForm.tsx`
- Result: no lint errors on modified files (existing project-wide lint issues remain in unrelated files).

## Known/Open Issues Remaining
From sprint known-issues list, key items still open include:
- Tool-calling reliability when Thinking mode is OFF.
- File upload status mismatch (appears failed until refresh).
- SQL table not found query errors.
- Notebook/code-cell reliability (autosave/sync/performance/hangs).
- Chat edit UX polish beyond current fix.

## GitLab Issues Created
- Issue #18: Tool calls fail when Thinking mode is OFF in Training chat  
  - `https://gitlab.csi.miamioh.edu/2026-senior-design-projects/ai-augmented-automl-toolchain/ai-augmented-auto-ml-toolchain/-/issues/18`
- Issue #19: File upload shows failure state until page refresh (false negative)  
  - `https://gitlab.csi.miamioh.edu/2026-senior-design-projects/ai-augmented-automl-toolchain/ai-augmented-auto-ml-toolchain/-/issues/19`

## Risks / Blockers
- Existing unrelated frontend lint errors make full lint gate red, even when changed files are clean.

## Plan for Next Sprint
1. Prioritize Issue #18 and Issue #19 fixes and close them with regression tests.
2. Triage SQL-table lookup failures with reproducible test cases.
3. Add regression coverage around training chat edit/resend flow and tool execution continuation.
4. Continue reducing known-issues backlog in order of user-facing impact.
