---
name: fix-issue
description: Fix a GitLab issue by number. Reads the issue, plans the fix, implements it, and verifies.
disable-model-invocation: true
argument-hint: "[issue-number]"
---

# Fix a GitLab Issue

You are fixing GitLab issue **#$ARGUMENTS**.

## Steps

### 1. Read the issue

```
glab issue view $ARGUMENTS
```

Understand exactly what needs to be done. Note the title, description, labels, and any comments.

### 2. Explore the relevant code

Based on the issue description, find and read the relevant files. Use Grep, Glob, and Read to understand:
- The current behavior and where it lives
- Related tests, if any
- Dependencies and side effects

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
- If the issue is unclear or seems wrong, ask the user before implementing
- If the fix requires changes outside the current sprint scope, flag it
- If `glab` auth fails, tell the user to run `glab auth login` first
