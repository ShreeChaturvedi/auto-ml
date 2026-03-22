# Plan Review: Bulk Dataset Export API

## Summary

The plan proposes a new endpoint to export multiple datasets as a ZIP file. After reviewing the existing codebase, I identify several critical security gaps, architectural mismatches, and missing considerations that would need to be addressed before implementation.

---

## 1. Critical Security Issues

### 1.1 SQL Injection via Dynamic Table Name in `SELECT *`

**Severity: Critical**

The plan says: "For each dataset, run `SELECT * FROM {tableName}` to get all rows." This is a textbook SQL injection vector. The `tableName` is derived from user-uploaded filenames via `sanitizeTableName()` (in `/home/shree/Documents/CSE449/repo/backend/src/services/dataLoading/schemaInference.ts`), which strips non-alphanumeric characters but still produces a dynamic string interpolated into SQL.

The existing codebase already has a `quoteIdentifier()` function (in `backend/src/services/nlToSql/identifiers.ts`) specifically for this purpose, and the `datasetRows.ts` service uses it properly:
```
SELECT * FROM ${quoteIdentifier(tableName)} ORDER BY ctid OFFSET $1 LIMIT $2
```

**Recommendation:** The plan must mandate the use of `quoteIdentifier()` for all dynamic table name references. Better yet, the handler should reuse the existing `getDatasetRowsPage()` service rather than constructing raw SQL.

### 1.2 No Authentication or Authorization

**Severity: Critical**

The dataset routes in `backend/src/routes/datasets.ts` have **no authentication middleware applied**. Looking at `backend/src/app.ts`, the dataset upload router is mounted directly on the API router with no `requireAuth` middleware. The only routes currently using `requireAuth` are auth-internal routes and the realtime session route.

However, the proposed endpoint takes a `projectId` as a path parameter, which implies project-scoped access. There is **no authorization check** verifying the requesting user owns or has access to the specified project, nor that the requested dataset IDs belong to that project.

**Risks:**
- Any unauthenticated user could enumerate and export all datasets from any project.
- A user could supply dataset IDs from a different project than the one in the URL, exfiltrating data they should not have access to.

**Recommendation:** At minimum, verify each requested dataset's `projectId` matches the URL's `:projectId`. If/when authentication is enforced, add `requireAuth` middleware and validate the user has access to the project.

### 1.3 No Input Validation on Dataset IDs

**Severity: High**

The plan passes dataset IDs as a comma-separated query string (`?datasets=id1,id2,id3`) with no validation. This opens several risks:

- **No format validation:** Dataset IDs are UUIDs (generated via `randomUUID()` in the repository). The plan does not validate the format of each ID, meaning malformed or malicious strings get passed to the repository layer.
- **No limit on count:** A request with thousands of IDs could cause a denial-of-service by triggering thousands of sequential database lookups and full-table exports.
- **No deduplication:** Duplicate IDs in the query string would cause the same dataset to be exported multiple times, wasting resources.

**Recommendation:** Use `zod` for input validation (consistent with the existing `rowHandler.ts` pattern). Validate each ID is a UUID, enforce a maximum count (e.g., 20), and deduplicate.

### 1.4 Unbounded `SELECT *` Without Row Limits

**Severity: High**

The plan calls for `SELECT * FROM {tableName}` with no `LIMIT`, no pagination, and no `statement_timeout`. The existing codebase enforces strict guardrails:
- `sqlExecutor.ts` sets `SET LOCAL statement_timeout = 5000` (5 seconds) and caps results at `env.sqlMaxRows` (default 1000).
- `datasetRows.ts` paginates with `OFFSET`/`LIMIT` (max 1000 rows per page).

Exporting "all rows" of multiple large datasets simultaneously would:
- Hold database connections for an extended period, potentially exhausting the pool (max 10 connections by default).
- Consume unbounded server memory if rows are buffered before CSV conversion.
- Risk Postgres statement timeouts killing the queries.

**Recommendation:** Stream rows using a cursor (`DECLARE CURSOR ... FETCH 1000`) rather than loading entire tables into memory. Apply a per-dataset row limit or total export size cap. Use a dedicated connection with an extended `statement_timeout` rather than the default 5-second limit.

---

## 2. Architectural Issues

### 2.1 Route Structure Mismatch

