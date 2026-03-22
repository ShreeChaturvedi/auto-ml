# Plan Review: Bulk Dataset Export API

## Summary Verdict

The plan captures the high-level intent but has **critical security gaps**, **architectural mismatches** with the existing codebase, and **several under-specified areas** that would lead to bugs or vulnerabilities in implementation.

---

## 1. Critical: SQL Injection via Unvalidated Table Names

**Plan step 3** says: "For each dataset, run `SELECT * FROM {tableName}` to get all rows."

The codebase already handles this carefully elsewhere. In `/home/shree/Documents/CSE449/repo/backend/src/services/datasetRows.ts` (line 38), row reads use the `quoteIdentifier()` helper from `backend/src/services/nlToSql/identifiers.ts`:

```ts
`SELECT * FROM ${quoteIdentifier(tableName)} ORDER BY ctid OFFSET $1 LIMIT $2`
```

The plan makes no mention of identifier quoting. If the implementer interpolates `tableName` directly into the SQL string (as the plan literally describes), it opens a **SQL injection vector** -- table names are derived from user-uploaded filenames via `sanitizeTableName()` (`backend/src/services/dataLoading/schemaInference.ts`, line 33), which strips special characters but does not double-quote the identifier. A table named `table_data` is safe, but the plan should explicitly require `quoteIdentifier()` wrapping.

**Recommendation:** Mandate use of `quoteIdentifier(tableName)` for all dynamic SQL identifiers and reference the existing helper.

---

## 2. Critical: No Authorization / Access-Control Check

The plan proposes `GET /api/projects/:projectId/export?datasets=id1,id2,id3` but says nothing about authentication or authorization.

Looking at how routes are mounted in `/home/shree/Documents/CSE449/repo/backend/src/app.ts` (line 56), the dataset router is mounted **without** any auth middleware:

```ts
router.use(createDatasetUploadRouter(datasetRepository));
```

Only two route groups in the entire backend use `requireAuth`: the auth routes themselves and the realtime session route (`backend/src/routes/realtimeSession.ts`, line 11). The existing dataset routes are already unprotected, but an **export endpoint that dumps entire dataset contents** raises the stakes significantly.

More importantly, even without `requireAuth`, the plan must verify that the requested dataset IDs actually belong to the specified `projectId`. The `DatasetProfile` type (`backend/src/types/dataset.ts`, line 25) has `projectId` as an **optional** field (`projectId?: string`). A malicious request could pass `datasets=<id-from-another-project>` and exfiltrate data the user should not access.

**Recommendation:**
- Add `requireAuth` middleware to the export route at minimum.
- After fetching each dataset, verify `dataset.projectId === req.params.projectId`. Reject with 403 if any dataset does not belong to the requested project.

---

## 3. Critical: No Statement Timeout on Unbounded `SELECT *`

The existing `sqlExecutor.ts` (`backend/src/services/sqlExecutor.ts`, line 113) wraps every user query in a transaction with `SET LOCAL statement_timeout = ${env.sqlStatementTimeoutMs}` (default 5000ms per `backend/src/config.ts`, line 79). The existing `datasetRows.ts` service does **not** set a statement timeout -- it queries via `pool.query()` directly (line 37-39).

The plan's `SELECT * FROM {tableName}` with **no LIMIT** on potentially large datasets (upload limit is 300MB per `config.ts` line 69, `datasetUploadMaxMb`) would:
- Hold a Postgres connection for an unbounded duration
- Buffer the entire result set in Node.js memory before CSV conversion
- Multiply by N datasets in the same request

A single request exporting 3 large datasets could exhaust the connection pool (default max 10, `config.ts` line 78) and OOM the Node process.

**Recommendation:**
- Set `statement_timeout` on each query.
- Stream rows using a Postgres cursor (`pg-cursor` or `DECLARE CURSOR ... FETCH`) rather than loading all rows into memory.
- Add a configurable per-dataset row limit or total export size cap.

---

## 4. Major: Route Pattern Conflicts with Existing Router

The plan proposes `GET /api/projects/:projectId/export`, but the dataset router (`backend/src/routes/datasets.ts`) is a flat router mounted at `/api` via `router.use(createDatasetUploadRouter(...))` in `app.ts` line 56. All existing dataset routes use the pattern `/datasets/:datasetId/...` -- there is no `/projects/:projectId/...` prefix in this router.

