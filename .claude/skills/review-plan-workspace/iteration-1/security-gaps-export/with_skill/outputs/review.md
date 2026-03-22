# Plan Review: Bulk Dataset Export API

## Plan Summary

Add a `GET /api/projects/:projectId/export?datasets=id1,id2,id3` endpoint that queries multiple datasets from Postgres, converts each to CSV, bundles them into a ZIP via `archiver`, streams the response, and adds a frontend button in `DataViewerTab.tsx` to trigger the download.

---

## Reviewer 1 — Architecture & Design

### 1. Architecture Concerns

**The route is on the wrong router.** The plan places the export endpoint under `/api/projects/:projectId/export`, but the existing dataset routes live on `createDatasetUploadRouter` (mounted directly on the API router without a `/projects` prefix — see `app.ts` line 54). Project routes are registered separately via `registerProjectRoutes`. Adding a project-scoped export endpoint to the dataset router creates a routing inconsistency. It either needs to go on the project router or be mounted as `/api/datasets/export?projectId=...&datasets=...` to match existing conventions (e.g., `GET /api/datasets?projectId=...`).

**`SELECT * FROM {tableName}` bypasses the existing SQL execution layer.** The codebase has a carefully built `executeReadOnlyQuery` in `backend/src/services/sqlExecutor.ts` that wraps queries in transactions, sets `statement_timeout`, enforces read-only validation via `sqlValidator.ts`, and limits row counts (`sqlMaxRows` = 1000, `sqlDefaultLimit` = 200). The plan proposes running raw `SELECT * FROM {tableName}` directly against the pool. This bypasses all of those safeguards — no timeout, no row limit, no read-only enforcement wrapper.

**No streaming backpressure from Postgres.** The plan says "stream to response" but `SELECT *` with `pool.query()` loads the entire result set into memory before piping into `archiver`. For a dataset with millions of rows, this will OOM the Node.js process. True streaming requires using a Postgres cursor (`DECLARE ... FETCH`) or `pg-query-stream`.

### 2. Design Alternatives

- **Use the existing single-dataset download endpoint as a building block.** There is already `GET /api/datasets/:datasetId/download` (datasets.ts lines 82-113) that serves the original uploaded file from disk. The plan ignores this entirely. A simpler approach: for each requested dataset ID, read the original file from `{datasetStorageDir}/{datasetId}/{filename}` and pipe it directly into the ZIP archive. No Postgres query needed at all — the files are already stored on disk in their original format. This is simpler, faster, and avoids the CSV conversion problem entirely.
- **If CSV conversion from Postgres is truly required** (e.g., the data has been transformed since upload), use `COPY ... TO STDOUT WITH CSV HEADER` via Postgres — this is orders of magnitude more efficient than querying rows into JSON objects and then converting back to CSV with `json2csv`.

### 3. Complexity Check

- **Over-engineered:** The plan adds a `json2csv` dependency to convert Postgres JSON rows to CSV. This is wasteful when the original CSV/JSON/XLSX files already exist on disk.
- **Under-engineered:** No mention of authorization. The dataset router has zero auth middleware applied (see `app.ts` line 54 — `router.use(createDatasetUploadRouter(datasetRepository))` has no `requireAuth` guard). The plan inherits this gap but does not acknowledge it. An export endpoint that streams potentially large amounts of data is a higher-risk target than individual record reads.

### 4. Existing Code Leverage

- **`datasetRepository.getById()`** can look up each dataset, exactly as the existing download handler does.
- **The file-on-disk pattern** (`join(env.datasetStorageDir, datasetId, filename)` + `existsSync` + `readFileSync`) is already established in the download handler and should be reused.
- **`sanitizeTableName()`** already exists for resolving table names from metadata — the plan should use this rather than assuming table names are directly available.

---

## Reviewer 2 — Bugs, Risks & Edge Cases

### 1. Likely Bugs

