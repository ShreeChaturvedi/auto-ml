import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { Router, type Response } from 'express';

import { env } from '../config.js';
import { appLogger } from '../logging/logger.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { verifyProjectOwnership } from '../middleware/resourceOwnership.js';
import { getProjectRepository } from '../repositories/projectRepository.js';
import { runErrorAnalysis } from '../services/errorAttributionService.js';
import { createLlmClient } from '../services/llm/llmClient.js';
import {
  buildExperimentReportSystemPrompt,
  buildExperimentReportUserMessage,
  extractEvalSummary,
} from '../services/llm/prompts/experimentReport.js';
import { getModelById, listModels } from '../services/modelTraining.js';
import { createNlFilterNormalizer, NlFilterResponseSchema } from '../services/nlFilter/schema.js';
import { buildNlFilterContext, buildNlFilterPrompt } from '../services/nlFilter/service.js';
import { requestStructuredJson } from '../services/nlToSql/structuredRequest.js';
import { runTuningStudy } from '../services/tuningService.js';
import type { AuthRequest } from '../types/auth.js';
import type { ComparisonResult, EvaluationResult } from '../types/experiments.js';

// ---------------------------------------------------------------------------
// Welch's t-test for comparing two sets of cross-validation scores
// ---------------------------------------------------------------------------

function welchTTest(a: number[], b: number[]): number {
  const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = (arr: number[], m: number) => arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);

  const mA = mean(a), mB = mean(b);
  const vA = variance(a, mA), vB = variance(b, mB);
  const nA = a.length, nB = b.length;
  const se = Math.sqrt(vA / nA + vB / nB);
  if (se === 0) return 1;

  const t = Math.abs(mA - mB) / se;
  // Welch-Satterthwaite degrees of freedom
  const num = (vA / nA + vB / nB) ** 2;
  const den = (vA / nA) ** 2 / (nA - 1) + (vB / nB) ** 2 / (nB - 1);
  const df = num / den;
  // Approximate two-tailed p-value via regularized incomplete beta function
  return tDistPValue(t, df);
}

/** Approximate two-tailed p-value for Student's t-distribution using the incomplete beta function. */
function tDistPValue(t: number, df: number): number {
  const x = df / (df + t * t);
  return regularizedIncompleteBeta(x, df / 2, 0.5);
}

/** Regularized incomplete beta function I_x(a,b) via continued fraction (Lentz's method). */
function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) / a;

  // Lentz continued fraction
  const maxIter = 200;
  const eps = 1e-14;
  let f = 1, c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < eps) d = eps;
  d = 1 / d;
  f = d;

  for (let i = 1; i <= maxIter; i++) {
    const m = i;
    // even step
    let num = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + num * d; if (Math.abs(d) < eps) d = eps; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < eps) c = eps;
    f *= d * c;
    // odd step
    num = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d; if (Math.abs(d) < eps) d = eps; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < eps) c = eps;
    f *= d * c;

    if (Math.abs(d * c - 1) < eps) break;
  }

  return front * f;
}

/** Lanczos approximation for ln(Gamma(x)). */
function lnGamma(x: number): number {
  const g = 7;
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  }
  x -= 1;
  let a = coef[0];
  for (let i = 1; i < g + 2; i++) a += coef[i] / (x + i);
  const t = x + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// ---------------------------------------------------------------------------
// Insight type → system prompt mapping
// ---------------------------------------------------------------------------

const INSIGHT_SYSTEM_PROMPTS: Record<string, string> = {
  banner:
    'You are an ML experiment analyst. Summarize the state of the model experiments in 2-3 sentences. Focus on: best model performance, key differences between models, and one actionable suggestion. Only reference metric values that appear in the provided data. Do not invent statistics.',
  explain:
    'Explain this metric in the context of the user\'s model. Be specific about what the value means for their use case. Keep it under 3 sentences. Only reference values from the provided data.',
  compare:
    'Compare these models. Identify the winner, explain key tradeoffs, and recommend which to deploy. Keep it under 5 sentences. Only reference values from the provided data.',
  error_narrative:
    'Analyze the error patterns in this model. Explain what types of samples are hardest to predict and suggest improvements. Keep it under 4 sentences. Only reference values from the provided data.',
};

