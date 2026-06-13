# User Guide

## 1. Create a Project

After signing in, create or select a project from the home screen. A project owns datasets, documents, generated workbooks, model records, experiment results, and deployments.

The workspace opens to the project's current phase. Phase access is sequential so users are guided through the lifecycle without losing the ability to revisit earlier work.

## 2. Upload Data and Context

Use **Data Upload** to add:

- datasets: CSV, JSON, or XLSX;
- domain documents: PDF, DOCX, Markdown, text, HTML, XML, YAML, RTF, or other supported document types;
- project notes through planning chat/context views.

Uploaded datasets are parsed, profiled, stored, and associated with the project. Uploaded documents are stored and indexed for search/retrieval.

The planning chat can ask structured follow-up questions, accept attachments, stream a generated project plan, and save approved plans into the project. Approved planning work unlocks the next workflow phase.

## 3. Explore Data

Use **Explorer** to inspect datasets and context before changing anything.

Available actions include:

- browse file tabs for datasets and documents;
- inspect samples, inferred column types, null counts, and row metadata;
- adjust column types where supported;
- run SQL queries against loaded tables;
- ask natural-language questions that stream through schema context, planning, SQL generation, validation, execution, and optional repair before opening a query artifact;
- search uploaded documents.

## 4. Preprocess

Use **Processing** for LLM-assisted data cleaning and transformation.

The agent proposes preprocessing steps, renders them in a reviewable workflow, and writes code into workbook/notebook contexts. Users can approve, adjust, replay, or interrupt runs. Compatibility checks help confirm that selected datasets are suitable for the current preprocessing path.

Processing work is organized into workbooks. Users can create, rename, switch, replay-check, reset, and delete workbooks while keeping notebook recovery scoped to the active phase.

Typical preprocessing work:

- missing value handling;
- type coercion;
- categorical encoding preparation;
- train/test-safe transformations;
- output dataset creation for downstream phases.

## 5. Feature Engineering

Use **Feature Engineering** to create derived features and feature workbooks.

The feature workflow supports generated feature plans, user approval, feature run history, and derived dataset creation. Suggested transformations can include scaling, binning, interactions, temporal features, text features, and encodings, depending on the source columns.

Enabled features feed a readiness report that summarizes added columns, transformation steps, and warnings before the pipeline writes a new derived dataset in CSV, JSON, or XLSX format.

## 6. Training

Use **Training** to run model code in notebook-backed Python runtimes.

Training supports:

- generated starter code and model recommendations;
- explicit model approval when multiple plans are proposed;
- editable Python cells;
- code execution in Docker sessions;
- package install/search;
- runtime health information;
- notebook output rendering, including plots and HTML;
- model records and artifacts.

## 7. Experiments

Use **Experiments** to compare trained models and inspect results.

Available analysis includes:

- model leaderboard and champion comparison;
- CSV export and natural-language filtering for leaderboard views;
- evaluation status and retries;
- ROC/learning curve visualizations where available;
- SHAP explanations;
- error attribution;
- provenance and report panes;
- generated experiment insights;
- tuning workflows for candidate improvement.

## 8. Deployment

Use **Deployment** after a model is ready for serving.

Deployment supports:

- readiness checks;
- deployment creation and start/stop actions;
- restart/delete lifecycle actions;
- prediction playground;
- input schema inspection;
- API key management;
- generated API snippets;
- prediction logs;
- latency/error statistics;
- feedback on predictions;
- drift checks;
- container logs.

## Recovery and Safety

- Use savepoints before risky notebook changes.
- Keep generated code reviewable; do not approve transformations blindly.
- Use the package manager intentionally because runtime network policy may restrict package installation.
- Treat deployment API keys and environment files as secrets.
