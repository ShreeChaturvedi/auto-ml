# AGENTS.md

This file provides guidance to AI coding agents (Codex, Claude Code, Cursor, etc.) when working with code in this repository.

## Project Overview

AI-augmented AutoML platform is a TypeScript monorepo with a React 19 frontend, Express 5 backend, Postgres metadata store, and Docker-containerized Python runtime for sandboxed code execution. Users follow a phase-based workflow: upload → explore → preprocess → features → training → experiments.

## Commands

```bash
# Development
# Assume dev server is running with backend at port 4000 and frontend at port 5173

# Build
npm run build                # Build backend (tsc) + frontend (vite build)

# Test
npm run test                 # All tests (vitest)
npm run lint                 # Lint across workspaces (never run individual lints)

# Database
npm run db:migrate           # Run pending migrations (idempotent)

# Benchmarks & Evaluation
npm run benchmark            # Playwright E2E (headless)
npm run eval                 # NL→SQL + RAG evaluation suite
npm run benchmark:api        # API load benchmarking (autocannon)
```

## Architecture

### Monorepo Layout

- backend: Express 5 + TypeScript API server
- frontend: Vite + React 19 SPA
- testing: Playwright E2E benchmarks and evaluation runner
- migrations: Postgres schema migrations (001–008)
- `scripts/dev/run.mjs`: Dev orchestrator (Docker Postgres → migrations → dev servers)

### Backend (`backend/src/`)

- `routes/`: Express routers mounted under `/api`
- `services/`: Domain logic
- `services/llm/`: OpenAI client, MCP tool registry, LangGraph preprocessing state machine
- `services/notebook/`: Notebook CRUD and cell execution
- `services/websocket/`: WebSocket server for real-time notebook updates
- `repositories/`: File+DB-backed stores (projectRepository, datasetRepository)
- `middleware/`: JWT auth verification

Persistence is split: file-backed (projects.json, dataset metadata) + Postgres (query cache, auth, embeddings, documents, notebooks). Docker containers provide sandboxed Python execution with resource limits.

### Frontend (`frontend/src/`)

- State: Zustand stores with persistence
- Routing: React Router v7, phase-based
- API: Typed fetch wrappers in `lib/api/`
- UI: shadcn/ui + Radix primitives + Tailwind CSS

## Development Principles

**Code quality.** Reduce bloated files, duplicated logic, and hacky workarounds. Extract shared behavior into well-named utilities or components. Proactively refactor when you see existing technical debt — don't layer new code on top of a mess. Leave the codebase cleaner than it was found.

**UI/UX is a first-class concern.** This project prioritizes an exceptional end-user experience. Think carefully about interaction design, visual polish, loading states, error feedback, responsiveness, and accessibility. Don't just make it work — make it feel great.

**Research and leverage existing libraries and components.** Before building from scratch, investigate whether a well-maintained library or component already solves the problem — whether it's a basic UI primitive, an LLM streaming renderer, a file loader, a notebook widget, or a syncing mechanism. Prefer proven solutions over reinvention.

**Lint after completion.** Use `npm run lint` as a fast feedback loop to catch errors early. If preexisting lint errors surface, don't ignore but systematically resolve them.

**Proactively suggest improvements.** When implementing or fixing a feature, brainstorm and present alternatives: better architectural patterns, more suitable libraries, stronger UI/UX approaches, or performance optimizations. Think critically about the bigger picture.

**Write strong tests.** If all tests pass but the user encounters errors, the tests are useless. Write strong tests that almost guarantee no errors in real QA testing. When running a test suite, never ignore failing tests. Always attempt to fix with my approval.

---

## Workflow Commands

These named workflows can be invoked by the user (e.g. "run fix-issue 42", "do a sync with sprint 9"). Follow the steps exactly as written.

---

### `fix-issue [issue-number]`

Fix a GitLab issue by number. Reads the issue, plans the fix, implements it, and verifies.

**Steps:**

1. **Read the issue**
   ```bash
   glab issue view <issue-number>
   ```
   Understand the title, description, labels, and any comments.

2. **Explore the relevant code**
   Based on the issue, find and read the relevant files. Use search tools to understand current behavior, related tests, dependencies, and side effects.

3. **Plan the fix**
   Before writing code, think through: which files change, what the minimal correct fix looks like, whether new tests are needed, and whether this could break anything. Announce your plan briefly before proceeding.

4. **Implement the fix**
   Make changes. Follow project coding conventions (CLAUDE.md / AGENTS.md). Keep changes focused — fix the issue, don't refactor unrelated code.

5. **Verify**
   - Run `npm run lint`
   - Run relevant tests (`npm run test` or a targeted test file)

6. **Summarize**
   Report: what changed and why, which files were modified, test results, any follow-up items.

**Important:** Do NOT commit automatically. If the issue is unclear, ask before implementing. If `glab` auth fails, tell the user to run `glab auth login`.

---

### `issue [description]`

Create a new GitLab issue with proper labels and formatting.

**Steps:**

1. **Understand the application context**
   If the description references specific parts of the codebase, explore the relevant files first. Write an informed issue, not a vague one.

2. **Check recent issues for format and conventions**
   ```bash
   glab issue list --per-page 5
   # then read 2–3 recent issues:
   glab issue view <number>
   ```
   Match the tone, structure, and level of detail you observe.

3. **Determine the sprint label**
   ```bash
   git branch --show-current
   ```
   Extract the sprint number from the branch name (e.g. `sprint8-frontend` → `SPRINT:08`).

4. **Check available labels**
   ```bash
   glab label list
   ```
   Pick appropriate labels. Always include the sprint label (`SPRINT:XX`) and a type label if one fits (`bug`, `enhancement`, `frontend`, `backend`, etc.).

