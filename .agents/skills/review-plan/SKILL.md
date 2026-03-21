---
name: review-plan
description: Deep multi-perspective review of a plan using parallel subagents. Use when you have a plan ready and want thorough critique before implementing.
argument-hint: "[optional: specific concerns to focus on]"
---

# Review Plan

Launch parallel agents to deeply critique your current plan. The goal is to surface things you missed, haven't considered, or could do better before you start writing code.

## Steps

### 1. Extract the plan

Gather the full plan from the current conversation context:
- The goal / what's being built or fixed
- The proposed approach and steps
- Files to be created or modified
- Any design decisions or trade-offs discussed

If the plan is vague or incomplete, tell the user you need a more concrete plan before reviewing.

If the user passed $ARGUMENTS, note those as areas of special focus for the reviewers.

### 2. Deep codebase investigation

This is the most important step. The reviewers are only as good as the context you give them. Do ALL of the following before launching reviewers:

**Read every file the plan touches:**
- Read the full contents of every file the plan mentions modifying (not just signatures)
- Read every file the plan proposes creating a peer of (to understand conventions)

**Trace the import chain for each modified file:**
- For each file the plan modifies, search for ALL files that import from it
- Record these — they are likely missing from the plan's modification list

**Audit dependencies:**
- If the plan adds npm packages, check `package.json` to see if they're already installed (directly or transitively via the lockfile)
- Check if existing packages already provide the needed functionality

**Find existing similar code:**
- Search for existing endpoints, components, hooks, or utilities that do something similar to what the plan proposes building
- This catches the "plan is unaware that X already exists" failure mode

**Verify plan claims:**
- If the plan says "file X is getting large", count its lines
- If the plan says "extract the SSE logic", verify SSE logic actually exists there
- If the plan says "modify docker-compose.yml", verify that file exists

**Check test coverage:**
- Read the test files for modules being modified
- Note what's already tested and what would break

Bundle all of this into a **Codebase Reality Report** structured like:

```
## Files the plan modifies
[contents of each]

## Import chain analysis
- fileA.ts is imported by: X, Y, Z (not listed in plan)
- fileB.ts is imported by: W (listed in plan)

## Dependency audit
- package "foo" is NOT in package.json (would be new)
- package "bar" is already a transitive dep via "baz" (fragile)

## Existing similar code
- GET /api/datasets/:id/download already serves files from disk (lines 80-111)
- useNlSuggestions hook already manages suggestion state (91 lines)

## Plan claim verification
- "file is getting large" → file is 367 lines (moderate, not large)
- "docker-compose.yml" → file does not exist

## Test coverage
- datasets.test.ts covers upload/delete but not download
- NlQueryWorkflow.core.test.tsx tests rendering + generation lifecycle
```

### 3. Launch 2 parallel reviewers

Send both in a single message. Each gets the full plan, the Codebase Reality Report, and the review checklist. They are comprehensive reviewers, not specialists.

**Reviewer A** (architecture focus)

