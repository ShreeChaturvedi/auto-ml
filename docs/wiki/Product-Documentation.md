# Product Documentation

The Agentic AutoML Platform is a human-in-the-loop machine-learning workspace. It is built for users who need to inspect data, express domain intent, generate transformations and model code, compare outcomes, and deploy a trained model without stitching together separate notebooks, scripts, dashboards, and serving tools.

## Product Goals

- Make the ML lifecycle visible and navigable through a phase-based workspace.
- Keep automation reviewable through approval gates, editable code cells, savepoints, and streaming workflow logs.
- Ground LLM assistance in actual project artifacts: datasets, column metadata, documents, notebook state, model results, and deployment telemetry.
- Support both low-friction default paths and expert control through SQL editors, notebook cells, package management, and manual model operations.
- Preserve enough audit trail to understand what data, transformations, code, models, and deployment actions produced an outcome.

## Primary Personas

| Persona | Need |
| --- | --- |
| Domain analyst | Upload business data and context, ask questions, review automated recommendations, and understand model behavior. |
| Data scientist | Inspect generated preprocessing/training code, adjust features, run experiments, compare candidates, and review explainability outputs. |
| Developer/operator | Configure runtime services, validate APIs, manage environments, run tests, and monitor deployed inference services. |

## Core Capabilities

- Project workspaces with color-themed navigation and sequential phase unlocking.
- Dataset ingestion for CSV, JSON, and XLSX files with schema inference, sampling, profiling, and table loading.
- Document ingestion for business context, retrieval, and document search.
- SQL and natural-language querying with streaming NL-to-SQL progress events, validation, execution, and repair.
- LLM workflow streaming for onboarding, preprocessing, feature engineering, and training.
- Notebook-backed workbooks with Python code cells, markdown cells, outputs, savepoints, recovery, cell locking, and WebSocket updates.
- Docker-sandboxed Python execution with package install support and runtime health checks.
- Model training, seed models, evaluation, SHAP, error attribution, model comparison, NL filters, insights, and Optuna-style tuning.
- Deployment readiness, model serving containers, prediction playgrounds, API keys, prediction logs, hourly stats, drift checks, feedback, and container logs.

## Supporting Pages

- [Requirements](Product-Documentation/Requirements)
- [Product Designs](Product-Documentation/Product-Designs)
- [User Guide](Product-Documentation/User-Guide)
- [New Team Handoff](Product-Documentation/New-Team-Handoff)
- [Architecture](Product-Documentation/Architecture)
- [Backend and API](Product-Documentation/Backend-and-API)
- [API Reference](Product-Documentation/API-Reference)
- [Frontend Architecture](Product-Documentation/Frontend-Architecture)
- [Developer Operations](Product-Documentation/Developer-Operations)
- [Testing and Evaluation](Product-Documentation/Testing-and-Evaluation)
- [Deployment and Runtime](Product-Documentation/Deployment-and-Runtime)
- [Constraints and Limitations](Product-Documentation/Constraints-and-Limitations)