5. **Draft and create the issue**
   Write a clear issue with:
   - **Title**: Concise, action-oriented (e.g. "Fix upload timeout on large CSV files")
   - **Description**: Follow the format from recent issues. Include: what the problem/feature is, why it matters, acceptance criteria, relevant file paths.
   ```bash
   glab issue create --title "..." --description "..." --label "SPRINT:XX" --label "..."
   ```

6. **Report back**
   Show the created issue number and URL. Briefly summarize so the user can confirm it looks right.

**Important:** Only use labels from `glab label list` — do not invent labels. If the description is too vague, ask for clarification before creating.

---

### `now-fix`

Immediately fix the issue that was just created with `issue`. Run right after `issue` in the same session.

**Steps:**

1. **Use existing context**
   You already know the issue details from the `issue` invocation earlier in this conversation. Do NOT re-fetch from GitLab — use what you have. Identify what the issue is about and which files are involved.

2. **Explore further if needed**
   If the `issue` step didn't fully explore the relevant code, do so now before writing anything.

3. **Plan the fix**
   Think through: which files change, what the minimal correct fix looks like, whether new tests are needed, whether this breaks anything. Announce your plan briefly.

4. **Implement the fix**
   Make changes following project conventions. Keep changes focused on the issue.

5. **Verify**
   - Run `npm run lint`
   - Run relevant tests

6. **Summarize**
   Report what changed, which files, test results, and any follow-up items.

**Important:** Do NOT commit automatically. If something is unclear now that you're implementing, ask the user. Leverage the full context from the `issue` step.

---

### `sync [sprint-number]`

Pull latest changes from a sprint branch into the current branch. Shows what's new (commits, files, authors), previews potential conflicts, handles uncommitted work, and rebases cleanly.

The target branch is `sprint<N>` (e.g. `/sync 9` → `sprint9`).

**Steps:**

1. **Check current state**
   ```bash
   git branch --show-current
   git status --short
   ```
   Note which branch you're on and whether there are uncommitted changes. If already on the target sprint branch, skip to Step 6.

2. **Stash uncommitted work**
   If there are any uncommitted changes, stash them:
   ```bash
   git stash push -u -m "sync: auto-stash before rebase on sprint<N>"
   ```

3. **Fetch latest**
   ```bash
   git fetch origin sprint<N>
   ```

4. **Show what's new** (situational awareness)
   ```bash
   git log --oneline --author-date-order HEAD..origin/sprint<N>
   git diff --stat HEAD...origin/sprint<N>
   git log --format='%an' HEAD..origin/sprint<N> | sort -u
   ```
   Present a brief summary: how many new commits, which files were touched (grouped by area), who contributed. If zero new commits, tell the user they're already up to date, pop any stash, and stop.

5. **Preview conflicts**
   ```bash
   git diff --name-only $(git merge-base HEAD origin/sprint<N>)..HEAD
   git diff --name-only $(git merge-base HEAD origin/sprint<N>)..origin/sprint<N>
   ```
   If there's overlap, warn the user which files may conflict before proceeding.

6. **Rebase (or fast-forward)**
   - If on the target sprint branch directly: `git pull --ff-only origin sprint<N>`
   - Otherwise: `git rebase origin/sprint<N>`

   If the rebase hits conflicts: identify conflicted files (`git diff --name-only --diff-filter=U`), read them to understand both sides, resolve by editing to produce the correct merged result, then `git add <files> && git rebase --continue`. Repeat per commit if needed. Tell the user what was resolved and why.

   If a conflict is genuinely ambiguous (two incompatible implementations), ask the user before choosing.

7. **Check if force-push is needed**
   ```bash
   git log --oneline origin/$(git branch --show-current)..HEAD 2>/dev/null
   ```
   If the branch exists on remote, warn the user they'll need `git push --force-with-lease`.

8. **Pop stash**
   If you stashed in Step 2: `git stash pop`. If the pop has conflicts, resolve them the same way.

9. **Report**
   Summarize: commits pulled, whether rebase was clean or conflicted, whether force-push is needed, whether stash was restored cleanly.

**Important:** Do NOT force-push without telling the user. Do NOT commit anything new. If the rebase gets into a bad state, suggest `git rebase --abort` and explain what went wrong.

---

### `frontend-design [description]`

Create distinctive, production-grade frontend interfaces with high design quality. Avoid generic AI aesthetics.

**Design principles to follow:**

- **Commit to a strong aesthetic direction.** Every component should have a point of view. Minimal, maximalist, brutalist, soft — pick one and execute it fully.
- **Typography is structure.** Use font weight, size contrast, and spacing to create clear hierarchy. Don't rely on color alone.
- **Color with intention.** Use a limited, purposeful palette. Every color choice should serve a reason — accent, state, hierarchy, brand.
- **Spatial composition matters.** Generous whitespace, deliberate alignment, and consistent rhythm create professional interfaces.
- **Motion adds meaning.** Subtle transitions and micro-interactions communicate state. Use them sparingly and intentionally.
- **Backgrounds are canvas.** Avoid plain white. Use subtle gradients, textures, or tinted neutrals to create depth.
- **Visual details elevate quality.** Shadows, borders, rounded corners, and icon weight should be consistent and considered.
- **Accessibility is non-negotiable.** Sufficient contrast, keyboard navigation, focus states, and semantic HTML.

**Implementation:**
- Use shadcn/ui + Radix primitives + Tailwind CSS (already in the project)
- Research existing components in `frontend/src/` before building from scratch
- Think about loading states, error states, empty states — not just the happy path
- Deliver production-ready code, not a prototype