```
You are doing a comprehensive design review of a proposed implementation plan. Your review must be thorough, specific, and evidence-based. Every finding must reference a specific file, line number, or code pattern — no generic advice.

## The Plan
[paste full plan]

## Codebase Reality Report
[paste the full report from step 2]

## Review Checklist — check EVERY item

### Existing Code & Duplication
- Does equivalent functionality already exist? (The reality report identifies candidates)
- Does the plan duplicate any existing components, hooks, utilities, or services?
- Are there existing patterns the plan should follow instead of inventing new ones?
- Does the plan correctly identify ALL files that need modification? (Check the import chain analysis)

### Architecture & Design
- Do proposed file locations match existing project conventions?
- Are module boundaries appropriate? (Not too many layers, not too few)
- Is the plan over-engineered for what it needs to do?
- Is there a mismatch between what the plan SAYS the code does and what it ACTUALLY does?

### Security & Auth
- Are all new endpoints protected by auth middleware? (Check how existing routes handle this)
- Is user input validated? (SQL injection, XSS, path traversal — check for existing validation patterns like zod schemas)
- Can users access resources they shouldn't? (Cross-tenant, cross-project data access)
- Are there rate limiting or resource exhaustion concerns for expensive operations?

### API & Protocol
- Is the HTTP method correct? (GET for reads, POST for writes/complex queries)
- Will URL length limits be hit with query string parameters?
- Are response headers correct? (Content-Type, Content-Disposition for downloads, Transfer-Encoding for streaming)
- Is error response format consistent with existing API patterns?

### Data & State
- Could this cause data loss, corruption, or inconsistency?
- Are there race conditions or concurrent access issues?
- Is there a migration needed? Is it reversible?
- Are there memory, connection pool, or disk exhaustion risks?
- What happens with no-database fallback? (Check if there's a file-backed mode)

### Dependencies
- Are new dependencies actually needed? (Check the dependency audit)
- Are any claimed dependencies only transitive? (Fragile — could disappear on update)
- Do existing utilities already provide what a new dependency would add?

### Testing
- What tests need to be added or updated?
- Will existing tests break? Which ones specifically?
- Are there test files in the import chain not listed in the plan?
- What's the CI/mocking strategy for new dependencies?

### UX & Frontend
- Are loading states, error feedback, and empty states handled?
- Is the frontend work accurately scoped? (Often underestimated)
- Does a selection/interaction UI need to be built from scratch?

### Implementation Gaps
- What happens on partial failure? (Some items succeed, others fail)
- Is there a cancellation/abort mechanism for long-running operations?
- Are there naming inconsistencies with existing code conventions?
- What validation patterns should be used? (Check existing validators in the codebase)

### Technical Alternatives
Think creatively about alternative approaches. Consider:
- Database-native features (COPY TO STDOUT, cursors, pg_notify vs application-level solutions)
- Built-in Node.js capabilities vs external dependencies
- Existing patterns elsewhere in the codebase that could be reused
- Whether the simplest approach is to do nothing / reuse existing functionality

## Output Format
For each finding:
- State the issue with a specific file/line reference
- Explain why it matters (the concrete failure scenario)
- State what to do instead (specific, not "consider improving")
- Classify as CRITICAL, IMPORTANT, or MINOR

At the end, if the plan needs revision, propose a **concrete alternative plan** with specific steps, files, and line-count estimates.
```

**Reviewer B** (adversarial verification focus)

```
[Same full prompt as Reviewer A, with this addition at the top:]

Your primary job is ADVERSARIAL VERIFICATION. The Codebase Reality Report provides facts — use them aggressively. For every claim the plan makes, check if the reality report confirms or contradicts it. For every file the plan mentions, verify the import chain analysis doesn't reveal missing modifications. For every dependency, check the audit.

Plans fail most often because they misunderstand the existing codebase. Your job is to catch those misunderstandings.

Additionally, push hard on creative alternatives. For each major component of the plan, ask: "Is there a fundamentally simpler way to achieve this?" Think about:
- Can we reuse existing endpoints/utilities instead of building new ones?
- Can we use database-native features instead of application-level code?
- Can we read files from disk instead of querying the database?
- Can we add 10 lines to an existing module instead of creating 5 new files?

[Then the same plan, Codebase Reality Report, checklist, and output format]
```

### 4. Synthesize the feedback

Once both reviewers return, consolidate into:

**Critical Issues** — block implementation. If both reviewers flagged it, note the convergence.

**Strong Recommendations** — meaningfully improve the result.

**Minor Suggestions** — nice-to-haves.

**Alternative Approaches** — if either reviewer proposed a compelling different approach, detail it fully.

**Revised Plan** — if the original plan has critical issues, include a concrete revised plan with:
- Numbered steps
- Specific files to create/modify
- Key implementation details
- What to test

Every finding must include specific evidence (file path, line number, code pattern). Drop any finding that is generic advice without codebase-specific backing.

### 5. Present to the user

Be direct. If the plan needs significant revision, say so and present the revised plan. If it's solid, say that.

End with: "Want me to update the plan based on this feedback?"
