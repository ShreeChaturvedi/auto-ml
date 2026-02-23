# Architectural Decisions

This document records the current, verified architectural decisions (ADR-style). Status reflects actual code behavior as of 2025-12-18.

---

## ADR-001: Technology Stack

**Status:** Accepted (2025-09-30)

- Frontend: React 19, TypeScript, Vite, Tailwind, shadcn/ui, Zustand, TanStack Table.
- Backend: Express 5, TypeScript, Node 22, Postgres 16.
- Testing: Playwright, Vitest, Supertest.

**Rationale:** Modern TS-first stack with fast iteration, strong DX, and accessible UI primitives.

---

## ADR-002: Query Engine (Backend Postgres)

**Status:** Accepted (2025-10-01)

- Active query engine is Postgres via `/api/query/sql` and caching.
- DuckDB-WASM client exists but is currently unused.

**Rationale:** Centralized execution, EDA, and caching are easier server-side; avoids shipping large WASM and inconsistent client performance.

---

## ADR-003: Control Panel UI (Structured AI Output → UI)

**Status:** Accepted (2025-09-30)

**Decision:** Present AI outputs as editable UI controls (toggles/sliders) rather than raw code. Users approve and tweak suggestions without debugging generated scripts.

---

## ADR-004: Dual Workflow (Express Lane + Interactive)

**Status:** Accepted (2025-09-30)

**Decision:** Allow users to accept defaults quickly or intervene at each phase. UI must support both paths consistently.

---

## ADR-005: RAG Pipeline (Lightweight Retrieval)

**Status:** Accepted (2025-10-01)

- Documents are chunked and stored in Postgres.
- Embeddings are lightweight (hash-based vectors), with in-app cosine + keyword scoring.
- Answering composes responses from retrieved snippets (no LLM generation yet).

**Rationale:** Keeps MVP self-contained without external API cost; prepares for future vector DB + LLM integration.

---

## ADR-006: Authentication (JWT + Refresh Tokens)

**Status:** Accepted (2025-12-18)

Auth endpoints are wired in the backend and login/signup/reset/profile flows are live in the frontend (requires Postgres configuration). Route-level auth enforcement remains a follow-up.

---

## ADR-007: NL→SQL Strategy (Interim)

**Status:** Accepted (2025-10-01)

Current NL→SQL is a deterministic template stub used for evaluation. LLM-based NL→SQL is pending due to cost and infra decisions.

---

## ADR-008: Code Execution Environment

**Status:** Pending

Decision needed on server-side execution (containerized kernel vs job runner vs Jupyter gateway). Must support file access, Python libs, and safe sandboxing.

---

## Decision Log Summary

| ADR | Title | Status |
| --- | ----- | ------ |
| ADR-001 | Tech stack | Accepted |
| ADR-002 | Query engine = Postgres | Accepted |
| ADR-003 | Control panel UI | Accepted |
| ADR-004 | Dual workflow | Accepted |
| ADR-005 | Lightweight RAG | Accepted |
| ADR-006 | Auth (JWT) | Accepted |
| ADR-007 | NL→SQL stub | Accepted |
| ADR-008 | Code execution | Pending |
