# Plan Review: Add Redis Caching to NL Suggestions

## Executive Summary

This plan introduces Redis as a caching layer for NL suggestion generation. After examining the actual codebase, the plan is **substantially overengineered**: it proposes a complex new infrastructure dependency (Redis) to solve a problem that the codebase has already solved with its existing dual-backend persistence layer. Most of the proposed components are either redundant with existing code, architecturally inappropriate, or introduce significant operational risk for minimal gain.

---

## Critical Issues

### 1. Redis is redundant -- caching already exists and works

The plan's stated goal is to "speed up NL suggestion generation by caching LLM responses." But this is already implemented. The service at `backend/src/services/nlSuggestions/index.ts` (lines 153-181, `getSuggestions`) performs an exact-match lookup against a persisted cache before ever reaching the LLM. The cache is backed by `NlSuggestionRepository` (`backend/src/repositories/nlSuggestionRepository.ts`), which has two concrete implementations:

- **`FileNlSuggestionRepository`** (lines 27-99): JSON file-backed cache at the path configured via `env.nlSuggestionCachePath` (`backend/src/config.ts`, line 70).
- **`PgNlSuggestionRepository`** (lines 101-169): Postgres-backed cache using the `nl_placeholder_suggestions` table (migration `backend/migrations/011_nl_placeholder_suggestions.sql`), with a composite unique index on `(project_id, schema_fingerprint, model_id, prompt_version)`.

The cache key is a SHA-256 schema fingerprint (`backend/src/services/nlSuggestions/schemaBuilder.ts`, lines 40-53) combined with model ID and prompt version. Cache invalidation happens naturally: when the schema changes (column added/removed/renamed), the fingerprint changes, and the next `regenerateSuggestions` call generates fresh suggestions while stale entries are never served.

Adding Redis as a third caching backend atop these two creates triple redundancy with no clear performance justification.

### 2. The actual bottleneck is LLM generation, not cache reads

When `getSuggestions` (`index.ts`, lines 153-181) finds a cache hit, it returns a synchronous Postgres lookup or a file read -- both of which complete in single-digit milliseconds. The latency users experience comes entirely from `requestSuggestions` (`index.ts`, lines 97-141), which calls the LLM with retries.

Redis would not accelerate the LLM call. It would only marginally speed up the cache-hit path, where Postgres indexed lookups are already fast. The plan does not include any profiling data or latency measurements to justify adding Redis.

### 3. Introducing `ioredis` AND `redis` is incorrect

Step 1 proposes adding both the `redis` (node-redis) and `ioredis` npm packages. These are two competing Redis clients that serve the same purpose. A real implementation would use one or the other, never both. This suggests the plan was not written with awareness of the npm ecosystem. Using `ioredis` alone would be the conventional choice for a TypeScript project.

### 4. No docker-compose.yml exists to modify

Step 6 says "Add Redis to docker-compose.yml." There is no `docker-compose.yml` in this repository. The dev orchestrator at `scripts/dev/run.mjs` (lines 181-236) manages a Postgres Docker container directly via `docker run` commands, not via Compose. Adding Redis would require either:

