import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Router, type Request, type Response } from 'express';

import { env } from '../config.js';
import { runErrorAnalysis } from '../services/errorAttributionService.js';
import { createLlmClient } from '../services/llm/llmClient.js';
import { runTuningStudy } from '../services/tuningService.js';

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
    'Parse the user\'s natural language filter into structured predicates. Return a JSON object with key \'predicates\' containing an array of objects with \'field\', \'operator\', and \'value\'. Valid fields: \'metrics.accuracy\', \'metrics.f1\', \'metrics.r2\', \'algorithm\', \'taskType\'. Valid operators: \'gt\', \'lt\', \'eq\', \'gte\', \'lte\', \'contains\'. Return ONLY the JSON, no explanation.',
};

const VALID_INSIGHT_TYPES = new Set(Object.keys(INSIGHT_SYSTEM_PROMPTS));

export function createExperimentsRouter(): Router {
  const router = Router();

  // GET /experiments/:modelId/evaluation
  router.get('/:modelId/evaluation', async (req: Request, res: Response) => {
    const { modelId } = req.params;
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
  router.get('/:modelId/shap', async (req: Request, res: Response) => {
    const { modelId } = req.params;
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
  router.post('/:projectId/tune', async (req: Request, res: Response) => {
    const { projectId } = req.params;
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

  router.post('/:projectId/compare', (_req: Request, res: Response) => {
    res.status(501).json({ error: 'Not implemented' });
  });

  // POST /experiments/:projectId/insights — streaming LLM insights (NDJSON)
  router.post('/:projectId/insights', async (req: Request, res: Response) => {
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

  router.get('/:modelId/error-analysis', async (req: Request, res: Response) => {
    const { modelId } = req.params;
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
