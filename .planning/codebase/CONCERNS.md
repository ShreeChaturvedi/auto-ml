# Codebase Concerns

**Analysis Date:** 2026-03-13

## Tech Debt

**Debug Endpoint Left in Production:**
- Issue: `/llm/debug` endpoint dumps frontend state to `frontend_dump.json` file on disk
- Files: `backend/src/routes/llm/preprocessingHandler.ts:232-242`
- Impact: Uncontrolled file creation, potential disk space exhaustion, information leakage
- Fix approach: Remove debug endpoint or gate it behind development environment check (`env.nodeEnv !== 'production'`)

**In-Memory Caches Without Eviction:**
- Issue: `answerCache` in `backend/src/services/answerService.ts:35` uses TTL but never actively cleans expired entries; relies on lazy checking on `get()`
- Files: `backend/src/services/answerService.ts`
- Impact: Unbounded memory growth as cached entries accumulate in long-running servers
- Fix approach: Implement periodic garbage collection or use `Map` with maxSize + LRU eviction policy

**Kernel Map Cleanup Incomplete:**
- Issue: `kernels` map in `backend/src/services/kernelManager.ts:42` stores WebSocket connections but cleanup happens only when explicitly connected; stale kernels can persist
- Files: `backend/src/services/kernelManager.ts`
- Impact: Memory leak if containers are destroyed without proper kernel disconnection; zombie kernel processes
- Fix approach: Add `disconnectKernel()` calls in container destruction path; implement periodic kernel health checks

**Container Cleanup Race Condition:**
- Issue: `setInterval()` in `backend/src/services/containerManager.ts:209` runs every 5 minutes without coordinating with active execution requests
- Files: `backend/src/services/containerManager.ts:209`
- Impact: Could terminate containers mid-execution if timing aligns; lost work
- Fix approach: Track active execution count per container; don't clean containers with in-flight operations

## Known Bugs

**Stream Closure Not Fully Guarded:**
- Symptoms: Multiple calls to `writer.closeStream()` or `res.write()` after response is destroyed
- Files: `backend/src/routes/llm/sseHelpers.ts:54-68`
- Trigger: Client aborts request while LLM is streaming; concurrent response writes
- Workaround: Guards check `res.destroyed && res.writableEnded` but race condition window exists between checks
- Real fix: Use native Node.js `res.once('close', ...)` to set single atomic flag; avoid multiple write attempts

**Silent Error Swallowing in Sync Operations:**
- Symptoms: Dataset sync failures logged with `.catch()` but execution continues as if succeeded
- Files: `backend/src/services/modelTraining.ts:246`, `backend/src/services/executionService.ts:71`, `backend/src/services/featureEngineering.ts:206`
- Trigger: Network failure during dataset copy, permission issues on workspace
- Workaround: `console.warn()` log provides visibility but no retry
- Real fix: Propagate sync errors; fail the training/execution job if datasets aren't available

**NL-to-SQL Repair Fails Without Fallback:**
- Symptoms: Generated SQL fails, repair is attempted, but if repair fails, original broken SQL is returned to user
- Files: `backend/src/routes/query/nlHandler.ts:349`
- Trigger: Complex queries or edge cases where both generation and repair fail
- Workaround: Console warning emitted
- Real fix: Return explicit error state to frontend instead of sending potentially broken SQL

## Security Considerations

**No Rate Limiting on Execution Endpoints:**
- Risk: Unbounded Python code execution; users can spam `/api/execute`, `/api/session` to exhaust server resources
- Files: `backend/src/routes/execution.ts`
- Current mitigation: Timeout enforcement per request (`env.executionTimeoutMs`), but no per-user or per-IP limits
- Recommendations: Add express-rate-limit middleware; enforce max concurrent sessions per project; track execution costs

**Environment Variable Exposure in Logging:**
- Risk: Debug logs might capture API keys, database credentials, tokens if they're passed in request payloads
- Files: Global use of `console.log()`, `console.error()` throughout backend
- Current mitigation: None; unstructured logging
- Recommendations: Replace with structured logging (winston/pino); redact sensitive patterns; never log raw request/response bodies

**Docker Container Privilege Model Not Verified:**
- Risk: Python code in containers could escape to host if image is built with insufficient isolation
- Files: `backend/src/services/container/dockerBuilder.ts`
- Current mitigation: Resource limits (memory, CPU) enforced; read-only filesystem partially configured
- Recommendations: Run containers with `--security-opt=no-new-privileges`; enforce seccomp profile; verify image does not run as root

