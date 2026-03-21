---
name: issue
description: Create a new GitLab issue with proper labels and formatting
argument-hint: "[description of the issue]"
---

# Create a GitLab Issue

You are creating a new GitLab issue based on the user's description: **$ARGUMENTS**

## Steps

### 1. Understand the application context

If the issue description is ambiguous or references specific parts of the codebase, explore the relevant code first to understand:
- Which files/components are involved
- Current behavior vs expected behavior
- The scope of the change

Search and read files as needed. Write an informed issue, not a vague one.

### 2. Check recent issues for format and conventions

Run:
```
glab issue list --per-page 5
```

Then read 2–3 recent issues to understand the team's formatting style:
```
glab issue view <number>
```

Match the tone, structure, and level of detail you observe.

### 3. Determine the sprint label

Check the current branch name:
```
git branch --show-current
```

Extract the sprint number from the branch name (e.g., `sprint8-frontend` → `SPRINT:08`). Use this as one of the labels.

### 4. Check available labels

Run:
```
glab label list
```

Pick appropriate labels from existing ones. Always include:
- The sprint label (e.g., `SPRINT:08`)
- A type/category label if one fits (e.g., `bug`, `enhancement`, `frontend`, `backend`)

### 5. Draft and create the issue

Write a clear issue with:
- **Title**: Concise, action-oriented (e.g., "Fix upload timeout on large CSV files")
- **Description**: Follow the format observed in recent issues. Include:
  - What the problem/feature is
  - Why it matters or what's affected
  - Acceptance criteria or expected behavior
  - Relevant file paths or components if applicable

Create the issue:
```
glab issue create --title "..." --description "..." --label "SPRINT:08" --label "..."
```

### 6. Report back

Show the user the created issue number and URL. Briefly summarize the issue so they can confirm it looks right.

## Important

- Do NOT invent labels that don't exist — only use labels from `glab label list`
- If `glab` auth fails, tell the user to run `glab auth login` first
- If the description is too vague to write a good issue, ask the user for clarification before creating it
