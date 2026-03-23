import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Router, type Response } from 'express';

import { env } from '../config.js';
import { verifyProjectOwnership } from '../middleware/resourceOwnership.js';
import { getProjectRepository } from '../repositories/projectRepository.js';
import { runErrorAnalysis } from '../services/errorAttributionService.js';
import { createLlmClient } from '../services/llm/llmClient.js';
import { getModelById, listModels } from '../services/modelTraining.js';
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
  filter:
    'Parse the user\'s natural language filter into structured predicates. Return a JSON object with key \'predicates\' containing an array of objects with \'field\', \'operator\', and \'value\'. Valid fields: \'accuracy\', \'precision\', \'recall\', \'f1\', \'rmse\', \'mae\', \'r2\', \'silhouette\', \'algorithm\', \'name\', \'status\', \'taskType\'. Valid operators: \'gt\', \'lt\', \'eq\', \'gte\', \'lte\', \'contains\'. Return ONLY the JSON, no explanation.',
};

const VALID_INSIGHT_TYPES = new Set(Object.keys(INSIGHT_SYSTEM_PROMPTS));

export function createExperimentsRouter(): Router {
  const router = Router();
  const projectRepository = getProjectRepository();

  // GET /experiments/:modelId/evaluation
  router.get('/:modelId/evaluation', async (req: AuthRequest, res: Response) => {
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
  });

  // GET /experiments/:modelId/shap
  router.get('/:modelId/shap', async (req: AuthRequest, res: Response) => {
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
  });

  // POST /experiments/:projectId/tune — Optuna hyperparameter optimization (NDJSON stream)
  router.post('/:projectId/tune', async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;

    if (req.user) {
      const project = await verifyProjectOwnership(projectId, req.user.user_id, projectRepository);
      if (!project) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
    }

    const body = req.body as {
      modelId?: string;
      nTrials?: number;
      metric?: string;
      timeoutSeconds?: number;
    };

    // Validate required fields
    if (!body.modelId || typeof body.modelId !== 'string') {
      res.status(400).json({ error: 'modelId is required.' });
      return;
    }
    if (!body.nTrials || typeof body.nTrials !== 'number' || body.nTrials < 1 || body.nTrials > 200) {
      res.status(400).json({ error: 'nTrials must be a number between 1 and 200.' });
      return;
    }
    if (!body.metric || typeof body.metric !== 'string') {
      res.status(400).json({ error: 'metric is required.' });
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
        body.modelId,
        body.nTrials,
        body.metric,
        body.timeoutSeconds ?? 600,
        res,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!res.writableEnded) {
        res.write(`${JSON.stringify({ type: 'error', message })}\n`);
        res.end();
      }
    }
  });

  router.post('/:projectId/compare', async (req: AuthRequest, res: Response) => {
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
  });

  // POST /experiments/:projectId/insights — streaming LLM insights (NDJSON)
  router.post('/:projectId/insights', async (req: AuthRequest, res: Response) => {
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

    // Set NDJSON streaming headers
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    try {
      const client = createLlmClient();
      const systemPrompt = INSIGHT_SYSTEM_PROMPTS[body.type];
      const userMessage = JSON.stringify(body.context ?? {});

      await client.stream(
        {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
          maxOutputTokens: 1024,
          responseMimeType: body.type === 'filter' ? 'application/json' : undefined,
        },
        {
          onToken(token: string) {
            if (!res.writableEnded) {
              res.write(`${JSON.stringify({ type: 'token', content: token })}\n`);
            }
          },
        },
      );

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
  });

  router.get('/:modelId/error-analysis', async (req: AuthRequest, res: Response) => {
    const { modelId } = req.params;

    if (req.user) {
      const model = await getModelById(modelId);
      if (model?.projectId) {
        const project = await verifyProjectOwnership(model.projectId, req.user.user_id, projectRepository);
        if (!project) {
          res.status(404).json({ error: 'Error analysis not available' });
          return;
        }
      }
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
  });

  return router;
}