const VALID_INSIGHT_TYPES = new Set([...Object.keys(INSIGHT_SYSTEM_PROMPTS), 'report']);

export function createExperimentsRouter(): Router {
  const router = Router();
  const projectRepository = getProjectRepository();

  // GET /experiments/:modelId/evaluation
  router.get('/:modelId/evaluation', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { modelId } = req.params;

    if (req.user) {
      const model = await getModelById(modelId);
      if (model?.projectId) {
        const project = await verifyProjectOwnership(model.projectId, req.user.user_id, projectRepository);
        if (!project) {
          res.status(404).json({ error: 'Evaluation not found' });
          return;
        }
      }
    }

    const filePath = join(env.modelStorageDir, modelId, 'evaluation.json');

    try {
      const raw = await readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      res.json(data);
    } catch {
      res.status(404).json({ error: 'Evaluation not found' });
    }
  }));

  // GET /experiments/:modelId/shap
  router.get('/:modelId/shap', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { modelId } = req.params;

    if (req.user) {
      const model = await getModelById(modelId);
      if (model?.projectId) {
        const project = await verifyProjectOwnership(model.projectId, req.user.user_id, projectRepository);
        if (!project) {
          res.status(404).json({ error: 'SHAP data not found' });
          return;
        }
      }
    }

    const filePath = join(env.modelStorageDir, modelId, 'shap.json');

    try {
      const raw = await readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      res.json(data);
    } catch {
      res.status(404).json({ error: 'SHAP data not found' });
    }
  }));

  // POST /experiments/:projectId/tune — Optuna hyperparameter optimization (NDJSON stream)
  router.post('/:projectId/tune', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;

    if (req.user) {
      const project = await verifyProjectOwnership(projectId, req.user.user_id, projectRepository);
      if (!project) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
    }

    const { modelId, nTrials, metric, timeoutSeconds, sampler } = req.body as {
      modelId?: string;
      nTrials?: number;
      metric?: string;
      timeoutSeconds?: number;
      sampler?: string;
    };

    // Validate required fields
    if (!modelId || typeof modelId !== 'string') {
      res.status(400).json({ error: 'modelId is required.' });
      return;
    }
    if (!nTrials || typeof nTrials !== 'number' || nTrials < 1 || nTrials > 200) {
      res.status(400).json({ error: 'nTrials must be a number between 1 and 200.' });
      return;
    }
    if (!metric || typeof metric !== 'string') {
      res.status(400).json({ error: 'metric is required.' });
      return;
    }
    if (sampler && sampler !== 'tpe' && sampler !== 'random') {
      res.status(400).json({ error: 'sampler must be "tpe" or "random"' });
      return;
    }

    // Set NDJSON streaming headers
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    try {
      await runTuningStudy(
        projectId,
        modelId,
        nTrials,
        metric,
        timeoutSeconds ?? 600,
        res,
        { sampler: (sampler as 'tpe' | 'random') ?? 'tpe' },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!res.writableEnded) {
        res.write(`${JSON.stringify({ type: 'error', message })}\n`);
        res.end();
      }
    }
  }));

  router.post('/:projectId/compare', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;

    if (req.user) {
      const project = await verifyProjectOwnership(projectId, req.user.user_id, projectRepository);
      if (!project) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
    }

    const body = req.body as { modelIds?: string[] };
    if (!Array.isArray(body.modelIds) || body.modelIds.length < 2 || body.modelIds.length > 5) {
      res.status(400).json({ error: 'modelIds must be an array of 2-5 model IDs.' });
      return;
    }

    // Fetch models belonging to this project
    const projectModels = await listModels(projectId);
    const selected = body.modelIds
      .map((id) => projectModels.find((m) => m.modelId === id))
      .filter((m): m is NonNullable<typeof m> => m != null);

    if (selected.length < 2) {
      res.status(404).json({ error: 'Could not find at least 2 of the requested models in this project.' });
      return;
    }

    // Read evaluation data for each model (best-effort)
    const evaluations = new Map<string, EvaluationResult>();
    await Promise.all(
      selected.map(async (m) => {
        try {
          const raw = await readFile(join(env.modelStorageDir, m.modelId, 'evaluation.json'), 'utf8');
          evaluations.set(m.modelId, JSON.parse(raw) as EvaluationResult);
        } catch {
          // Evaluation data not available for this model -- skip
        }
      }),
    );

    // Build models array
    const models: ComparisonResult['models'] = selected.map((m) => ({
      modelId: m.modelId,
      name: m.name,
      metrics: m.metrics,
    }));

    // Compute deltas across all shared metric keys
    const metricKeys = Array.from(new Set(selected.flatMap((m) => Object.keys(m.metrics))));
    const deltas: ComparisonResult['deltas'] = metricKeys.map((metric) => {
      const values = selected.map((m) => m.metrics[metric] ?? NaN);
      const valid = values.filter((v) => Number.isFinite(v));
      const best = valid.length > 0 ? Math.max(...valid) : 0;
      const worst = valid.length > 0 ? Math.min(...valid) : 0;

      const entry: ComparisonResult['deltas'][number] = {
        metric,
        values,
        delta: best - worst,
      };

      // Compute p-value from cross-validation scores when available for exactly 2 models
      if (selected.length === 2) {
        const cvA = evaluations.get(selected[0].modelId)?.cross_validation?.scores;
        const cvB = evaluations.get(selected[1].modelId)?.cross_validation?.scores;
        if (cvA && cvB && cvA.length >= 2 && cvB.length >= 2) {
          const pVal = welchTTest(cvA, cvB);
          if (Number.isFinite(pVal)) {
            entry.pValue = pVal;
            entry.significant = pVal < 0.05;
          }
        }
      }

      return entry;
    });

    const result: ComparisonResult = { models, deltas };
    res.json(result);
  }));

  // POST /experiments/:projectId/nl-filter — NL → structured filter predicates
  router.post('/:projectId/nl-filter', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;

    if (req.user) {
      const project = await verifyProjectOwnership(projectId, req.user.user_id, projectRepository);
      if (!project) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
    }

    const query = typeof req.body?.query === 'string' ? (req.body.query as string).trim() : '';
    if (!query) {
      res.status(400).json({ error: 'query is required.' });
      return;
    }

    try {
      const models = await listModels(projectId);
      const ctx = buildNlFilterContext(models);
      const systemPrompt = buildNlFilterPrompt(ctx);
      const normalizer = createNlFilterNormalizer(ctx);

      const result = await requestStructuredJson({
        client: createLlmClient(),
        systemPrompt,
        userPrompt: query,
        schema: NlFilterResponseSchema,
        label: 'nl-filter',
        normalize: normalizer,
        maxOutputTokens: 300,
      });

      res.json({ predicates: result.predicates });
    } catch (err) {
      appLogger.warn('[nl-filter] failed, returning empty predicates', {
        error: err instanceof Error ? err.message : String(err),
      });
      res.json({ predicates: [] });
    }
  }));

  // POST /experiments/:projectId/insights — streaming LLM insights (NDJSON)
  router.post('/:projectId/insights', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;

    if (req.user) {
      const project = await verifyProjectOwnership(projectId, req.user.user_id, projectRepository);
      if (!project) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
    }

    const body = req.body as { type?: string; context?: Record<string, unknown> };

    // Validate required field
    if (!body.type || !VALID_INSIGHT_TYPES.has(body.type)) {
      res.status(400).json({
        error: `type is required and must be one of: ${[...VALID_INSIGHT_TYPES].join(', ')}`,
      });
      return;
    }

    // --- Load models and compute cache hash ---
    const cachePath = join(env.insightsCacheDir, `${projectId}.json`);
    let modelHash = '';
    let allModels: Awaited<ReturnType<typeof listModels>> = [];
    try {
      allModels = (await listModels(projectId)) ?? [];
    } catch {
      // No models available
    }

    const modelSummaries = allModels
      .map(m => ({ modelId: m.modelId, name: m.name, algorithm: m.algorithm, taskType: m.taskType, status: m.status, metrics: m.metrics }))
      .sort((a, b) => a.modelId.localeCompare(b.modelId));
    modelHash = createHash('sha256').update(projectId + JSON.stringify(modelSummaries)).digest('hex');

    // --- Cache check ---
    try {
      const raw = await readFile(cachePath, 'utf8');
      const entry = JSON.parse(raw) as Record<string, { modelHash: string; text: string }>;
      if (entry[body.type]?.modelHash === modelHash) {
        res.status(200);
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        if (typeof res.flushHeaders === 'function') res.flushHeaders();
        res.write(`${JSON.stringify({ type: 'token', content: entry[body.type].text })}\n`);
        res.write(`${JSON.stringify({ type: 'done' })}\n`);
        res.end();
        return;
      }
    } catch {
      // Cache miss or read error — proceed to LLM
    }

    // --- Build prompt (report uses dynamic server-side context, others use body.context) ---
    const isReport = body.type === 'report';
    let systemPrompt: string;
    let userMessage: string;

    if (isReport) {
      systemPrompt = buildExperimentReportSystemPrompt();

      // Load evaluations and project name concurrently
      const evaluations: Record<string, ReturnType<typeof extractEvalSummary>> = {};
      const [, project] = await Promise.all([
        Promise.all(
          allModels.map(async (m) => {
            try {
              const raw = await readFile(join(env.modelStorageDir, m.modelId, 'evaluation.json'), 'utf8');
              evaluations[m.modelId] = extractEvalSummary(JSON.parse(raw));
            } catch { /* eval not available */ }
          }),
        ),
        projectRepository.getById(projectId),
      ]);

      userMessage = buildExperimentReportUserMessage({
        projectTitle: project?.name ?? projectId,
        taskType: allModels[0]?.taskType ?? 'classification',
        models: modelSummaries,
        evaluations,
      });
    } else {
      systemPrompt = INSIGHT_SYSTEM_PROMPTS[body.type];
      userMessage = JSON.stringify(body.context ?? {});
    }

    // Set NDJSON streaming headers
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    try {
      const client = isReport ? createLlmClient(undefined, 180_000) : createLlmClient();
      let accumulated = '';

      await client.stream(
        {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
          maxOutputTokens: isReport ? 4096 : 1024,
        },
        {
          onToken(token: string) {
            accumulated += token;
            if (!res.writableEnded) {
              res.write(`${JSON.stringify({ type: 'token', content: token })}\n`);
            }
          },
        },
      );

      // Persist to cache (merge with existing entries for other insight types)
      if (modelHash && accumulated) {
        try {
          await mkdir(dirname(cachePath), { recursive: true });
          let existing: Record<string, unknown> = {};
          try {
            existing = JSON.parse(await readFile(cachePath, 'utf8'));
          } catch { /* no existing cache */ }
          const updated = {
            ...existing,
            [body.type]: { modelHash, text: accumulated, generatedAt: new Date().toISOString() },
          };
          writeFileSync(cachePath, JSON.stringify(updated, null, 2), 'utf8');
        } catch {
          // Cache write error — non-fatal
        }
      }

      if (!res.writableEnded) {
        res.write(`${JSON.stringify({ type: 'done' })}\n`);
        res.end();
      }
    } catch {
      // Graceful degradation — never throw on LLM failure
      if (!res.writableEnded) {
        res.write(`${JSON.stringify({ type: 'error' })}\n`);
        res.end();
      }
    }
  }));

  router.get('/:modelId/error-analysis', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { modelId } = req.params;
    const model = await getModelById(modelId);

    if (req.user) {
      if (model?.projectId) {
        const project = await verifyProjectOwnership(model.projectId, req.user.user_id, projectRepository);
        if (!project) {
          res.status(404).json({ error: 'Error analysis not available' });
          return;
        }
      }
    }

    // Check evaluation status before attempting error analysis
    if (model?.evaluationStatus === 'pending' || model?.evaluationStatus === 'computing') {
      res.status(404).json({ error: 'Evaluation still in progress' });
      return;
    }
    if (model?.evaluationStatus === 'failed') {
      res.status(404).json({ error: 'Evaluation failed; error analysis unavailable' });
      return;
    }

    const filePath = join(env.modelStorageDir, modelId, 'error_analysis.json');

    try {
      // Try to read a cached result from disk first
      const raw = await readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      res.json(data);
    } catch {
      // Not cached — run error analysis on-demand
      try {
        const result = await runErrorAnalysis(modelId);
        if (result) {
          res.json(result);
        } else {
          res.status(404).json({ error: 'Error analysis not available' });
        }
      } catch {
        res.status(404).json({ error: 'Error analysis not available' });
      }
    }
  }));

  return router;
}
