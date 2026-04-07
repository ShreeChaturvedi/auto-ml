/**
 * Feature engineering lifecycle contract prompt.
 *
 * Defines the 6-step lifecycle that the LLM must follow when the
 * feature_engineering phase is driven through the unified workflow graph.
 */
export const FEATURE_ENGINEERING_CONTRACT = `
## Feature Engineering Lifecycle Contract

You are driving a structured 6-step feature engineering lifecycle.
Every feature MUST progress through the following stages in order.
Do NOT skip stages or combine multiple stages into one tool call.

### Stage 1: propose_feature
- Declare the feature intent: name, source columns, method, rationale, expected impact.
- **CRITICAL: sourceColumns MUST be columns that exist in the ACTIVE dataset's schema** (listed in the user message under "Columns:"). Do NOT reference columns from other datasets you see via list_project_files — only the active dataset is valid for feature proposals in this phase.
- Do NOT generate any code in this tool call; materialize_feature_code is a separate step.
- Proposals are declarative — they do NOT pause the workflow. If the user has already enabled features, proceed directly to materialize_feature_code after proposing.

### Stage 2: materialize_feature_code
- Write **FINAL, executable** Python code for the proposed feature. **NEVER emit placeholder comments, stubs, or "deferred" code.** A comment-only string like "# Placeholder: to be filled later" will be rejected.
- The code MUST reference the \`df\` dataframe and mutate it to create the declared output columns (e.g., \`df["salary_log"] = np.log1p(df["salary"])\`).
- The code must be self-contained and safe to run in a sandboxed notebook cell.
- **outputColumns is REQUIRED** — pass a non-empty list containing the exact column names your code creates in df (e.g., \`["salary_log"]\`). Do NOT use the literal string "placeholder" or empty strings.
- When implementing multiple features, call materialize_feature_code **one feature at a time** with complete final code for each, never emit batch stubs.
- Include brief comments explaining each transformation step.

### Stage 3: execute_feature
- Run the materialized code via a notebook cell.
- Capture stdout, stderr, and execution success/failure.
- If execution fails, revise the code using edit_cell, then re-execute the cell before proceeding.
- After editing a cell, you MUST run it again — an edit alone does not count as execution.
- Do NOT skip to validation until execution succeeds.

### Stage 4: validate_feature
- Check the feature for:
  - Null rate (fraction of missing values)
  - Correlation with target column (if available)
  - Leakage risk assessment (none / low / medium / high)
  - Distribution quality (skew, outliers, constant columns)
- Flag features that require user approval before registration.

### Stage 5: register_feature
- Commit the validated feature to the pipeline registry.
- If the feature was flagged for approval, wait for user decision.
- Record the feature in project metadata.
- For features explicitly enabled by the user for implementation, treat that enablement as approval and register with approved=true unless the user explicitly rejects.

### Stage 6: checkpoint_feature_pipeline
- After registering one or more features, snapshot the pipeline state.
- Include all registered feature IDs and the associated dataset.
- This enables reproducibility and rollback.

### Rules
- Always call propose_feature before materialize_feature_code.
- Always call execute_feature before validate_feature.
- Always call validate_feature before register_feature.
- Never register a feature that has not been validated.
- Do not auto-reject user-enabled features. If additional confirmation is needed, ask the user first.
- If a step fails, diagnose the issue and retry that step — do NOT skip ahead.
- After using edit_cell to fix code, always re-execute the cell — the system will reject validation of unexecuted edits.
- **Only propose features on columns present in the active dataset's schema** (listed in the user message). If you see other datasets via list_project_files, ignore their columns for feature proposals — they belong to other workbooks.
- **Never emit placeholder or stub code** in materialize_feature_code. The system rejects any code that does not reference df or that contains only comments. Write final executable code on the first call; if you need to revise, call materialize_feature_code again with the corrected code.
- **materialize_feature_code requires outputColumns** — it is a required field, must be non-empty, and must contain the actual column names your code produces.
- After completing all tool work, end the turn with render_ui or ask_user.
- Use ask_user when blocked by missing information or when approval is required.
`.trim();
