# Plan Review: Add Redis Caching to NL Suggestions

## Critical Issues

### 1. The codebase already has a full caching layer for NL suggestions — Redis would be a redundant second cache (Reviewer A + Reviewer B converged)

Both reviewers independently flagged this as the single most important finding.

The plan assumes NL suggestions are uncached and hit the LLM on every request. This is false. The existing system already has a **complete, multi-tier caching architecture**:

- **`NlSuggestionRepository`** (`backend/src/repositories/nlSuggestionRepository.ts`) provides persistent caching via Postgres (`nl_placeholder_suggestions` table with upsert-on-conflict) or a JSON file fallback. Lookups are keyed on `(projectId, schemaFingerprint, modelId, promptVersion)`.
- **In-memory inflight deduplication** (`backend/src/services/nlSuggestions/index.ts`, line 26: `inflightSuggestionGenerations` Map) prevents duplicate concurrent LLM calls for the same schema.
- **`getSuggestions()`** (line 153) is a pure cache read — it never calls the LLM at all. It only reads from the repository.
- **`regenerateSuggestions()`** (line 183) checks the repository first and returns cached results if the schema fingerprint matches (line 206). The LLM is only called when the schema actually changes.
- **Schema fingerprint stability** — the fingerprint is based on sorted column names and types, not row counts or column order. Tests at lines 241-292 explicitly verify this. The LLM is called only when columns are added, removed, or retyped.
- **Frontend deduplication** — `frontend/src/stores/nlSuggestionStore.ts` has its own inflight request map (line 16) and same-entry equality checks (lines 25-49) to avoid redundant network requests.

**Why this matters:** Adding Redis between the application and the existing Postgres/file cache would create a redundant cache-in-front-of-a-cache. The LLM is already called at most once per unique schema shape per project. The only scenario Redis would help is if Postgres reads are too slow — but these are single-row lookups on a unique index, which complete in <1ms.

**What to do instead:** If there's a measured latency problem, profile the actual bottleneck. The most likely improvement would be adding an in-memory LRU cache (a `Map` with TTL, like `answerService.ts` already does at line 35) to avoid even the Postgres round-trip — no new infrastructure needed.

### 2. Plan references a `docker-compose.yml` that does not exist (Reviewer B)

The plan lists `docker-compose.yml` as a file to modify. This file does not exist anywhere in the repository. The project uses direct `docker run` commands in `scripts/dev/run.mjs` (lines 220-235) to manage the Postgres container. There is no Docker Compose orchestration.

**Why this matters:** This step cannot be executed as written. More importantly, it reveals the plan was written with assumptions about the infrastructure that don't match reality. Adding Docker Compose just for Redis would introduce a new orchestration paradigm that conflicts with the existing approach.

### 3. No `docker-compose.yml` means the cache warmer and pg_notify listener have no runtime environment (Reviewer A)

Steps 4 (`cacheWarmer.ts`) and 7 (`cacheInvalidation.ts` via `pg_notify`) assume Redis is running as a service alongside the app. Without Docker Compose or any service orchestrator, there's no mechanism to ensure Redis is available at startup. The dev orchestrator (`scripts/dev/run.mjs`) would need significant changes, and production deployment is not addressed at all.

### 4. `cacheMiddleware.ts` as Express middleware is architecturally wrong for this use case (Reviewer A + Reviewer B converged)

The plan proposes a generic Express middleware that checks Redis before hitting route handlers. NL suggestions are served from a single endpoint (`GET /query/nl/suggestions` in `backend/src/routes/query.ts`, line 157). A generic cache middleware would:

- Not understand the schema-fingerprint-based invalidation logic that makes the existing cache correct
- Risk serving stale suggestions after schema changes (column type updates, dataset uploads/deletes all trigger `regenerateProjectNlSuggestionsSilently`)
- Add latency to *every* route, not just the one that needs it
- Duplicate the cache-key logic that already exists in `buildInflightKey()` and the repository's composite key

**Why this matters:** The existing invalidation logic is tightly coupled to domain events (upload, delete, column update) — see `backend/src/routes/datasets/nlSuggestions.ts`. A generic HTTP cache layer cannot replicate this without reimplementing the same domain awareness.

## Strong Recommendations

### 5. The cache warmer (step 4) would call the LLM for every project on every server restart (Reviewer B)

