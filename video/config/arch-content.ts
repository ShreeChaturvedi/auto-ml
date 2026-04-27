/**
 * Ground-truth content for the architecture section (8 slides / 6 narrative
 * scenes, ~3:39 total). Stage names, tool allowlists, and code snippets are
 * transcribed directly from the backend sources so on-screen text matches the
 * running system.
 *
 * Sources of truth:
 *   - backend/src/services/workflows/graph.ts
 *   - backend/src/services/workflows/phases/training.ts
 *   - backend/src/services/workflows/phases/preprocessing/stageConfig.ts
 *   - backend/src/services/workflows/phases/featureEngineering.ts
 *
 * Pre-rendered Shiki HTML strings live here so the 4 code-segment cards in
 * Scene 5 don't pile up concurrent `delayRender` holds during playback.
 */

// ---- Phase lifecycle stage tables -----------------------------------------

export const TRAINING_STAGES = [
  "answer",
  "configure_experiment",
  "propose_model",
  "generate_code",
  "write_code",
  "execute_training",
  "evaluate_results",
  "await_review",
  "register_model",
  "summarize",
] as const;
export type TrainingStage = (typeof TRAINING_STAGES)[number];

export const PREPROCESSING_STAGES = [
  "answer",
  "plan_step",
  "generate_code",
  "write_code",
  "record_execution",
  "validate",
  "await_approval",
  "commit",
  "summarize",
] as const;

export const FEATURE_ENGINEERING_STAGES = [
  "answer",
  "analyze_data",
  "propose_feature",
  "generate_code",
  "write_code",
  "execute_feature",
  "validate_feature",
  "await_review",
  "register_feature",
  "summarize",
] as const;

// Stage counts for on-screen chips/captions — verified against source.
export const STAGE_COUNTS = {
  preprocessing: PREPROCESSING_STAGES.length, // 9
  featureEngineering: FEATURE_ENGINEERING_STAGES.length, // 10
  training: TRAINING_STAGES.length, // 10
} as const;

// ---- Six core engine nodes -------------------------------------------------

export const ENGINE_NODES = [
  { id: "start", label: "START", tier: "text" },
  { id: "prepare", label: "prepare", tier: "deterministic" },
  { id: "invoke_model", label: "invoke_model", tier: "llm_delegated" },
  { id: "execute_tools", label: "execute_tools", tier: "action" },
  { id: "pause", label: "pause", tier: "deterministic" },
  { id: "complete", label: "complete", tier: "deterministic" },
  { id: "fail", label: "fail", tier: "deterministic" },
] as const;

// ---- NDJSON event pills (9 types) -----------------------------------------

// Verified against backend/src/services/workflows/routes/workflows.ts and
// eventSink.ts. Spoken as "JSON events" (not NDJSON) to avoid TTS mispron.
export const NDJSON_EVENT_TYPES = [
  "state_update",
  "tool_execution",
  "artifact",
  "pause",
  "error",
  "token",
  "thinking",
  "usage",
  "done",
] as const;

// ---- Postgres ledger tables (6) -------------------------------------------

export const LEDGER_TABLES = [
  { key: "workflow_runs", label: "workflow_runs", count: 1247 },
  { key: "workflow_events", label: "workflow_events", count: 18403 },
  { key: "workflow_artifacts", label: "workflow_artifacts", count: 89 },
  { key: "workflow_approvals", label: "workflow_approvals", count: 12 },
  { key: "workflow_handoffs", label: "workflow_handoffs", count: 34 },
  {
    key: "workflow_notebook_bindings",
    label: "workflow_notebook_bindings",
    count: 421,
  },
] as const;

// ---- Code snippets (for Shiki panels) -------------------------------------

/** Scene 2 — `graph.ts` trim (lines 13–33 in backend). */
export const SNIPPET_GRAPH_TS = `export function buildWorkflowGraph() {
  return new StateGraph(InternalWorkflowState)
    .addNode('prepare', buildPhaseRequest)
    .addNode('invoke_model', invokeModelNode)
    .addNode('execute_tools', executeToolsNode)
    .addNode('pause',    async (s) => s)
    .addNode('complete', async (s) => s)
    .addNode('fail',     async (s) => s);
}`;

/** Scene 3 — `STAGE_TOOL_ALLOWLIST` trim (training.ts lines 68–79). */
export const SNIPPET_STAGE_TOOL_ALLOWLIST = `const STAGE_TOOL_ALLOWLIST: Record<string, string[]> = {
  answer:              ['configure_experiment', 'propose_training_plan', ...discovery],
  configure_experiment:['configure_experiment', ...discovery],
  propose_model:       ['configure_experiment', 'propose_training_plan', ...discovery],
  generate_code:       [...training, 'install_package'],
  write_code:          [...training, 'install_package'],
  execute_training:    ['execute_training'],
  // evaluate_results · await_review · register_model · summarize
};`;

/** Scene 5 Beat H — `parseTrainCompleteMetrics` trim (training.ts 926–942). */
export const SNIPPET_PARSE_TRAIN_COMPLETE = `function parseTrainCompleteMetrics(stdout: string) {
  const marker = '__TRAIN_COMPLETE__|';
  const i = stdout.lastIndexOf(marker);
  if (i === -1) return null;
  const line = stdout.slice(i + marker.length).split(/\\r?\\n/, 1)[0]?.trim();
  if (!line) return null;
  try { return JSON.parse(line); } catch { return null; }
}`;

/** Scene 5 Beat C — 4 pre-rendered code segments (for the drop-in cards). */
export const TRAINING_CODE_SEGMENTS = [
  {
    title: "# 1 Imports & Config",
    code: "import xgboost as xgb\nimport pandas as pd",
  },
  {
    title: "# 2 Dataset Prep",
    code: "df = pd.read_parquet(...)\nX, y = df.drop(target, ...)",
  },
  {
    title: "# 3 Model Fit & Eval",
    code: "model = xgb.XGBClassifier(...)\nmodel.fit(X_train, y_train)",
  },
  {
    title: "# 4 Artifact Save",
    code: "joblib.dump(model, 'model.joblib')\nprint(TRAIN_COMPLETE_MARKER)",
  },
] as const;

/** The stdout marker line revealed at the climax of Scene 5. */
export const TRAIN_COMPLETE_MARKER_LINE =
  '__TRAIN_COMPLETE__|{"accuracy":0.912,"f1":0.894,"roc_auc":0.951}';
