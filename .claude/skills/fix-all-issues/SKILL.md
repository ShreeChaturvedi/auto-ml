---
name: fix-all-issues
description: Automatically fetch, prioritize, and fix all open GitLab issues for the current sprint. Delegates each issue to an isolated subagent (one per issue) to keep context clean. Runs TDD, verification, and simplification after each fix. Creates MRs for human review. Designed for unattended cron execution but also works interactively. Use this whenever you want to batch-fix issues, clear the sprint backlog, or when the cron schedule triggers.
---

# Fix All Open Issues

Batch-process open GitLab issues for the current sprint. Each issue gets its own isolated subagent (via `isolation: "worktree"`) so no single fix bloats the orchestrator's context. Subagents handle the full lifecycle: fix → verify → push → create MR → label issue. The orchestrator handles prioritization, dispatching, and cleanup.

## Orchestration

### 1. Detect sprint

Extract sprint number from the current branch name (e.g., `sprint9` -> `09`, `sprint10` -> `10`). Pad single digits with a leading zero for the label format `SPRINT::09`. Also note the unpadded branch name (e.g., `sprint9`) — subagents need it to branch correctly.

If not on a sprint branch, check the most recent issue labels to infer the current sprint.

### 2. Fetch open issues

```bash
glab issue list -l "SPRINT::09" -O json
```

If no open issues exist, report "No open issues for sprint {N}" and stop.

### 3. Filter out issues that shouldn't be auto-fixed