**Password Reset Token Lacks Expiration Validation:**
- Risk: Reset tokens generated but expiration not enforced on validate side
- Files: `backend/src/routes/auth.ts` (reset-password endpoint)
- Current mitigation: Tokens hashed in DB
- Recommendations: Add explicit `expiresAt` column to password_reset_tokens table; reject tokens older than 1 hour

## Performance Bottlenecks

**NL-to-SQL Multi-Pass Generation Serialized:**
- Problem: `phaseSchemaContext`, `phasePass1`, `phasePass2Candidate`, `phasePass2Fallback` execute sequentially in `backend/src/services/nlToSql/pipeline.ts`
- Files: `backend/src/services/nlToSql/pipeline.ts`
- Cause: Each phase depends on previous output; no parallelization possible
- Improvement path: Cache schema context; pre-compute candidate joins; parallelize schema validation with Pass 1 generation

**Document Ingestion Blocks on PDF Parsing:**
- Problem: PDF parsing done in main request handler; large PDFs (100+ pages) can cause 10s+ latencies
- Files: `backend/src/routes/documents.ts:71` (ingest), `backend/src/services/documentParser.ts:100`
- Cause: Fallback from pdfParse to pdfjs happens serially; no size pre-check
- Improvement path: Offload to job queue (Bull/BullMQ); implement streaming chunk parser for large documents; add progress endpoint

**Query Cache Lookup Not Indexed:**
- Problem: Query results cached in Postgres but no compound index on (projectId, dataset, query_hash)
- Files: Query cache implemented in `backend/src/services/sqlExecutor.js` (via Postgres)
- Cause: Cache hit rate low for large projects with many datasets
- Improvement path: Add composite index on (project_id, dataset_id, query_hash); implement LRU cache eviction in queries

## Fragile Areas

**Preprocessing State Machine Distributed Across Modules:**
- Files: `backend/src/services/llm/preprocessingGraph.ts`, `backend/src/routes/llm/preprocessingHandler.ts`, `backend/src/routes/llm/shared.ts`
- Why fragile: State transitions span multiple files; no centralized state validation; tool execution logic split across LLM handlers and graph executor
- Safe modification: Consolidate state machine definition; add explicit transition guards; test all paths through full workflow
- Test coverage: `backend/src/services/llm/preprocessingGraph.test.ts` covers graph, but routing logic untested

**Frontend Message Persistence on localStorage Only:**
- Files: `frontend/src/components/notebook/chat/useMessagePersistence.ts`, `frontend/src/components/preprocessing/storagePersistence.ts`
- Why fragile: Zustand store persists to localStorage without versioning; schema changes break old data; no conflict resolution
- Safe modification: Add version field to persisted data; implement migration functions; clear storage on breaking changes
- Test coverage: `frontend/src/components/preprocessing/__tests__/storagePersistence.test.ts` tests migration but not large message volumes

**WebSocket Heartbeat Not Synchronized:**
- Files: `backend/src/services/websocket/wsServer.ts:202` (setInterval-based heartbeat)
- Why fragile: Independent heartbeat timers per connection; no backpressure handling; connection stalls undetected until next heartbeat
- Safe modification: Use exponential backoff on no-pong; implement ping/pong with timeout; add connection state machine
- Test coverage: No integration tests for long-lived WebSocket connections

**Container Manager State Not Persisted Across Restarts:**
- Files: `backend/src/services/containerManager.ts:33` (in-memory containers map)
- Why fragile: Server restart loses all container references; orphaned containers accumulate; cleanup on init may fail silently
- Safe modification: Log all container IDs to persistent store; verify cleanup before accepting requests; add startup health check
- Test coverage: `backend/src/services/kernelManager.test.ts` mocks containers; no real Docker integration tests

## Scaling Limits

**In-Memory Session Cache Unbounded:**
- Current capacity: One ExecutionSession per user request; no session limit
- Limit: Unlimited sessions map in `backend/src/services/executionService.ts:36` → memory exhaustion at ~1000s of concurrent users
- Scaling path: Implement session timeout (1hr idle); use external store (Redis); add max session count per user

