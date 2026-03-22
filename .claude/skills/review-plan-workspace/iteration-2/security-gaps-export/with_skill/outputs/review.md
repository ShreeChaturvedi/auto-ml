# Plan Review: Bulk Dataset Export API

## Critical Issues

### 1. SQL Injection via Unparameterized `SELECT * FROM {tableName}` (CRITICAL)
**Flagged by both reviewers — high confidence.**

The plan proposes running `SELECT * FROM {tableName}` for each dataset. In the existing codebase, table names are derived from user-uploaded filenames via `sanitizeTableName()` and stored in `dataset.metadata.tableName`. The existing `datasetRows.ts` service already handles this correctly by using `quoteIdentifier(tableName)` (see `backend/src/services/datasetRows.ts:38`):

```ts
`SELECT * FROM ${quoteIdentifier(tableName)} ORDER BY ctid OFFSET $1 LIMIT $2`
```

If the export handler naively interpolates the table name without `quoteIdentifier()`, it opens a SQL injection vector. Any implementation **must** use the existing `quoteIdentifier` utility from `backend/src/services/nlToSql/identifiers.ts` and the `resolveDatasetTableName()` helper from `backend/src/services/datasetRows.ts`.

**What to do:** Use `resolveDatasetTableName()` + `quoteIdentifier()` consistently. Never interpolate table names directly into SQL strings.

---

### 2. No Authentication or Authorization on the Export Endpoint (CRITICAL)
**Flagged by both reviewers — high confidence.**

The plan proposes `GET /api/projects/:projectId/export?datasets=id1,id2,id3` but does not mention any auth middleware. Looking at the existing codebase:

- The dataset routes in `backend/src/routes/datasets.ts` do **not** use `requireAuth` middleware — none of the existing dataset endpoints are auth-protected.
- The `requireAuth` middleware exists at `backend/src/middleware/auth.ts` but is only conditionally wired up for `/auth` routes.
- There is **no project-scoped authorization** anywhere — no check that the requesting user owns or has access to the project. The `projectId` route parameter is entirely unvalidated against the authenticated user.

This means:
1. Any unauthenticated user could call the export endpoint and download all data from any project.
2. Even if auth were added, there's no existing pattern for verifying that a user has access to a specific project — this would need to be built.
3. A user could pass dataset IDs belonging to a **different** project than the one in the URL path, exfiltrating data cross-project.