**SQL injection via table name.** The plan says "run `SELECT * FROM {tableName}`" — if `tableName` is interpolated as a string, this is a textbook SQL injection vector. Even though table names come from the dataset repository (not user input directly), the `metadata.tableName` field is a `Record<string, unknown>` with no type narrowing. A corrupted or malicious metadata entry could inject arbitrary SQL. The existing codebase uses `"${tableName}"` with double quotes (see datasets.ts line 225: `await pool.query(\`DROP TABLE IF EXISTS "${tableName}"\`)`), but even that is insufficient without proper identifier escaping (`pg` format identifiers or a parameterized approach).

**No validation on the `datasets` query parameter.** The plan parses `datasets=id1,id2,id3` from the query string but specifies no validation:
- What if the parameter is missing? Empty string split produces `['']`.
- What if IDs contain malicious content (commas in UUIDs, excessively long strings)?
- What if 100 dataset IDs are passed, causing 100 concurrent Postgres queries?
- There is no check that the datasets actually belong to the specified `projectId`, enabling cross-project data exfiltration.

**Memory exhaustion on large datasets.** `SELECT *` against a table with millions of rows will buffer the entire result set in memory. With `env.sqlMaxRows` = 1000, the existing executor caps this, but the plan bypasses the executor entirely. A 50-column, 10-million-row dataset could easily exceed available Node.js heap.

### 2. Security & Safety

**Cross-project data access (CRITICAL).** The plan takes `projectId` as a URL parameter and `datasets` as a query parameter but never verifies that each requested dataset actually belongs to that project. An attacker who knows dataset IDs from another project can request them under any projectId. The `datasetRepository.getById()` method does not filter by project — it returns any dataset matching the ID regardless of ownership (see `datasetRepository.ts` lines 211-253).

**No authentication on the endpoint.** The dataset routes have no `requireAuth` middleware (confirmed in `app.ts` line 54). This export endpoint would be completely unauthenticated, allowing anyone who can reach the API to bulk-export datasets.

**Denial of Service via unbounded export.** Without limits on the number of datasets or total export size, an attacker could request all datasets in a project (or all datasets if cross-project access is possible), generating enormous ZIP files that exhaust disk I/O, memory, and CPU.

**Sensitive data exposure.** Exporting entire tables means all columns are included, potentially exposing PII or sensitive data that was present in the original dataset but not shown in the UI's limited sample/preview views.

### 3. Edge Cases

- **Dataset exists in metadata but file is missing on disk** (already handled in the single download handler with an `existsSync` check, but not mentioned in the plan).
- **Dataset exists in metadata but Postgres table was dropped** (migration failure, manual deletion).
- **Mixed file types** — some datasets are CSV, some JSON, some XLSX. The plan says "convert each result to CSV" but does not handle that the original data might have been XLSX with multiple sheets.
- **Empty datasets** (0 rows) — should they produce an empty CSV in the ZIP or be skipped?
- **Concurrent exports** — what happens if multiple users trigger large exports simultaneously?
- **Dataset IDs that are duplicated in the query string** — should deduplicate.

### 4. Test Gaps

- The existing test suite (`datasets.test.ts`) has no tests for the download endpoint (`GET /datasets/:datasetId/download`), so there is zero test coverage for the pattern the export endpoint would extend.
- No tests mentioned in the plan for: invalid dataset IDs, cross-project access attempts, empty dataset lists, extremely large exports, malformed query parameters.

### 5. Side Effects

- Adding `archiver` and `json2csv` as new dependencies increases the backend bundle size and attack surface.
- Long-running export requests could exhaust the connection pool if not properly managed (the pool max is 10, per `env.pgPoolMax`).
- Streaming a large ZIP while holding Postgres connections open for the duration of the transfer could starve other API requests of database connections.

---

## Reviewer 3 — Completeness & Alternatives

### 1. Missing Requirements