- Extending `run.mjs` with a second container management block (significant scripting work the plan does not account for), or
- Introducing docker-compose for the first time (a larger infrastructure change affecting every developer's workflow).

The plan treats this as a simple file edit when it is a workflow migration.

### 5. `cacheMiddleware.ts` -- Express middleware is the wrong abstraction

Step 3 proposes Express middleware that "checks Redis before hitting route handlers." NL suggestions are served from a single endpoint: `GET /query/nl/suggestions` (`backend/src/routes/query.ts`, lines 157-178). A generic cache middleware would either:

- Be tightly coupled to this one endpoint (making "middleware" a misnomer), or
- Be generic enough to cache arbitrary routes, which is dangerous: it would need to understand which routes are safe to cache, handle cache-control headers, deal with authenticated vs. unauthenticated responses, and avoid caching error responses.

The existing architecture correctly places caching inside the service layer (`nlSuggestions/index.ts`), not in HTTP middleware. The plan inverts this responsibility without justification.

### 6. `cacheWarmer.ts` -- pre-generating suggestions for all projects at startup is harmful

Step 4 proposes a "background job that pre-generates suggestions for all projects on startup." This would:

- **Fire LLM calls for every project on every server restart.** With N projects, that is N LLM API calls at startup, each costing time and money. The `requestSuggestions` function uses model `gpt-5.4-mini` (per `config.ts`, line 16) with up to 3 attempts per call (`MAX_SUGGESTION_RETRIES = 2`, `index.ts`, line 23).
- **Delay server availability.** If run synchronously, startup blocks. If run asynchronously, users may hit the server before warming completes, getting inconsistent behavior.
- **Regenerate suggestions that are already cached.** The existing `regenerateSuggestions` function (`index.ts`, lines 183-267) already checks the cache before calling the LLM (lines 198-212). Pre-warming adds no value for projects whose schemas have not changed.
- **Have no way to know which projects exist** without querying the project store. The plan does not mention the project repository at all.

The existing architecture handles this correctly: suggestions are generated lazily on first request via `regenerateSuggestions`, with in-flight deduplication (`inflightSuggestionGenerations` Map, `index.ts`, line 26).

### 7. `pg_notify` cache invalidation is unnecessary and unimplemented infrastructure

Step 7 proposes listening for schema changes via `pg_notify`. The codebase currently has zero usage of Postgres LISTEN/NOTIFY. Implementing this would require:

- Adding NOTIFY triggers to the `datasets` table (new migration).
- A persistent listener connection in the Node.js process (separate from the connection pool in `backend/src/db.ts`).
- Reconnection/error handling for the listener.
- Cross-process coordination if the backend runs multiple instances.

All of this to solve a problem the schema fingerprint already solves: when the schema changes, the fingerprint changes, and the old cache entry is never matched. The existing invalidation-by-fingerprint approach (`schemaBuilder.ts`, `buildSchemaFingerprint`) is simpler, correct, and requires zero additional infrastructure.

Additionally, schema changes already trigger regeneration. When a dataset is uploaded, `regenerateProjectNlSuggestionsSilently` is called (`backend/src/routes/datasets/nlSuggestions.ts`, line 13; called from `uploadHandler.ts` and `columnHandler.ts`). When a dataset is deleted, the same function is called (`datasets.ts`, line 234). The plan does not acknowledge this existing trigger mechanism.

---

## Moderate Issues

### 8. Files-to-modify list is incomplete

The plan lists only three files to modify:
- `backend/src/services/nlSuggestions/index.ts`
- `docker-compose.yml` (does not exist)
- `backend/src/routes/datasets.ts`

But a Redis integration would actually require changes to at minimum:
- `backend/src/config.ts` (new Redis connection env vars)
- `backend/src/routes/query.ts` (the route that serves suggestions, lines 157-178)
- `backend/src/repositories/nlSuggestionRepository.ts` (if replacing the persistence layer)
- `backend/package.json` (new dependency)
- `scripts/dev/run.mjs` (Docker container management)
- `backend/.env.example` (new environment variables)
- Test files: `backend/src/services/nlSuggestions.test.ts`, `backend/src/routes/query.test.ts`, `backend/src/routes/datasets.test.ts`

The plan does not mention `backend/src/routes/query.ts`, which is where `GET /query/nl/suggestions` is actually defined. The plan also omits `backend/src/repositories/nlSuggestionRepository.ts`, which is the entire existing persistence layer for suggestions.

### 9. Per-project TTL overrides stored in Postgres (Step 9) add needless complexity

Step 9 proposes "TTL configuration with per-project overrides stored in Postgres." NL suggestions do not currently use TTL-based expiration at all. They use content-addressed caching via the schema fingerprint -- a fundamentally different and arguably better model. A suggestion set is valid as long as the schema has not changed, regardless of time elapsed.

Adding per-project TTLs would:
- Require a new Postgres table or column.
- Require admin UI to configure overrides.
- Create confusing behavior where valid cached suggestions expire for no reason.
- Conflict with the schema-fingerprint model.

### 10. Cache stats endpoint (Step 8) exposes internal metrics without authentication

The plan proposes a `/api/cache/stats` endpoint. The existing route structure uses JWT auth middleware (`backend/src/middleware/`). The plan does not mention authentication for this endpoint, creating a potential information disclosure issue (cache hit rates, project counts, etc.).

### 11. No testing strategy

The plan creates five new files but mentions no test files. The existing codebase has strong test coverage for the NL suggestions service (`backend/src/services/nlSuggestions.test.ts`, 8 test cases covering caching, retries, deduplication, schema changes). Any change to this system should include corresponding test updates. The plan does not mention updating existing tests or adding new ones for Redis-specific behavior (connection failures, serialization, TTL expiration, cache warming).

### 12. No graceful degradation plan for Redis unavailability

If Redis is introduced as a dependency, the server must handle Redis being down. The existing system degrades gracefully: if Postgres is unavailable, the `createNlSuggestionRepository` factory (`nlSuggestionRepository.ts`, line 193-199) falls back to the file-backed store. The plan does not describe equivalent fallback behavior for Redis.

---

## Missed Considerations

### 13. In-flight deduplication already prevents redundant LLM calls

The `inflightSuggestionGenerations` Map (`index.ts`, line 26) ensures that concurrent requests for the same project/schema/model combination share a single LLM call. This is tested (`nlSuggestions.test.ts`, lines 325-357, "shares one model call across concurrent identical regenerations"). Redis-based deduplication would need distributed locking (e.g., Redlock), which is significantly more complex and error-prone.

### 14. The frontend already deduplicates fetches

The frontend Zustand store (`frontend/src/stores/nlSuggestionStore.ts`, lines 65-68) maintains its own `inflightRequests` Map to prevent duplicate concurrent API calls. Combined with the backend in-flight deduplication, adding a Redis layer between them provides negligible benefit.

### 15. Serialization overhead could negate Redis benefit

Each `NlSuggestion` object contains multiple string fields (`id`, `prompt`, `label`, `category`, `rationale`) plus a string array (`tables`). A set of 8-12 suggestions serialized to JSON is roughly 2-4KB. Serializing to Redis and deserializing on read adds overhead that may exceed the time saved versus a Postgres indexed lookup on `(project_id, schema_fingerprint, model_id, prompt_version)`.

---

## Recommended Alternative Approach

Rather than adding Redis, address the actual user-facing performance concerns:

1. **Measure first.** Add timing logs to the `GET /query/nl/suggestions` handler (`backend/src/routes/query.ts`, lines 157-178) to determine actual cache-hit vs. cache-miss latency. If cache hits are already fast (likely <10ms for Postgres), no caching change is needed.

2. **If generation latency is the problem, optimize the LLM call.** The `requestSuggestions` function (`index.ts`, lines 97-141) uses `maxOutputTokens: 1400` and `reasoningEffort: 'low'`. Consider reducing the number of suggestions generated (currently `MAX_SUGGESTION_COUNT = 12`) or using a faster model.

3. **If cold-start latency matters, use the existing architecture.** The `regenerateProjectNlSuggestionsSilently` function already pre-populates the cache on dataset upload and delete. Extend this to cover column-type changes (which `columnHandler.ts` already does), ensuring users rarely encounter a cache miss.

4. **If multi-instance cache sharing is needed, Postgres already provides it.** The `PgNlSuggestionRepository` is shared across all backend instances via the database. Redis would only be advantageous if Postgres read latency is measured to be a bottleneck, which is unlikely for a single-row indexed lookup.

---

## Summary of Verdict

| Plan Step | Assessment |
|---|---|
| 1. Add `redis` + `ioredis` | Redundant packages; only one needed; neither justified |
| 2. `redisClient.ts` singleton | Adds infrastructure dependency for no measured benefit |
| 3. `cacheMiddleware.ts` | Wrong abstraction; caching belongs in service layer where it already exists |
| 4. `cacheWarmer.ts` | Harmful: fires N LLM calls at startup, delays availability, wastes API budget |
| 5. Modify `nlSuggestions/index.ts` | Duplicates existing `NlSuggestionRepository` caching logic |
| 6. Add Redis to docker-compose | docker-compose.yml does not exist; requires workflow migration |
| 7. `cacheInvalidation.ts` via pg_notify | Unnecessary; schema fingerprinting already handles invalidation |
| 8. `/api/cache/stats` endpoint | Low-priority; no auth plan; not related to core performance goal |
| 9. Per-project TTL overrides | Conflicts with content-addressed caching model; adds admin complexity |

The plan should be rejected in its current form. The codebase already has a well-designed, tested caching system for NL suggestions. Effort would be better spent measuring actual latency bottlenecks and optimizing the LLM call path.
