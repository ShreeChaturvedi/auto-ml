# Plan Review: Bulk Dataset Export API

## Verdict

**This plan needs significant revision.** Both reviewers converged on 4 critical issues and several important gaps. The plan misunderstands existing codebase conventions, ignores the dual-mode repository, introduces unnecessary dependencies, and has a serious cross-project data access vulnerability. A fundamentally simpler approach exists.

---

## Critical Issues

### 1. SQL Injection via Unquoted Table Names + Unbounded Query (CRITICAL)
**Convergence: Both reviewers flagged this.**

The plan proposes `SELECT * FROM {tableName}` with raw table name interpolation and no row limit. The existing codebase at `backend/src/services/datasetRows.ts:38` uses `quoteIdentifier(tableName)` for safe quoting and always applies `OFFSET/LIMIT`. The plan's approach creates two compounding risks: SQL injection if table name metadata is corrupted, and memory exhaustion for large datasets (no LIMIT means loading millions of rows into Node.js memory).

**What to do instead:** Use `quoteIdentifier()` from `backend/src/services/nlToSql/identifiers.ts:9` for all table name interpolation. For streaming, use Postgres cursors or chunked pagination matching the existing `datasetRows.ts` pattern. Better yet, read original files from disk (see Alternative Approaches below).

### 2. Cross-Project Data Access / IDOR Vulnerability (CRITICAL)
**Convergence: Both reviewers flagged this.**

The plan takes `projectId` from the URL and `datasets=id1,id2,id3` from the query string but never validates that the requested dataset IDs actually belong to that project. An attacker could pass arbitrary dataset IDs to export data from any project. The existing `datasetRepository.listByProject()` (in `backend/src/repositories/datasetRepository.ts:58-59`) provides project-scoped listing, but the plan does not use it for ownership validation.

**What to do instead:** After resolving datasets by ID, verify every dataset's `projectId` matches the request's `projectId`. Reject the entire request if any dataset fails this check.

### 3. Route Convention Mismatch (CRITICAL)
**Convergence: Both reviewers flagged this.**

The plan proposes `GET /api/projects/:projectId/export`, but all existing dataset routes in `backend/src/routes/datasets.ts` use the `/datasets/...` prefix (e.g., `/datasets/:datasetId/download`, `/datasets/:datasetId/rows`). Only notebook routes use `projects/:projectId/...` (`backend/src/routes/notebooks/notebookRoutes.ts:27-30`). The dataset router is mounted without a project-scoped prefix in `backend/src/app.ts:56`.

**What to do instead:** Use `POST /api/datasets/export` with `projectId` in the request body, matching existing dataset route conventions.

### 4. Two New Dependencies Are Unnecessary (CRITICAL)
**Convergence: Both reviewers flagged this.**

`json2csv` and `archiver` are not in `backend/package.json` or `package-lock.json`. The plan treats them as available. Adding two runtime dependencies for a single endpoint is avoidable:
- CSV generation is trivial (~15 lines: header row + `JSON.stringify`-based value escaping per row).
- Node.js built-in `node:zlib` can create ZIP streams. Alternatively, `archiver` is the only justified dependency if ZIP streaming is truly needed, but consider whether a single concatenated CSV or a tar.gz is sufficient.

**What to do instead:** Write a simple CSV serializer (no library needed). If ZIP is required, `archiver` is acceptable as a single new dependency, but `json2csv` is not justified.

---

## Strong Recommendations

### 5. File-Backed Repository Mode Ignored (IMPORTANT)
**Convergence: Both reviewers flagged this.**

`backend/src/repositories/datasetRepository.ts:329-339` shows the repository can be file-backed (`FileDatasetRepository`) or Postgres-backed (`PgDatasetRepository`) depending on database configuration. The plan assumes Postgres-only SQL queries. In file-backed mode, there are no Postgres tables to query.

**What to do instead:** The simplest approach is to read the original uploaded files from disk at `env.datasetStorageDir/{datasetId}/{filename}` (exactly what the existing download endpoint does at `datasets.ts:90-98`). This works regardless of storage backend. If the goal is to always export as CSV (even for JSON/XLSX originals), then use the dual-mode pattern from `backend/src/services/datasetRows.ts:57-84` which tries Postgres first and falls back to file parsing.

### 6. HTTP Method Should Be POST, Not GET (IMPORTANT)
**Convergence: Both reviewers flagged this.**

Using `GET` with `?datasets=id1,id2,id3` in the query string risks hitting URL length limits (typically 2048-8192 characters depending on browser/server). With UUID dataset IDs (36 chars each), the limit could be reached with ~50-60 datasets. Additionally, this operation has side effects (resource-intensive streaming, potential server load) that semantically fit POST better.

**What to do instead:** Use `POST /api/datasets/export` with a JSON body containing `{ projectId, datasetIds: [...] }`. Validate with a zod schema matching the pattern in `backend/src/routes/datasets/validation.ts`.

### 7. Frontend Scope Is Severely Underestimated (IMPORTANT)
**Convergence: Both reviewers flagged this.**