Skip issues that:
- Are **assigned** to someone (they're actively working on it)
- Have an existing **merge request** (`merge_requests_count > 0`)
- Have labels like `blocked`, `needs-info`, or `needs-discussion`

### 4. Prioritize

Sort remaining issues by:
1. **Priority label** — `Priority::High` > `Priority::Medium` > `Priority::Low` (no label = Low)
2. **Type** — bugs (titles/descriptions with "fix", "error", "fail", "broken", "crash", "bug") before features before refactors
3. **Issue number** — ascending (older first)

**Deduplication**: If multiple issues reference the same root cause (cross-references like "related to #X", "#X", or identical key files sections), keep only the highest-priority one. Note the others as "deferred — related to #{parent}".

**Cap**: Process at most **5 issues** per run.

### 5. Process each issue

For each issue in priority order:

#### a. Spawn a fix subagent

Use the `Agent` tool with **`isolation: "worktree"`** and `subagent_type: "general-purpose"`. Pass the **Subagent Prompt** (below) with the issue's details and the sprint branch name filled in.

Important: spawn ONE subagent at a time (sequential, not parallel). Wait for each to complete before starting the next.

#### b. Handle the result

The subagent handles the full lifecycle: fix → verify → push → create MR → label issue. Parse its JSON report.

**If `"status": "success"`**: Extract `mr_url` from the report. Clean up the worktree:
```bash
cd {original_project_dir}
git worktree remove {worktree_path} --force
```

**If `"status": "skipped"` or `"status": "failed"`**: Log the reason. Clean up the worktree. Continue to the next issue.

**Circuit breaker**: If **3 consecutive** issues fail (not skipped — failed), stop the run entirely. Something systemic is likely wrong. Report what happened.

### 6. Summary

Output a table:

```
## Automated Fix Run — Sprint {N}

| Issue | Title | Status | MR |
|-------|-------|--------|----|
| #132 | Notebook df not defined | Fixed | !45 |
| #133 | Refactor preamble hooks | Skipped (related to #132) | — |
| #130 | Use configured expiry | Fixed | !46 |
| #131 | Consolidate utils | Fixed | !47 |

3 fixed, 1 skipped, 0 failed
```

---

## Subagent Prompt

Use this as the prompt for each subagent. Replace `{variables}` with actual issue data.

```
You are a senior engineer fixing GitLab issue #{number} in an automated pipeline. Work autonomously — there is no human to ask.

Read CLAUDE.md at the project root for coding conventions before starting.

## Issue
Title: {title}
Priority: {priority}
Labels: {labels}

Description:
{full issue description}

## Process

### 1. Branch from sprint
The worktree starts on a default branch — NOT the sprint branch. You must branch from the sprint explicitly:
git fetch origin {sprint_branch}
git checkout -b fix/issue-{number} origin/{sprint_branch}

This is critical. Without this, your MR will have merge conflicts and no actual changes.

### 2. Understand the issue
Read the description carefully. Identify what needs to change, which files are involved, and what the acceptance criteria are.

### 3. Explore the code
Use Grep, Glob, and Read. Trace the data flow through every file mentioned in the issue. Don't guess — read.

Before writing code, Grep for EVERY instance of the pattern you need to change. The issue description may cite outdated line numbers or miss instances — your search is the source of truth.

### 4. Find root cause (for bugs)
If this is a bug: trace the data flow backward from the symptom to the root cause. Do NOT patch symptoms. Understand WHY the bug exists before writing any fix. Check recent git changes to the relevant files.

### 5. Plan
Think through the minimal correct fix. What's the smallest change that solves the problem? Could it break anything else?

### 6. Write a failing test first (when applicable)
If the issue describes a behavior (bug or feature), write a test that demonstrates the desired behavior BEFORE implementing. Run it and confirm it fails for the RIGHT reason (not a typo or missing import). Skip this only for pure refactoring issues where existing tests cover the behavior.

### 7. Implement
Make the changes. Keep them focused — fix the issue, don't refactor unrelated code.

### 8. Simplify your changes
Review your own diff critically:
- Remove code that isn't strictly necessary for the fix
- No over-engineering (abstractions for single use, error handling for impossible cases)
- No dead code, no commented-out code
- Comments explain WHY, not WHAT
- If you added more than 200 lines, reconsider — something is probably wrong

### 9. Verify (MANDATORY — do not skip)
Run BOTH of these and read the FULL output:

npm run lint
npm run test

Both must exit 0 with zero errors and zero test failures. If either fails, fix the problems. Do NOT report success without fresh green output. "It should pass" is not evidence — run it.

### 10. Commit
Stage only the files you changed:

git add {specific files}
git commit -m "$(cat <<'EOF'
fix: {concise description} (closes #{number})
EOF
)"

### 11. Push, create MR, and move issue to review
git push -u origin fix/issue-{number}

Create the MR. Note: `glab mr create` outputs plain text, NOT JSON. The MR URL is on the last line of stdout. Do not try to parse glab output as JSON.

glab mr create --title "Fix #{number}: {short title}" --description "$(cat <<'EOF'
Closes #{number}

## What changed
{one bullet per file changed}

## Why
{root cause or motivation}

## Acceptance criteria
{each criterion as a checkbox, all checked}

_Automated fix — please review before merging._
EOF
)" --target-branch {sprint_branch} --remove-source-branch

Then move the issue to review:
glab issue update {number} -l "QA::REVIEW NEEDED" -l "DLC::Review"
glab issue note {number} --message "Automated fix submitted: {MR_URL}"

### 12. Report
End your response with exactly this JSON (no markdown fence):

{"issue": {number}, "status": "success", "files_changed": [...], "tests_passed": true, "lint_passed": true, "summary": "one-line description of what was fixed", "mr_url": "the MR URL from glab output"}

## When to SKIP (status: "skipped")
- Issue is vague or ambiguous
- Fix requires infrastructure, CI/CD, or deployment changes
- Fix spans more than 10 files
- Issue depends on another unresolved issue (check cross-references)
- Cannot understand the problem after thorough investigation

## When to FAIL (status: "failed")
- Tests or lint fail after 3 fix attempts
- Git operations fail
- Codebase is in an unexpected state

Always include the reason in your JSON: {"issue": {number}, "status": "skipped", "reason": "..."}
```

---

## Cron Integration

This skill runs unattended via cron. The installed crontab:

```cron
3 6 * * * cd /home/shree/Documents/CSE449/repo && /home/shree/.local/bin/claude --dangerously-skip-permissions --effort max -n "Cron Issue Fix $(date +\%Y-\%m-\%d) 1" -p "/fix-all-issues" >> /tmp/fix-all-issues.log 2>&1
3 18 * * * cd /home/shree/Documents/CSE449/repo && /home/shree/.local/bin/claude --dangerously-skip-permissions --effort max -n "Cron Issue Fix $(date +\%Y-\%m-\%d) 2" -p "/fix-all-issues" >> /tmp/fix-all-issues.log 2>&1
```

The worktree isolation ensures cron runs don't interfere with active development work.