**What to do:** At minimum, validate that every requested dataset ID actually belongs to the specified `projectId`. This is the most critical authorization check. Additionally, consider whether this endpoint should require authentication (consistent with the project's eventual auth posture). The cross-project dataset check is non-negotiable regardless of auth.

---

### 3. `SELECT * FROM table` Without Row Limits Enables Denial of Service (CRITICAL)
**Flagged by both reviewers — high confidence.**

The plan says "run `SELECT * FROM {tableName}` to get all rows" for each dataset. The existing codebase enforces strict limits:
- `env.sqlMaxRows` defaults to 1000 (`backend/src/config.ts:80`)
- `MAX_DATASET_ROWS_LIMIT` is 1000 (`backend/src/services/datasetRows.ts:26`)
- The SQL statement timeout is 5 seconds (`env.sqlStatementTimeoutMs`, `backend/src/config.ts:79`)

An unbounded `SELECT *` on a large dataset (the upload limit is 300MB per file) could:
- Exhaust server memory loading millions of rows into a Node.js buffer
- Saturate the Postgres connection pool (max 10 connections by default)
- Block other users' queries for the duration

Multiplied by potentially many datasets in a single request, this is a straightforward resource exhaustion attack.

**What to do:** Stream rows from Postgres using a cursor rather than loading everything into memory. Set a per-dataset row limit or a total export size cap. Apply the existing `sqlStatementTimeoutMs` to export queries.

---

### 4. GET Method with Potentially Unbounded Query String (IMPORTANT, bordering CRITICAL)
**Flagged by both reviewers — high confidence.**

The plan uses `GET /api/projects/:projectId/export?datasets=id1,id2,id3`. Dataset IDs are UUIDs (36 characters each). With 50 datasets, the query string alone would be ~1,850 characters. Many proxies, CDNs, and browsers enforce URL length limits (commonly 2,048–8,192 characters). This would silently fail in production with a 414 URI Too Long or get truncated.

More importantly, this endpoint has **side effects** (generates a ZIP file, runs multiple heavy database queries). Using GET violates HTTP semantics — GET should be safe and idempotent.

**What to do:** Use `POST /api/projects/:projectId/export` with a JSON body `{ "datasetIds": ["id1", "id2", "id3"] }`. This eliminates URL length concerns and correctly signals that the request has side effects.

---

## Strong Recommendations

### 5. Cross-Project Dataset Exfiltration (IMPORTANT)
**Flagged by Reviewer B.**

The plan takes dataset IDs from the query string but doesn't describe validating that each dataset actually belongs to the specified `projectId`. The `DatasetProfile` type has an optional `projectId` field (`backend/src/types/dataset.ts:25`). A malicious request could include dataset IDs from other projects:

```
GET /api/projects/my-project/export?datasets=other-projects-dataset-id
```

The handler would happily fetch and export that dataset because the plan only describes "query each dataset from Postgres using the IDs" — no ownership check.

**What to do:** After fetching each dataset, verify `dataset.projectId === requestedProjectId`. Return 403 or 404 for any dataset that doesn't match. This is essential even without authentication.

---

### 6. `json2csv` Dependency Is Unnecessary (IMPORTANT)
**Flagged by Reviewer A.**

The plan proposes adding `json2csv` as a new dependency. However:
- The backend already depends on `csv-parse` (`backend/package.json:28`) for CSV parsing.
- The existing download endpoint at `GET /datasets/:datasetId/download` (`backend/src/routes/datasets.ts:80-111`) serves the **original uploaded file** directly from disk — it doesn't convert anything.
- For CSV export from Postgres query results, a simple row-to-CSV serialization (headers + values with proper escaping) is trivial and doesn't warrant a new dependency.
- If streaming is needed (and it is, per the plan's own notes), `json2csv` must be used in streaming mode, which has a different API than the basic usage the plan implies.

**What to do:** Either use the existing uploaded files directly (they're already on disk at `env.datasetStorageDir/{datasetId}/{filename}`) rather than re-querying Postgres and converting to CSV, or implement a lightweight CSV writer that streams rows. Adding `json2csv` for this is over-engineering.

---

### 7. Existing Single-File Download Already Exists (IMPORTANT)
**Flagged by Reviewer B.**

The plan seems unaware that `GET /api/datasets/:datasetId/download` already exists (`backend/src/routes/datasets.ts:80-111`). This endpoint serves the original uploaded file from disk. For a bulk export, the simplest approach would be to:

1. Look up each dataset by ID (validating project ownership)
2. Read each file from `env.datasetStorageDir/{datasetId}/{filename}`
3. Stream them into a ZIP archive

This avoids the entire `SELECT * FROM table` + CSV conversion pipeline. The original files are already on disk. Re-querying Postgres and converting to CSV would produce different results than the original file (column order, formatting, precision) and is significantly more expensive.

**What to do:** Reuse the file-from-disk approach from the existing download handler instead of re-querying Postgres. Only fall back to Postgres if the file is missing from disk.

---

### 8. `archiver` Dependency and Streaming Concerns (IMPORTANT)
**Flagged by Reviewer A.**

The plan proposes using `archiver` to create ZIP files. This is a reasonable choice, but:
- `archiver` is not in `backend/package.json` — it would be a new dependency.
- The plan says "stream to response" but doesn't address what happens if the client disconnects mid-stream. The server would continue generating the ZIP, consuming memory and CPU.
- Node.js `zlib` (built-in) supports creating gzip streams, and `archiver` is essentially a wrapper around it for ZIP format. If only a single format is needed, this is fine, but it should be explicitly added to `package.json`.

**What to do:** Add `archiver` to `backend/package.json` dependencies. Implement abort handling: listen for the `close` event on the response and abort the archiver if the client disconnects. Set a maximum total export size to prevent abuse.

---

### 9. Missing Error Handling for Partial Failures (IMPORTANT)
**Flagged by both reviewers.**

The plan doesn't address what happens when:
- One dataset ID is valid but another is not found
- One dataset's Postgres table exists but another's was dropped
- One dataset's file is missing from disk
- The ZIP generation fails midway (after headers are already sent)

Once you start streaming a ZIP response (status 200, headers sent), you can't change the status code to indicate an error. A partial failure would produce a corrupted ZIP.

**What to do:** Validate ALL datasets exist and are accessible BEFORE starting the ZIP stream. Return a 400/404 error listing which datasets couldn't be found. Only begin streaming once all datasets are confirmed available.

---

### 10. Missing Tests (IMPORTANT)
**Flagged by Reviewer A.**

The plan doesn't mention any test updates. The existing test suite at `backend/src/routes/datasets.test.ts` has comprehensive tests for existing endpoints. The new export endpoint needs tests for:
- Successful multi-dataset export
- Missing dataset ID returns error
- Cross-project dataset ID is rejected
- Empty dataset list
- Invalid dataset ID format
- Response headers (Content-Type, Content-Disposition)
- Large dataset handling / streaming behavior

**What to do:** Add a test section to the plan covering at minimum the happy path and the authorization/validation error cases.

---

## Minor Suggestions

### 11. Frontend Implementation Is Under-Specified (MINOR)
**Flagged by Reviewer A.**

The plan says "Add a frontend button in DataViewerTab that collects selected dataset IDs" but `DataViewerTab` (`frontend/src/components/data/DataViewerTab.tsx`) currently has no concept of "selected datasets." It shows one active file at a time via `activeFileTabId` and `FileTabBar`. There is no checkbox/multi-select UI for datasets. Building this selection mechanism is a non-trivial UX task that the plan hand-waves.

**What to do:** Either scope the frontend work more precisely (e.g., add checkboxes to `FileTabBar`, manage selection state in `useDataStore` or a local state, add an export button to the toolbar) or move the frontend to a separate plan/ticket.

---

### 12. ZIP Filename Convention (MINOR)
**Flagged by Reviewer B.**

The plan specifies `{projectName}_export_{timestamp}.zip`. The project name comes from the project repository, but the export endpoint is under `/api/projects/:projectId/export` — the handler would need to look up the project to get its name. This is an extra database call. Using `{projectId}_export_{timestamp}.zip` would be simpler and avoid the lookup, though less user-friendly.

**What to do:** If using project name, fetch it from the project repository and handle the case where the project doesn't exist (404). Sanitize the project name for use in filenames (remove special characters).

---

### 13. Route Location (MINOR)
**Flagged by Reviewer A.**

The plan suggests modifying `backend/src/routes/datasets.ts` or creating `datasets/exportHandler.ts`. Given the existing pattern where handlers are extracted into `backend/src/routes/datasets/` (e.g., `rowHandler.ts`, `columnHandler.ts`, `uploadHandler.ts`), the correct approach is to create `backend/src/routes/datasets/exportHandler.ts` and wire it into the router in `datasets.ts`. This follows the established convention.

**What to do:** Create `backend/src/routes/datasets/exportHandler.ts` following the pattern of `rowHandler.ts`.

---

## Alternative Approaches

### Use Existing Files from Disk Instead of Re-Querying Postgres

Both reviewers converged on this: the simplest, most efficient, and most correct approach is to read the original uploaded files from disk (`env.datasetStorageDir/{datasetId}/{filename}`) and bundle them into a ZIP. This:
- Eliminates SQL injection risk entirely
- Avoids memory exhaustion from unbounded queries
- Preserves original file format and content exactly
- Is significantly faster (file I/O vs. database query + CSV serialization)
- Requires no new dependencies beyond `archiver`

The Postgres re-query approach only makes sense if the export needs to reflect data that has been modified after upload (e.g., column type changes, preprocessing). If that's the case, the plan should state so explicitly and address the performance/security implications.

---

## Summary

This plan has **three critical issues** that block implementation: SQL injection risk, missing authentication/authorization, and unbounded queries enabling denial of service. The plan also proposes an unnecessarily complex approach (re-query Postgres + CSV conversion) when the original files are already on disk. The HTTP method choice (GET) is wrong for this operation. The frontend work is significantly under-specified.

The plan needs substantial revision before implementation.

Want me to update the plan based on this feedback?