Project-scoped routes that use `/projects/:projectId/...` exist in the notebook router (`backend/src/routes/notebooks/notebookRoutes.ts`, line 30) and the experiments router (`backend/src/routes/experiments.ts`, line 62), but those are mounted on separate routers.

Placing the export route inside `createDatasetUploadRouter` with a `/projects/:projectId/export` path would work, but it would be the only route in that router using a different URL prefix -- an inconsistency that could cause confusion. Alternatively, placing it outside that router requires access to the `datasetRepository` instance.

**Recommendation:** Follow the existing dataset route convention. Either:
- Use `GET /api/datasets/export?projectId=xxx&datasets=id1,id2,id3` (consistent with the existing `GET /api/datasets?projectId=xxx` pattern at line 24-42 of `datasets.ts`), or
- Create a new router that receives the `datasetRepository` dependency, similar to how `createDatasetUploadRouter` is constructed.

---

## 5. Major: `json2csv` Is Not an Existing Dependency

Neither `json2csv` nor `archiver` appear in `backend/package.json`. The plan should acknowledge this and evaluate alternatives already in the dependency tree:

- The backend already depends on `csv-parse` (for parsing). The inverse operation (stringify) is available from the same `csv` package family as `csv-stringify`, which would be a more natural fit than `json2csv`.
- For ZIP creation, `archiver` is a reasonable choice, but alternatives like `yazl` are lighter. Since this is a streaming use case, `archiver`'s streaming API is appropriate.

**Recommendation:** Use `csv-stringify` (from the `csv` package family, consistent with the existing `csv-parse` dependency) instead of `json2csv`. Explicitly note both new dependencies in the plan.

---

## 6. Major: "Streaming" Claim Is Under-Specified

The plan says "Should handle large datasets efficiently via streaming" but step 4 says "Convert each result to CSV using `json2csv`." The default `json2csv` API parses the entire array in memory before producing output. True streaming requires:

1. **Postgres cursors** to avoid loading all rows into memory.
2. **`csv-stringify` in stream/transform mode** (not batch conversion).
3. **`archiver` in streaming mode** piped directly to `res`.
4. Proper backpressure handling between the Postgres stream, CSV transform, and the archiver entry.

Without specifying this pipeline, an implementer will likely write the naive version: `pool.query('SELECT *')` -> `json2csv(rows)` -> `archiver.append(csvString)`, which loads everything into memory and defeats the stated goal.

**Recommendation:** Describe the streaming pipeline explicitly: Postgres cursor -> row transform stream -> csv-stringify transform -> archiver entry, with the archiver output piped to `res`. Reference Node.js `stream.pipeline()` for backpressure.

---

## 7. Moderate: No Input Validation on `datasets` Query Parameter

The plan does not specify validation for the `datasets=id1,id2,id3` query string. The existing codebase uses Zod for input validation (e.g., `backend/src/routes/datasets/rowHandler.ts` line 11, `backend/src/routes/datasets/validation.ts` line 7). Without validation:

- An empty `datasets` param would produce an empty ZIP or crash.
- Extremely long query strings (hundreds of IDs) could cause issues.
- Non-UUID values would waste DB round-trips.

**Recommendation:** Add a Zod schema that:
- Validates each ID is a valid UUID.
- Enforces a maximum number of datasets per export request (e.g., 20).
- Returns 400 with clear error messages for invalid input.

---

## 8. Moderate: No Error Handling for Partial Failures

If 3 datasets are requested and the 2nd one fails (e.g., its Postgres table was dropped, or the table is corrupted), what happens? The plan does not address this. Since the response is a streaming ZIP, once headers are sent, you cannot change the HTTP status code.

**Recommendation:** Either:
- **Pre-validate** all datasets before starting the stream (check existence, verify project ownership, confirm tables exist).
- Or include an `errors.json` manifest file inside the ZIP listing any datasets that could not be exported.

---

## 9. Moderate: Missing `Content-Disposition` Filename Sanitization

The plan says `ZIP filename: {projectName}_export_{timestamp}.zip`. The `projectName` comes from user input and could contain characters that break HTTP headers or filesystem paths (e.g., newlines, quotes, non-ASCII).

