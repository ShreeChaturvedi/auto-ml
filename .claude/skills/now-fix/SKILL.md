---
name: now-fix
description: Immediately fix the issue that was just created with /issue. Run right after /issue.
disable-model-invocation: true
---

# Immediately Fix the Just-Created Issue

The user just created an issue using `/issue` and wants to fix it right now.

## Steps

### 1. Use existing context

You already know the issue details from the `/issue` invocation earlier in this conversation. Do NOT re-fetch the issue from GitLab — you have all the context you need.

Identify:
- What the issue is about
- Which files/components are involved (you likely already explored these)

### 2. Explore further if needed

If the `/issue` step didn't fully explore the relevant code, do so now. Use Read, Grep, and Glob to understand the current state of the code that needs to change.

### 3. Plan the fix

Before writing any code, think through:
- What files need to change
- What the minimal, correct fix looks like
- Whether new tests are needed
- Whether this could break anything else

Announce your plan to the user briefly before proceeding.

### 4. Implement the fix

Make the changes. Follow the project's coding conventions (see CLAUDE.md). Keep changes focused — fix the issue, don't refactor unrelated code.

### 5. Verify

- Run `npm run lint` to check for lint errors
- Run relevant tests (e.g., `npm run test:backend` or `npm run test:frontend`)
- If the fix is in a specific file, run that test file directly if possible

### 6. Summarize

Tell the user:
- What was changed and why
- Which files were modified
- Test results
- Any follow-up items or considerations

## Important

- Do NOT commit automatically — let the user decide when to commit
- If something about the issue is unclear now that you're implementing, ask the user
- This command is always run in the same session as `/issue`, so leverage that context fully