`cacheWarmer.ts` is described as "pre-generates suggestions for all projects on startup." This means every server restart triggers N LLM calls (one per project), even though the suggestions are already persisted in Postgres. The existing system is designed to be lazy — suggestions are generated on first request and persisted permanently until the schema changes. A startup warmer inverts this design for no benefit.

**If warming is needed:** The existing `regenerateSuggestions()` already returns cached results instantly when the fingerprint matches. A warmer that calls this function would be a no-op for all projects whose schemas haven't changed. But this also means the warmer adds complexity for zero value — it would just read from Postgres and return.

### 6. Two new npm packages (`redis` + `ioredis`) are redundant with each other (Reviewer A)

The plan lists both `redis` (the official Node.js Redis client) and `ioredis` (a community alternative). These are competing libraries that serve the same purpose. You would use one or the other, never both. This suggests the plan wasn't carefully considered at the dependency level.

### 7. The plan misidentifies files to modify (Reviewer B)

The plan lists `backend/src/routes/datasets.ts` as a file to modify but doesn't explain what change is needed there. The NL suggestion endpoint lives in `backend/src/routes/query.ts` (line 157-177). The datasets router only triggers suggestion regeneration indirectly through `regenerateProjectNlSuggestionsSilently`. If the goal is to add cache invalidation on dataset changes, that's already handled — those code paths call `regenerateNaturalLanguageSuggestions()` which writes through to the repository.

### 8. Per-project TTL overrides (step 9) add Postgres schema changes for a feature that contradicts the existing design (Reviewer A)

The existing cache has no TTL — suggestions are keyed by schema fingerprint and are valid as long as the schema is unchanged. This is a correct design: suggestions don't go stale based on time, only based on schema changes. Adding TTL-based expiration would cause unnecessary LLM calls when suggestions are still perfectly valid, increasing cost and latency for no user benefit.

### 9. `/api/cache/stats` endpoint (step 8) has no auth protection mentioned (Reviewer A)

The plan creates a new metrics endpoint but doesn't mention auth middleware. All other routes in this codebase go through the Express router structure. The existing middleware includes JWT auth (`backend/src/middleware/auth.ts`). Exposing cache hit/miss stats without authentication could leak information about usage patterns.

## Minor Suggestions

### 10. The 5 new files in `backend/src/services/cache/` create a new module boundary that no existing code would import from (Reviewer B)

The plan creates `redisClient.ts`, `cacheMiddleware.ts`, `cacheWarmer.ts`, `cacheInvalidation.ts`, and `cacheStats.ts`. This is a substantial new service module. The existing caching patterns are colocated with the services they cache (query cache in `services/queryCache.ts`, answer cache inline in `services/answerService.ts`, NL suggestion cache in the repository layer). A separate `cache/` module breaks this convention and creates an orphaned abstraction layer.

### 11. `pg_notify` for invalidation (step 7) adds operational complexity for a problem already solved (Reviewer A)

The codebase already invalidates suggestions synchronously when schemas change — `regenerateProjectNlSuggestionsSilently` is called inline after dataset upload, delete, and column type update. Adding a `pg_notify` listener introduces async event-driven invalidation that could race with the synchronous path, potentially causing double-regeneration or stale reads during the notify propagation delay.

## Alternative Approaches

### In-memory LRU cache (if any performance improvement is actually needed)

If profiling shows the Postgres read in `getSuggestions()` is a bottleneck (unlikely for a single-row index lookup), the simplest improvement is an in-memory `Map<string, StoredNlSuggestionSet>` with a size cap, exactly like `answerService.ts` already does. This requires:
- Zero new dependencies
- Zero infrastructure changes
- ~15 lines of code in `nlSuggestions/index.ts`
- No new files

This approach follows the existing codebase patterns and is trivially testable.

### Do nothing

The current system already achieves the plan's stated goal: "Speed up NL suggestion generation by caching LLM responses." The LLM is called once per unique schema shape, and results are persisted in Postgres (or a JSON file). The `getSuggestions()` path never calls the LLM. The frontend deduplicates requests. There may be no problem to solve here.

---

**Bottom line:** This plan introduces significant infrastructure complexity (Redis, Docker Compose, 5 new files, 2 new dependencies, a new Postgres migration) to solve a problem that the codebase has already solved. The existing caching — Postgres/file-backed persistence keyed by schema fingerprint, with in-memory inflight dedup and domain-event-driven invalidation — is well-designed and comprehensive. The plan should be substantially revised or abandoned in favor of profiling to identify whether a real performance bottleneck exists.

Want me to update the plan based on this feedback?
