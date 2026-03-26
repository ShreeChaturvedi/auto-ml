/**
 * Prompt builder for the structured experiment report.
 *
 * Produces a multi-section markdown document analyzing all models
 * in a project. The LLM is instructed to use exactly 6 H2 sections
 * so the frontend TOC remains consistent across regenerations.
 */

export interface EvalSummary {
  cvMean?: number;
  cvStd?: number;
  cvScoring?: string;
  top5Features?: Array<{ name: string; importance: number }>;
  lastTrainScore?: number;
  lastTestScore?: number;
  classF1Scores?: Record<string, number>;
}

export interface ModelSummary {
  modelId: string;
  name: string;
  algorithm: string;
  taskType: string;
  status: string;
  metrics: Record<string, number>;
  trainingMs?: number;
}

export interface ReportContext {
  projectTitle: string;
  taskType: string;
  models: ModelSummary[];
  evaluations: Record<string, EvalSummary>;
}

export function buildExperimentReportSystemPrompt(): string {
  return `You are an expert ML experiment analyst producing a structured markdown report.

You MUST include exactly these six H2 sections in this order. Do not add, remove, or rename sections:

## Executive Summary
2-3 sentence overview: identify the best-performing model, its standout metric, and one key takeaway.

## Model Performance Rankings
A markdown table ranking all models by their primary metric (descending). Columns: Rank, Model, Algorithm, Primary Metric, and 1-2 secondary metrics. Bold the best model name.

## Metric-by-Metric Analysis
For each major metric, a brief paragraph comparing models. Highlight which model leads and by how much. Use bold for model names.

## Training Efficiency
Analyze training times. Identify the fastest and slowest models, and whether additional training time correlates with better performance. Note cost-performance tradeoffs.

## Recommendations
2-4 actionable next steps based on the results. Be specific: name which model to deploy, what to tune, or what to try next.

## Potential Issues
Flag overfitting risks (train-test gaps), data concerns (class imbalance, small sample size), convergence warnings, or models that underperformed expectations. If no issues, state that briefly.

Rules:
- Return ONLY markdown. No preamble, no closing remarks outside sections.
- Use \`##\` for sections, \`###\` for subsections.
- Use markdown tables for numeric comparisons.
- Use **bold** for model names.
- Only reference data provided in the user message. Never invent statistics.
- If a section has insufficient data, include the header and note the limitation.`;
}

/**
 * Build the user message from server-loaded model + evaluation data.
 *
 * Field whitelist keeps the message compact (~200 tokens per model).
 */
export function buildExperimentReportUserMessage(ctx: ReportContext): string {
  const modelsData = ctx.models.map((m) => {
    const evalData = ctx.evaluations[m.modelId];
    const entry: Record<string, unknown> = {
      name: m.name,
      algorithm: m.algorithm,
      taskType: m.taskType,
      status: m.status,
      metrics: m.metrics,
    };
    if (m.trainingMs != null) entry.trainingMs = m.trainingMs;

    if (evalData) {
      const eval_: Record<string, unknown> = {};
      if (evalData.cvMean != null) eval_.cvMean = round4(evalData.cvMean);
      if (evalData.cvStd != null) eval_.cvStd = round4(evalData.cvStd);
      if (evalData.cvScoring) eval_.cvScoring = evalData.cvScoring;
      if (evalData.lastTrainScore != null) eval_.lastTrainScore = round4(evalData.lastTrainScore);
      if (evalData.lastTestScore != null) eval_.lastTestScore = round4(evalData.lastTestScore);
      if (evalData.top5Features) eval_.topFeatures = evalData.top5Features;
      if (evalData.classF1Scores) eval_.classF1 = evalData.classF1Scores;
      if (Object.keys(eval_).length > 0) entry.evaluation = eval_;
    }

    return entry;
  });

  return JSON.stringify({
    projectTitle: ctx.projectTitle,
    taskType: ctx.taskType,
    modelCount: ctx.models.length,
    models: modelsData,
  });
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Extract a compact eval summary from raw evaluation data read from disk.
 * This is the field whitelist — only these fields are sent to the LLM.
 */
export function extractEvalSummary(raw: Record<string, unknown>): EvalSummary {
  const summary: EvalSummary = {};

  const cv = raw.cross_validation as { mean?: number; std?: number; scoring?: string } | undefined;
  if (cv) {
    if (cv.mean != null) summary.cvMean = cv.mean;
    if (cv.std != null) summary.cvStd = cv.std;
    if (cv.scoring) summary.cvScoring = cv.scoring;
  }

  const lc = raw.learning_curve as {
    train_scores_mean?: number[];
    test_scores_mean?: number[];
  } | undefined;
  if (lc) {
    if (lc.train_scores_mean?.length) summary.lastTrainScore = lc.train_scores_mean[lc.train_scores_mean.length - 1];
    if (lc.test_scores_mean?.length) summary.lastTestScore = lc.test_scores_mean[lc.test_scores_mean.length - 1];
  }

  const fi = raw.feature_importance as {
    permutation?: { features?: string[]; importances_mean?: number[] };
  } | undefined;
  if (fi?.permutation?.features && fi.permutation.importances_mean) {
    const pairs = fi.permutation.features.map((name, i) => ({
      name,
      importance: fi.permutation!.importances_mean![i] ?? 0,
    }));
    pairs.sort((a, b) => b.importance - a.importance);
    summary.top5Features = pairs.slice(0, 5);
  }

  const cr = raw.classification_report as Record<string, unknown> | undefined;
  if (cr) {
    const classF1: Record<string, number> = {};
    for (const [cls, stats] of Object.entries(cr)) {
      if (cls === 'accuracy' || typeof stats === 'number') continue;
      const s = stats as { f1?: number };
      if (s.f1 != null) classF1[cls] = round4(s.f1);
    }
    if (Object.keys(classF1).length > 0) summary.classF1Scores = classF1;
  }

  return summary;
}