The proposed route is `GET /api/projects/:projectId/export?datasets=id1,id2,id3`, but the existing dataset routes are all mounted under `/api/datasets/...` (not nested under `/api/projects/:projectId/`). The dataset upload router in `datasets.ts` does not receive a `:projectId` param -- it uses `req.query.projectId` for filtering on the list endpoint.

**Impact:** Adding a `/projects/:projectId/export` route would either require:
- A new router mounted separately in `app.ts`, or
- Restructuring the existing dataset router (breaking change).

**Recommendation:** Either follow the existing convention (`GET /api/datasets/export?projectId=...&datasets=id1,id2,id3`) or create a dedicated `exportHandler.ts` in the `datasets/` directory and mount it appropriately. The plan's suggestion of `datasets/exportHandler.ts` is reasonable but the route path needs to match the existing structure.

### 2.2 Missing Dependency: `json2csv` Is Not Installed in Backend

The plan references `json2csv` for CSV conversion. Searching `package.json` for the backend, this library is **not listed as a dependency**. The `json2csv` match in the lockfile is from the `frontend/` workspace only. The backend already has `csv-parse` (for reading CSVs) but nothing for writing them.

**Recommendation:** Either add `json2csv` (or the newer `@json2csv/plainjs`) to backend dependencies, or implement CSV serialization manually (it is straightforward for flat tabular data -- just quote fields and join with commas). Alternatively, use the existing `exceljs` dependency which can write CSV.

### 2.3 `archiver` Is Available but Not a Direct Dependency

The backend lockfile shows `archiver` as a transitive dependency (pulled in by `exceljs`). It is **not listed in `backend/package.json` dependencies**. Relying on transitive dependencies is fragile -- an update to `exceljs` could remove it.

**Recommendation:** Explicitly add `archiver` to `backend/package.json` if it will be used. Alternatively, `jszip` is also available transitively -- same fragility concern applies.

### 2.4 Existing Single-File Download Already Exists

The plan does not acknowledge that a single-dataset download endpoint already exists at `GET /api/datasets/:datasetId/download` (lines 81-113 of `datasets.ts`). This endpoint serves the **original uploaded file** from disk, not a Postgres export. This is an important distinction:

- The original file preserves the upload format (CSV, JSON, XLSX).
- The proposed export re-queries Postgres and converts to CSV, which means data may differ from the original (e.g., type coercions during Postgres load, column reordering).

**Recommendation:** Clarify whether the ZIP should contain the original uploaded files (simpler, already stored on disk) or Postgres-exported CSVs (more work, potential data drift). If originals suffice, the handler can simply bundle the files from `env.datasetStorageDir` without touching Postgres at all.

---

## 3. Missing Considerations

### 3.1 Error Handling for Partial Failures

The plan does not address what happens when some datasets exist but others do not (e.g., deleted between request and processing). Options:
- Fail the entire request (strict).
- Skip missing datasets and include a manifest of what succeeded/failed.
- Return a 207 Multi-Status.

**Recommendation:** Return the ZIP with available datasets and include an `errors.json` manifest file listing any datasets that could not be exported, along with a response header or status indicating partial success.

### 3.2 File-Backed Repository Fallback

The `createDatasetRepository()` function (line 407-417 of `datasetRepository.ts`) can return either a `PgDatasetRepository` or a `FileDatasetRepository` depending on whether Postgres is configured. If the file-backed repository is active, there are no Postgres tables to `SELECT * FROM`. The plan assumes Postgres is always available.

**Recommendation:** The export handler must check `hasDatabaseConfiguration()` and fall back to serving original files from disk when Postgres is not available, similar to how `getDatasetRowsPage()` handles this in `datasetRows.ts`.

### 3.3 Streaming and Memory Pressure

The plan says "should handle large datasets efficiently via streaming" but the steps describe a sequential process: query all rows, convert to CSV, then bundle into ZIP. True streaming requires:
1. Piping the `archiver` stream directly to `res`.
2. For each dataset, streaming rows from Postgres via a cursor and piping through a CSV transform stream into the archiver.
3. Finalizing the archive after all entries are appended.

Without explicit streaming architecture, the implementation will likely buffer entire datasets in memory. For a dataset with 1M rows, this could easily consume hundreds of megabytes per concurrent request.

