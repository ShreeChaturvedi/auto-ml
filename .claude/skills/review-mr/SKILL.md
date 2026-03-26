---
name: review-mr
description: Review a GitLab merge request, summarize changes, assess quality, and if acceptable auto-merge + run quality cleanup + delete source branch. Use when you want to review and land an MR quickly.
disable-model-invocation: true
argument-hint: "[MR-number]"
---

# Review and Land a Merge Request

Review GitLab MR **!$ARGUMENTS**, and if it passes quality checks, merge it, run a cleanup pass, and delete the source branch.

## Steps

### 1. Fetch MR details

```bash
glab mr view $ARGUMENTS
glab mr diff $ARGUMENTS
```

Note the source branch, target branch, author, and description.

### 2. Read changed files in full

Don't just read the diff — read each changed file in full so you understand the context around the changes. Use Read/Glob/Grep as needed. This is essential for an informed review.

### 3. Summarize and assess

Present a brief summary to the user:

- **What changed:** 1-3 sentences on what was done and why
- **Files touched:** list with short annotations
- **Quality verdict:** one of:
  - **Good** — clean, correct, follows project conventions
  - **Acceptable** — minor issues that /simplify can clean up post-merge
  - **Needs work** — problems that must be fixed before merging (bugs, broken logic, security issues, architectural violations)

### 4. Act on the verdict

**If Good or Acceptable:**

Merge the MR, run a quality pass, and clean up:

```bash
glab mr merge $ARGUMENTS --squash --remove-source-branch --yes
```

After the merge lands, sync your local branch:

```bash
git pull --ff-only origin <target-branch>
```

Then invoke the `/simplify` skill to review and clean up the merged code. The diff from the merge commit gives /simplify its scope — it will review exactly the files that came in from the MR.

Scale the cleanup to the MR size: for small MRs (a few files, under ~100 lines), tell /simplify the change is small so it can use fewer agents. For large MRs (many files, hundreds of lines), it should use the full parallel agent set. Pass this context when invoking the skill.

After /simplify finishes and makes any fixes, commit those fixes as a separate cleanup commit (not amending the merge).

**If Needs work:**

Do NOT merge. Instead, leave a review comment on the MR listing the specific issues that need to be fixed:

```bash
glab mr comment $ARGUMENTS --message "..."
```

Be specific and actionable — tell the author exactly what to fix, not vague suggestions. Reference file paths and line numbers.

### 5. Report

Tell the user what happened:
- The summary from Step 3
- Whether it was merged or sent back
- If merged: what /simplify found and fixed (if anything)
- If sent back: the issues listed in the comment

## Important

- If `glab` auth fails, tell the user to run `glab auth login` first
- If the MR has unresolved merge conflicts with the target branch, do NOT merge — tell the user the MR needs to be rebased first
- If the MR modifies sensitive files (.env, credentials, secrets), flag this explicitly regardless of quality verdict
- The squash merge keeps the target branch history clean — one commit per MR
