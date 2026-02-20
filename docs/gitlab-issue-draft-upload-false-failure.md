# Issue Title
File upload shows failure state until page refresh (false negative)

## Summary
After uploading files, the UI sometimes shows the upload as failed even though the file is actually persisted successfully. Refreshing the page then shows the file as uploaded.

## Environment
- Branch: `sprint6`
- Frontend areas: data/document upload UI and client state hydration
- Backend areas: upload endpoint response and status handling

## Steps to Reproduce
1. Start app with `npm run dev`.
2. Open a project.
3. Upload a supported file (CSV/PDF/etc.).
4. Observe immediate upload status shown in UI.
5. Refresh the page.

## Actual Behavior
- UI can show an upload failure/error initially.
- After refresh, the file appears as successfully uploaded.

## Expected Behavior
- Upload success/failure state should be accurate and consistent without requiring refresh.
- If backend accepted the file, UI should show success immediately.

## Impact
- Causes user confusion and duplicate uploads.
- Undermines trust in ingestion workflow.

## Suspected Root Cause Areas
- Frontend optimistic update and error state timing/race conditions.
- Inconsistent shape/handling of upload API response.
- Delayed state sync/hydration from backend after successful upload.

## Suggested Investigation
- Compare network response payload vs frontend success/error state transitions.
- Trace upload flow from request completion to store update.
- Add instrumentation around upload status transitions and post-upload list refresh.

## Acceptance Criteria
- [ ] Upload success/failure state matches backend result in real time.
- [ ] No refresh required to see successfully uploaded files.
- [ ] Duplicate/false error states are eliminated.
- [ ] Add regression test for upload status consistency.