- **No progress indication.** Exporting multiple large datasets could take significant time. The plan has no mechanism for progress feedback — no SSE stream, no polling endpoint, no WebSocket notification. The user clicks a button and waits with no idea if the export is working.
- **No cancellation support.** If a user starts a large export and navigates away or changes their mind, there is no abort mechanism. The server continues generating the ZIP for no one.
- **No export format options.** The plan hardcodes CSV. Users might want to export in the original format (preserving XLSX structure), or in Parquet/JSON. At minimum, supporting "original format" (just zipping the existing files) is simpler and more useful.
- **No file naming strategy for collisions.** If two datasets have the same filename (e.g., both called `data.csv`), the ZIP will have conflicting entries. The plan does not address deduplication of filenames within the archive.

### 2. Simpler Alternatives

- **ZIP the original files from disk.** The original uploaded files already exist at `{datasetStorageDir}/{datasetId}/{filename}`. The entire Postgres query + json2csv pipeline can be replaced by reading files from disk and piping them into `archiver`. This is dramatically simpler, requires no new dependencies (archiver is the only one needed), avoids all SQL injection risks, avoids all memory issues from large queries, and preserves the original file format. The implementation is roughly 30 lines of code.
- **Individual download links.** Instead of a bulk ZIP endpoint, the frontend could simply trigger multiple `GET /api/datasets/:id/download` calls and let the browser handle them. Less elegant but zero backend work.

### 3. Bigger Picture

- **Export audit logging.** For a data platform, knowing who exported what and when is important for compliance. The plan has no logging of export actions.
- **Rate limiting on exports.** Exports are expensive operations. Without rate limiting, a single user could saturate the server.
- **Consider a job-based approach for large exports.** Instead of streaming synchronously, large exports could be queued as background jobs: create the ZIP asynchronously, store it temporarily, and notify the user when ready. This is more robust for large datasets and avoids holding HTTP connections open for minutes.

### 4. UX & User Impact

- **No selection UI specified.** The plan says "add a frontend button in DataViewerTab that collects selected dataset IDs" but DataViewerTab currently has no multi-select mechanism for datasets. The tab bar (`FileTabBar`) shows individual file tabs. There is no checkbox or selection UI. This is a non-trivial frontend addition that the plan treats as a one-liner.
- **No loading state.** What does the user see while the ZIP is being generated? The existing `isExecuting` state in DataViewerTab is tied to query execution, not file downloads.
- **No error feedback.** If one dataset fails to export (missing file, Postgres error), does the entire export fail? Does the user get a partial ZIP? The plan is silent on error handling UX.
- **Download triggering.** Browser-based file downloads from API calls require specific handling (creating a blob URL, triggering an anchor click). The plan does not mention this implementation detail, but it is not trivial with authenticated API calls.

### 5. Hidden Dependencies

- **`archiver` is not in `package.json`.** The plan uses `archiver` for ZIP creation, but it is not currently a dependency. It needs to be added (along with `@types/archiver` for TypeScript).
- **`json2csv` is not in `package.json`.** Same issue. This is an additional dependency that needs to be added.
- **No migration needed** — this is purely a new API endpoint, no schema changes required. That is a positive.
- **Frontend API client.** There is no existing `export` or `download` function in `frontend/src/lib/api/`. A new typed API wrapper would need to be created, handling the binary response correctly (blob download, not JSON parsing).

---

## Synthesized Review

### Critical Issues (must address before implementing)

1. **Cross-project data exfiltration (Reviewers 1, 2).** The plan does not verify that requested dataset IDs belong to the specified `projectId`. Since `datasetRepository.getById()` returns any dataset regardless of project ownership, an attacker can export datasets from any project by guessing or enumerating dataset UUIDs. **Fix:** After fetching each dataset, verify `dataset.projectId === projectId`. Return 403 or 404 for mismatches.

2. **No authentication (Reviewers 1, 2).** The entire dataset router has no auth middleware. This export endpoint would allow unauthenticated bulk data extraction. **Fix:** Apply `requireAuth` middleware to this endpoint at minimum, or to the entire dataset router.

