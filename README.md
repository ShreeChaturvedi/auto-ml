<p align="center">
  <img src="docs/branding/readme-light.svg?v=7#gh-light-mode-only" width="800" alt="AutoML">
  <img src="docs/branding/readme-dark.svg?v=7#gh-dark-mode-only" width="800" alt="AutoML">
</p>

---

[![ci](https://github.com/ShreeChaturvedi/AutoML/actions/workflows/ci.yml/badge.svg)](https://github.com/ShreeChaturvedi/AutoML/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-22%20LTS-brightgreen.svg)](https://nodejs.org/)
[![typescript](https://img.shields.io/badge/typescript-5-blue.svg)](https://www.typescriptlang.org/)

AutoML is an automated data scientist platform that turns datasets and domain documents into deployed, monitored ML services. It fuses LLM context (retrieval-augmented generation, RAG, plus Model Context Protocol, MCP) with automated training (hyperparameter optimization, HPO, multi-model search, and supervised fine-tuning, SFT) to deliver domain-tuned models through transparent, editable pipelines.

## What It Does

AutoML is designed for expert workflows where the hard part is not training a model, but making the model correct for a specific domain and keeping it correct over time. The platform ingests structured data and business context, builds domain-aware features, runs automated model selection and tuning, and ships production-ready endpoints with evaluation and monitoring baked in.

## Engineering Highlights

- LLM-guided orchestration using MCP to produce structured, auditable pipeline decisions instead of opaque text outputs.
- RAG-driven feature engineering and query interpretation grounded in uploaded domain documents.
- Hybrid training stack: reliable templates for core algorithms plus LLM-generated preprocessing that stays user-editable.
- Automated HPO for model selection and SFT workflows for domain-tuned small LLMs.
- Containerized execution runtime with resource caps, artifact capture, and reproducible runs.
- Built-in evaluation harness for NL-to-SQL and RAG quality checks alongside E2E UI benchmarks.

## Workflow

1. Ingest datasets and domain documents into a project workspace.
2. Explore data with SQL/NL queries and automated profiling.
3. Generate domain-aware features and run automated training + HPO.
4. Deploy monitored endpoints and track model quality over time.

## Tech Stack

TypeScript monorepo with a React SPA frontend, Express API, Postgres-backed metadata, Dockerized execution runtime, and Playwright-based benchmarking.

## Quick Start

```bash
npm run install:all
npm run dev
```

The `npm run dev` flow boots a local Postgres container, applies migrations, and starts the frontend + backend.

## Repository Layout

```
backend/   Express + TypeScript API
frontend/  Vite + React UI
testing/   Playwright benchmark + eval runner
```

## Documentation

- `ARCHITECTURE.md` -- system topology and data flow
- `PROGRESS.md` -- verified feature status and known gaps
- `DECISIONS.md` -- architectural decision records
- `docs/api-contracts.md` -- request/response contracts
- `docs/design-system.md` -- UI guidelines

## License

GPL-3.0 -- see `LICENSE`.