The plan says "add a frontend button in DataViewerTab" but `DataViewerTab.tsx` (417 lines) has NO multi-selection UI. There are no checkboxes, no `selectedDatasets` state, no bulk action toolbar. The component's current paradigm is tab-based file viewing, not list-based selection. Building selection UI from scratch requires:
- Selection state management (likely in the Zustand data store at `frontend/src/stores/dataStore.ts`)
- Checkbox rendering per dataset in the FileTabBar or a new dataset list view
- Select-all / deselect-all toggle
- A bulk export button with disabled state, loading spinner, and error feedback
- Integration with the existing `useFileActions` download pattern (`frontend/src/hooks/useFileActions.ts:96-119`)

**What to do instead:** Estimate 100-150 lines of frontend work across 2-3 files. Consider adding the export button to the existing `useFileActions` hook and building a minimal dataset selection popover rather than modifying the core DataViewerTab layout.

### 8. No Partial Failure Strategy (IMPORTANT)

The plan doesn't address what happens if 2 of 5 datasets fail to export (e.g., missing file on disk, Postgres table dropped). The existing `POST /datasets/migrate` endpoint at `datasets.ts:131-188` provides a good pattern: it collects `migrated`, `skipped`, and `errors` arrays.

**What to do instead:** For a streaming ZIP, skip failed datasets and append an `_errors.txt` manifest to the ZIP. Log failures server-side. Return a partial success rather than aborting the entire download.

---

## Minor Suggestions

### 9. Missing Response Headers
The plan mentions streaming but doesn't specify `Content-Type: application/zip`, `Content-Disposition: attachment`, or `Transfer-Encoding: chunked`. The existing download endpoint at `datasets.ts:100-108` shows the correct pattern for file downloads.

### 10. No Cancellation/Abort Mechanism
Long-running ZIP generation for large datasets should support request abort. Express `req.on('close', ...)` can detect client disconnection and stop processing.

### 11. Test Coverage Gap
The existing `datasets.test.ts` doesn't even test the current single-file download endpoint. The new export endpoint needs tests for: valid export, cross-project rejection, empty dataset list, partial failures, and large dataset handling. The test file's `InMemoryDatasetRepository` and `createMockDataset` helpers (lines 77-168) can be reused.

---

## Alternative Approaches

**The fundamentally simpler approach (recommended by both reviewers):**

Since uploaded files already exist on disk at `env.datasetStorageDir/{datasetId}/{filename}`, and the existing single-file download endpoint reads them directly, the bulk export can simply read the original files from disk and ZIP them. No Postgres queries, no CSV conversion, no `json2csv` needed. This reduces the entire backend to ~40 lines:

1. Validate dataset IDs belong to project via `datasetRepository.listByProject()`
2. For each valid dataset, `createReadStream(path.join(env.datasetStorageDir, datasetId, filename))`
3. Pipe each stream into an `archiver` ZIP stream (or use `node:zlib`)
4. Stream the ZIP to the response

This approach is faster, uses less memory, works in both file-backed and Postgres-backed modes, and preserves original file formats.

---

## Revised Plan

### Step 1: Create `backend/src/routes/datasets/exportHandler.ts` (~50 lines)
- Zod schema: `{ projectId: z.string(), datasetIds: z.array(z.string()).min(1).max(50) }`
- Validate all datasets belong to the specified project using `datasetRepository.listByProject(projectId)` then intersecting with requested IDs
- For each valid dataset, read the original file from `env.datasetStorageDir/{datasetId}/{filename}`
- Stream into a ZIP archive (use `archiver` -- single new dependency, or roll a minimal ZIP with `node:zlib`)
- Set response headers: `Content-Type: application/zip`, `Content-Disposition: attachment; filename="..."`
- Handle missing files gracefully: skip and include `_errors.txt` in the ZIP
- Handle `req.on('close')` to abort if client disconnects

### Step 2: Register route in `backend/src/routes/datasets.ts` (~5 lines)
- Add `POST /datasets/export` route calling the handler
- Pass `datasetRepository` to the handler (matching existing patterns like `getDatasetRows`)

### Step 3: Add `frontend/src/lib/api/datasets.ts` export function (~15 lines)
- `exportDatasets(projectId: string, datasetIds: string[]): Promise<Blob>`
- POST to `/datasets/export`, return response as blob

### Step 4: Add frontend selection UI (~100 lines across files)
- Add selection state to data store or local component state
- Add checkboxes to dataset list in DataViewerTab or FileTabBar
- Add "Export Selected" button with loading/error states
- Wire to the new API function, trigger download via blob URL pattern from `useFileActions.ts:108-115`

### Step 5: Add tests (~60 lines)
- Backend: export with valid datasets, cross-project rejection, missing files, empty list
- Reuse existing `InMemoryDatasetRepository` from `datasets.test.ts`

### Dependencies
- **Add to `backend/package.json`:** `archiver` + `@types/archiver` (only if ZIP is required; consider tar.gz with built-in `node:zlib` as zero-dependency alternative)
- **Do NOT add:** `json2csv` (unnecessary)

### What to test
- Valid multi-dataset export produces a valid ZIP
- Dataset IDs from a different project are rejected with 403
- Missing dataset files are skipped, included in error manifest
- Empty `datasetIds` array returns 400
- Request cancellation stops processing

Want me to update the plan based on this feedback?