**Single Kernel Gateway per Container:**
- Current capacity: One Kernel Gateway instance per Docker container; shares resource pool
- Limit: Gateway can handle ~100 concurrent notebook cells; no load balancing
- Scaling path: Run multiple Gateway replicas per container; implement cell queue with priority; offload to dedicated kernel cluster

**Model Storage Directory Unbounded:**
- Current capacity: Models stored in filesystem at `env.modelStorageDir`
- Limit: Disk fills after ~1000 large models (sklearn models ~50MB each)
- Scaling path: Implement S3/cloud storage backend; add model eviction policy; implement model versioning with cleanup

**Answer Cache No Size Limit:**
- Current capacity: Map grows indefinitely
- Limit: Memory exhaustion after ~10k cached answers (~5MB per answer avg)
- Scaling path: Implement TTL-based cleanup; add max cache size; use external cache (Redis)

## Dependencies at Risk

**PDF Parsing with Dual Fallback:**
- Risk: pdfParse and pdfjs are both maintained but often lag on security updates; no unified error handling
- Impact: Malformed PDFs crash parsing; users cannot ingest documents
- Migration plan: Evaluate pdf-parse v3 alternatives (pdfjs v4 native, Apache PDFBox via wasm); consolidate to single parser with streaming

**LangGraph Preprocessing State Machine Version Pinning:**
- Risk: `@langchain/langgraph` updates frequently; state schema changes break mid-execution workflows
- Impact: Preprocessing jobs in flight can fail on version mismatch; no backward compatibility layer
- Migration plan: Version schema explicitly; implement state migration functions; pin LangGraph to major version only with careful testing on minor bumps

**Docker Runtime Image Pinned to Python 3.10/3.11:**
- Risk: Python versions EOL; security patches end; dependencies break on new OS base images
- Impact: Cannot upgrade system libraries; execution environment stales
- Migration plan: Automate image rebuild on weekly base image updates; implement version matrix testing; add image health checks

## Missing Critical Features

**No Notebook Cell Lineage or Undo:**
- Problem: Executed cells cannot be rolled back; state is linear; users cannot explore alternate code paths
- Blocks: Experimentation workflows; users must restart entire analysis on mistakes
- Approach: Implement cell fork/branch mechanism; persist execution graph; add rollback to previous cell state

**No Authentication for Shared Notebooks:**
- Problem: Notebooks are per-project but no sharing mechanism; all users with project access see all notebooks
- Blocks: Team collaboration on specific analyses; no notebook-level permissions
- Approach: Add notebook-level sharing; implement access control; add read-only mode

**No Experiment Tracking Beyond Model Training:**
- Problem: Only model training is tracked; preprocessing steps and queries not logged for reproducibility
- Blocks: Audit trails; reproducibility; comparing experiment variations
- Approach: Implement run-level artifact storage; add experiment tagging; track all transformations in lineage

## Test Coverage Gaps

**Preprocessing State Transitions:**
- What's not tested: All possible preprocessing tool execution orders; state machine fallback paths when tools fail
- Files: `backend/src/services/llm/preprocessingGraph.ts` (1280 lines but test at 1280 lines)
- Risk: State corruption if tools execute out of order or fail mid-transition
- Priority: **High** — preprocessing is critical path

**Container Lifecycle Under Network Failure:**
- What's not tested: Docker API timeouts, Kernel Gateway unreachability, workspace sync failures during container creation
- Files: `backend/src/services/containerManager.ts`, `backend/src/services/kernelManager.ts`
- Risk: Orphaned containers, hung connections, resource leaks
- Priority: **High** — production stability

**Concurrent LLM Stream Handling:**
- What's not tested: Multiple simultaneous SSE streams to same user; partial response handling; client abort scenarios
- Files: `backend/src/routes/llm/sseHelpers.ts`
- Risk: Race conditions in response writing, response double-close
- Priority: **Medium** — affects multi-tab usage

**Query Result Caching and Invalidation:**
- What's not tested: Cache invalidation when dataset changes; stale cache serving when schema changes
- Files: Query cache logic (Postgres triggers should auto-invalidate but untested)
- Risk: Users see stale query results after dataset update
- Priority: **Medium** — data correctness issue

**End-to-End Upload → Preprocessing → Training Workflow:**
- What's not tested: Full user journey from dataset upload through model training with actual Docker containers
- Files: Multiple services coordinating
- Risk: Integration failures only discovered in production
- Priority: **Medium** — critical user flow but covered by Playwright benchmarks

---

*Concerns audit: 2026-03-13*