The existing download handler at `backend/src/routes/datasets.ts` line 107 uses `dataset.filename` directly in `Content-Disposition` without sanitization -- this is already a latent bug there.

**Recommendation:** Sanitize the project name for use in the `Content-Disposition` header: strip or replace non-ASCII characters, quotes, newlines, and path separators. Use the RFC 6266 `filename*=UTF-8''...` syntax if Unicode names are desired.

---

## 10. Moderate: Existing Single-File Download Already Exists

The plan does not mention the existing `GET /api/datasets/:datasetId/download` endpoint (`backend/src/routes/datasets.ts`, lines 80-111), which serves original uploaded files from disk. The bulk export plan instead proposes re-querying Postgres and converting to CSV.

This creates a **behavioral inconsistency**: single download returns the original file (could be CSV, JSON, or XLSX), while bulk export always returns CSV. An XLSX dataset exported in bulk would lose formatting, multiple sheets, formulas, etc.

**Recommendation:** Decide on a clear strategy:
- **Option A:** Bulk export bundles the original files from disk (like the single download does), preserving format fidelity. This is simpler and avoids the Postgres query entirely.
- **Option B:** Bulk export always converts to CSV with a clear note in the UI that format conversion occurs. Document why this tradeoff was made.

Option A would be significantly simpler to implement and avoids all the Postgres streaming complexity.

---

## 11. Minor: Frontend Scope Is Underestimated

The plan says "Add a frontend button in DataViewerTab that collects selected dataset IDs." However, `DataViewerTab` (`frontend/src/components/data/DataViewerTab.tsx`) has no multi-selection UI. The component shows one active file tab at a time via `FileTabBar` (line 349) with a single `activeFileTabId` (line 63). There is no checkbox or multi-select mechanism.

Implementing multi-select requires changes to:
- The `FileTabBar` component (add checkboxes or a selection mode).
- The `fileSlice` in the data store (`frontend/src/stores/data/fileSlice.ts`) to track selected dataset IDs.
- The `DataViewerTab` to render an export button that appears when selections exist.
- A new API function in `frontend/src/lib/api/datasets.ts` for the bulk export call.
- A download trigger (creating an `<a>` element or using `URL.createObjectURL` with the blob).

**Recommendation:** Expand the frontend section to list these specific sub-tasks, or consider a simpler UX: an "Export All" button in the project header that exports all datasets for the current project (no selection needed).

---

## 12. Minor: No Tests Mentioned

The plan lists no test strategy. The existing codebase has tests for dataset routes (`backend/src/routes/datasets.test.ts`). At minimum, the plan should include:
- Unit tests for CSV conversion logic.
- Integration tests for the export endpoint (valid request, invalid IDs, cross-project access attempt, empty datasets param).
- Frontend component tests if a new selection UI is added.

---

## 13. Minor: Missing Consideration for File-Based Repository Fallback

The `createDatasetRepository` function (`backend/src/repositories/datasetRepository.ts`, line 329) can return either a `PgDatasetRepository` or a `FileDatasetRepository` depending on whether `DATABASE_URL` is configured. Similarly, `datasetRows.ts` (lines 71-84) falls back to reading from disk when Postgres is unavailable.

If the export handler assumes Postgres is always available for `SELECT * FROM {tableName}`, it will fail in file-only deployments. The existing `getDatasetRowsPage` function in `datasetRows.ts` already handles this dual-mode gracefully.

**Recommendation:** Reuse the existing `getDatasetRowsPage` service (or a variant of it) rather than querying Postgres directly, to preserve the file-storage fallback behavior.

---

## Alternative Approach

Given findings #10 and #13, the simplest and most robust implementation would be:

1. **Skip Postgres queries entirely.** Bundle the original files from `env.datasetStorageDir/{datasetId}/{filename}` (the same files served by the existing single-download endpoint).
2. **Validate project ownership** by looking up each dataset via `datasetRepository.getById()` and checking `projectId`.
3. **Stream original files** directly into the archiver from disk -- no CSV conversion, no Postgres cursors, no memory pressure from large result sets.
4. **Frontend:** Add an "Export All Datasets" button that calls `GET /api/datasets/export?projectId=xxx` (all datasets for the project, no multi-select UI needed).

This approach needs zero new dependencies (Node.js `zlib` + `archiver` only), avoids all the SQL injection and streaming complexity concerns, and preserves original file formats.