3. **SQL injection risk via table name interpolation (Reviewer 2).** Constructing `SELECT * FROM {tableName}` with string interpolation is dangerous. **Fix:** Use proper identifier escaping (`pg` format with `%I` or double-quote escaping) — or better yet, avoid the query entirely by reading files from disk (see recommendation 1 below).

4. **Memory exhaustion / no row limits (Reviewers 1, 2).** `SELECT *` with no LIMIT against large tables will OOM the Node process. The plan bypasses the existing `sqlExecutor` safeguards (statement timeout, row limit). **Fix:** If Postgres queries are used, enforce limits or use cursor-based streaming. Strongly prefer the disk-based approach instead.

### Strong Recommendations (not blockers, but significantly improve the result)

5. **Read original files from disk instead of querying Postgres (Reviewers 1, 3 — convergent).** Both the Architecture and Completeness reviewers independently concluded that the simplest, safest, and most performant approach is to ZIP the original uploaded files from `{datasetStorageDir}/{datasetId}/{filename}`. This eliminates SQL injection, memory issues, the need for `json2csv`, and format conversion bugs. The existing download handler already demonstrates this pattern. This is the single most impactful change to the plan.

6. **Handle filename collisions in the ZIP (Reviewer 3).** Multiple datasets may have the same filename. Prefix each file with the dataset ID or a counter to ensure uniqueness within the archive.

7. **Validate and limit the `datasets` query parameter (Reviewer 2).** Enforce a maximum number of dataset IDs (e.g., 20), validate that each is a valid UUID format, and deduplicate. Return 400 for invalid input.

8. **Add the multi-select UI to the frontend (Reviewer 3).** DataViewerTab has no dataset selection mechanism. This requires either checkboxes in the FileTabBar, a separate export dialog, or a dedicated export view. This is more work than the plan acknowledges.

9. **Connection pool starvation (Reviewer 2).** If the Postgres query approach is kept, long-running exports holding connections will starve other API requests. The pool has only 10 connections max. Use a separate pool or read from disk.

### Minor Suggestions (nice-to-haves)

10. **Add export audit logging (Reviewer 3).** Log who exported which datasets and when, for compliance.

11. **Support cancellation via `AbortSignal` (Reviewer 3).** Wire up `req.on('close')` to abort ongoing work when the client disconnects.

12. **Consider a background job approach for very large exports (Reviewer 3).** For datasets exceeding a size threshold, generate the ZIP asynchronously and notify the user.

13. **Deduplicate dataset IDs in the query string (Reviewer 2).** Minor, but prevents duplicate files in the archive.

14. **Return a 404 or 400 (not 500) when no valid datasets are found (Reviewer 2).** Graceful error response if all requested IDs are invalid or missing.

### Alternative Approaches

**Disk-based ZIP export (recommended by Reviewers 1 and 3):** Instead of querying Postgres, read the original uploaded files from `{datasetStorageDir}/{datasetId}/{filename}` and pipe them directly into `archiver`. This approach:
- Requires only 1 new dependency (`archiver`) instead of 2
- Eliminates all SQL injection vectors
- Eliminates memory pressure from large query result sets
- Preserves original file formats (CSV stays CSV, XLSX stays XLSX)
- Is approximately 30 lines of handler code
- Reuses the exact same file-lookup pattern already proven in the `GET /datasets/:datasetId/download` handler

The only reason to prefer the Postgres-based approach is if the export needs to reflect post-upload transformations (e.g., type coercion, preprocessing). If that is a requirement, it should be stated explicitly in the plan, and the implementation should use `COPY ... TO STDOUT WITH CSV HEADER` instead of `SELECT *` + `json2csv`.

---

**Overall assessment:** The plan has a sound goal but its proposed implementation has critical security gaps (no auth, cross-project access, SQL injection) and significant architectural mismatches with the existing codebase (bypasses SQL executor, ignores existing file-on-disk pattern). The plan needs substantial revision before implementation. The disk-based ZIP approach is strongly recommended as a replacement for the Postgres query pipeline.

Want me to update the plan based on this feedback?