**Recommendation:** Use `archiver` in streaming mode with `res` as the output. For each dataset, use `pg-cursor` or `COPY ... TO STDOUT CSV` (Postgres native CSV export, which is extremely fast and memory-efficient) piped as an archiver entry.

### 3.4 No Rate Limiting or Concurrency Control

Export is an expensive operation (full table scans, CSV conversion, ZIP compression). Without rate limiting, a user or automated script could trigger many concurrent exports and exhaust database connections and server resources.

**Recommendation:** Add a concurrency limit (e.g., max 2-3 concurrent exports) or queue exports. At minimum, document that this endpoint is resource-intensive.

### 3.5 Frontend: No Selection UI Exists

The plan says "Add a frontend button in DataViewerTab that collects selected dataset IDs." However, reviewing `DataViewerTab.tsx`, there is no multi-select mechanism for datasets. The component shows one active file at a time via `FileTabBar`. There is no checkbox or selection state for multiple datasets.

**Recommendation:** The frontend work is more involved than "add a button." It requires:
- A selection model (checkboxes in the file tab bar or a separate export dialog).
- State management for selected dataset IDs.
- A download trigger that constructs the URL and initiates the browser download.
- Loading/progress indication since ZIP generation may take time.

### 3.6 Response Headers and Browser Download

The plan does not specify response headers. For a browser-initiated file download to work correctly:
- `Content-Type: application/zip`
- `Content-Disposition: attachment; filename="{projectName}_export_{timestamp}.zip"`
- The filename in `Content-Disposition` must be sanitized (project names may contain special characters).
- For streaming, `Transfer-Encoding: chunked` should be used (no `Content-Length` since the ZIP size is unknown upfront).

### 3.7 No Tests Mentioned

The plan does not include any testing strategy. Given the codebase has test files alongside route handlers (e.g., `datasets.test.ts`, `experiments.test.ts`), tests should be planned for:
- Input validation (bad IDs, too many IDs, missing query param).
- Authorization (cross-project dataset access attempt).
- Partial failure handling.
- ZIP contents verification.
- Streaming behavior (response is not buffered entirely before sending).

---

## 4. Suggested Improvements

### 4.1 Use `COPY ... TO STDOUT CSV` Instead of `SELECT *` + `json2csv`

Postgres has a built-in CSV export via the `COPY` command. Using `pg` client's `copyToStream()` method, you can pipe CSV data directly from Postgres into the ZIP archive with near-zero memory overhead and significantly better performance than `SELECT *` followed by JavaScript CSV conversion.

### 4.2 Consider POST Instead of GET

The endpoint accepts a list of dataset IDs. While GET is semantically appropriate for a read-only export, very long ID lists could exceed URL length limits. Consider accepting `POST /api/datasets/export` with a JSON body `{ projectId, datasetIds }` as an alternative. This also avoids query string parsing edge cases.

### 4.3 Add an Export Manifest

Include a `manifest.json` in the ZIP containing metadata: dataset names, row counts, export timestamp, any errors. This helps users understand what they received, especially for partial exports.

### 4.4 Consider Reusing Original Files

If the goal is simply "download my datasets," the simplest and most efficient approach is to bundle the original uploaded files from `env.datasetStorageDir/{datasetId}/{filename}`. This avoids Postgres entirely, preserves original formats, and is trivial to implement with `archiver`.

---

## 5. Risk Summary

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| SQL injection via table name interpolation | Critical | High (plan describes raw `SELECT *`) | Use `quoteIdentifier()` or `COPY` command |
| No authentication on export endpoint | Critical | High (no auth on any dataset route) | Add `requireAuth` middleware |
| Cross-project data exfiltration | Critical | High (no project ownership check) | Validate dataset `projectId` matches URL param |
| Unbounded memory from full table export | High | Medium (depends on dataset size) | Stream with cursors or `COPY` |
| Missing input validation | High | High | Add zod schema for query params |
| Database connection exhaustion | Medium | Medium (concurrent exports) | Rate limit, connection timeout |
| No Postgres fallback | Medium | Low (most deployments have Postgres) | Check `hasDatabaseConfiguration()` |
| Missing `json2csv` dependency | Low | Certain (not in backend deps) | Install or use alternative |
