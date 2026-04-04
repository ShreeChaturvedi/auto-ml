import { writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { Router, type Response } from 'express';

import { env } from '../config.js';
import { appLogger } from '../logging/logger.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireProjectOwnership, verifyProjectOwnership } from '../middleware/resourceOwnership.js';
import { getProjectRepository } from '../repositories/projectRepository.js';
import { runErrorAnalysis } from '../services/errorAttributionService.js';
import { validateEvaluationForErrorAnalysis } from '../services/evaluationStatusValidator.js';
import {
  buildModelSummaries,
  computeModelHash,
  loadEvaluationSummaries,
} from '../services/experimentInsights.js';
import { createLlmClient } from '../services/llm/llmClient.js';
import {
  buildExperimentReportSystemPrompt,
  buildExperimentReportUserMessage,
} from '../services/llm/prompts/experimentReport.js';
import { compareModels } from '../services/modelComparison.js';
import { getModelById, listModels } from '../services/modelTraining.js';
import { createNlFilterNormalizer, NlFilterResponseSchema } from '../services/nlFilter/schema.js';
import { buildNlFilterContext, buildNlFilterPrompt } from '../services/nlFilter/service.js';
import { requestStructuredJson } from '../services/nlToSql/structuredRequest.js';
import { runTuningStudy } from '../services/tuningService.js';
import type { AuthRequest } from '../types/auth.js';
import { loadModelFile } from '../utils/modelFileLoader.js';
import { setupNdjsonStream } from '../utils/ndjsonStream.js';


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
    const data = await loadModelFile(filePath);
    if (data) {
      res.json(data);
    } else {
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
    const data = await loadModelFile(filePath);
    if (data) {
      res.json(data);
    } else {
      res.status(404).json({ error: 'SHAP data not found' });
    }
  }));

  // POST /experiments/:projectId/tune — Optuna hyperparameter optimization (NDJSON stream)
  router.post('/:projectId/tune', requireProjectOwnership(projectRepository), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;

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
    setupNdjsonStream(res);

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

  router.post('/:projectId/compare', requireProjectOwnership(projectRepository), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;

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
    const evaluations = new Map<string, unknown>();
    await Promise.all(
      selected.map(async (m) => {
        const data = await loadModelFile(join(env.modelStorageDir, m.modelId, 'evaluation.json'));
        if (data) {
          evaluations.set(m.modelId, data);
        }
      }),
    );

    // Use model comparison service to compute deltas and significance
    const result = compareModels(selected, evaluations);
    res.json(result);
  }));

  // POST /experiments/:projectId/nl-filter — NL → structured filter predicates
  router.post('/:projectId/nl-filter', requireProjectOwnership(projectRepository), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;

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
        // Use the cheap model (nl2sqlModel defaults to mini) — the nl-filter
        // schema is trivial and this endpoint fires on every keystroke.
        client: createLlmClient(env.nl2sqlModel),
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
  router.post('/:projectId/insights', requireProjectOwnership(projectRepository), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;

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
    let allModels: Awaited<ReturnType<typeof listModels>> = [];
    try {
      allModels = (await listModels(projectId)) ?? [];
    } catch {
      // No models available
    }

    const modelSummaries = buildModelSummaries(allModels);
    const modelHash = computeModelHash(projectId, modelSummaries);

    // --- Cache check ---
    {
      const entry = await loadModelFile(cachePath) as Record<string, { modelHash: string; text: string }> | null;
      if (entry && entry[body.type]?.modelHash === modelHash) {
        setupNdjsonStream(res);
        if (typeof res.flushHeaders === 'function') res.flushHeaders();
        res.write(`${JSON.stringify({ type: 'token', content: entry[body.type].text })}\n`);
        res.write(`${JSON.stringify({ type: 'done' })}\n`);
        res.end();
        return;
      }
    }
    {
      // Cache miss or read error — proceed to LLM
    }

    // --- Build prompt (report uses dynamic server-side context, others use body.context) ---
    const isReport = body.type === 'report';
    let systemPrompt: string;
    let userMessage: string;

    if (isReport) {
      systemPrompt = buildExperimentReportSystemPrompt();

      // Load evaluations and project name concurrently
      const [evaluations, project] = await Promise.all([
        loadEvaluationSummaries(modelSummaries),
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
    setupNdjsonStream(res);

    try {
      // Reports need the strong model for long-form prose; all other insight
      // types use the cheap model (mini) — they're short structured outputs.
      const client = isReport ? createLlmClient(undefined, 180_000) : createLlmClient(env.nl2sqlModel);
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
          const cached = await loadModelFile(cachePath);
          if (cached) {
            existing = cached as Record<string, unknown>;
          }
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
    const statusError = validateEvaluationForErrorAnalysis(model?.evaluationStatus);
    if (statusError) {
      res.json({ available: false, reason: statusError });
      return;
    }

    const filePath = join(env.modelStorageDir, modelId, 'error_analysis.json');

    // Try to read a cached result from disk first
    const cached = await loadModelFile(filePath);
    if (cached) {
      res.json(cached);
    } else {
      // Not cached — run error analysis on-demand
      try {
        const result = await runErrorAnalysis(modelId);
        if (result) {
          res.json(result);
        } else {
          res.json({ available: false, reason: 'Error analysis not available' });
        }
      } catch {
        res.json({ available: false, reason: 'Error analysis not available' });
      }
    }
  }));

  return router;
}
