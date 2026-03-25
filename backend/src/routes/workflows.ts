import { Router } from 'express';
import { z } from 'zod';

import { verifyProjectOwnership } from '../middleware/resourceOwnership.js';
import { getProjectRepository } from '../repositories/projectRepository.js';
import { NdjsonResponseSink } from '../services/workflows/eventSink.js';
import { getPhaseConfig } from '../services/workflows/phaseConfig.js';
// Phase configs self-register when imported
import '../services/workflows/phases/featureEngineering.js';
import '../services/workflows/phases/onboarding.js';
import '../services/workflows/phases/preprocessing.js';
import '../services/workflows/phases/training.js';
import { getWorkflowRepository } from '../services/workflows/repository/index.js';
import { executeWorkflowTurn } from '../services/workflows/turnExecutor.js';
import type { AuthRequest } from '../types/auth.js';

const workflowPhaseSchema = z.enum(['preprocessing', 'feature_engineering', 'training', 'onboarding']);
const reasoningEffortSchema = z.enum(['minimal', 'low', 'medium', 'high', 'xhigh']);

const workflowTurnSchema = z.object({
  projectId: z.string().min(1),
  phase: workflowPhaseSchema,
  prompt: z.string().optional(),
  runId: z.string().min(1).optional(),
  threadId: z.string().min(1).optional(),
  datasetId: z.string().min(1).optional(),
  notebookId: z.string().min(1).optional(),
  targetColumn: z.string().optional(),
  featureSummary: z.string().optional(),
  reasoningEffort: reasoningEffortSchema.optional(),
  model: z.string().optional(),
  // Onboarding-specific fields
  userIntent: z.string().optional(),
  questionAnswers: z.array(z.object({
    questionId: z.string(),
    answer: z.union([z.string(), z.array(z.string())])
  })).optional(),
  round: z.number().optional()
});

const workflowListQuerySchema = z.object({
  projectId: z.string().min(1),
  phase: workflowPhaseSchema.optional()
});

const workflowParamsSchema = z.object({
  runId: z.string().min(1)
});

/** Runs older than this are considered stale and won't block new runs. */
const STALE_RUN_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export function createWorkflowRouter(): Router {
  const router = Router();
  const repository = getWorkflowRepository();
  const projectRepository = getProjectRepository();

  router.post('/workflows/turns/stream', async (req, res) => {
    const parsed = workflowTurnSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid workflow request', details: parsed.error.issues });
    }

    // Concurrency guard — only for new runs (not resumptions)
    if (!parsed.data.runId) {
      const activeRun = await repository.findActiveRun(parsed.data.projectId, parsed.data.phase);
      if (activeRun) {
        const updatedAt = new Date(activeRun.updatedAt).getTime();
        const isStale = Date.now() - updatedAt > STALE_RUN_THRESHOLD_MS;
        if (!isStale) {
          return res.status(409).json({
            error: 'WORKFLOW_ALREADY_RUNNING',
            message: `A ${parsed.data.phase} workflow is already running for this project.`,
            activeRunId: activeRun.runId
          });
        }
      }
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sink = new NdjsonResponseSink(res);
    const phaseConfig = getPhaseConfig(parsed.data.phase);

    try {
      await executeWorkflowTurn(sink, parsed.data, phaseConfig);
      sink.emit({ type: 'done' });
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workflow execution failed';
      if (!res.writableEnded) {
        sink.emit({ type: 'workflow_error', message, retryable: true });
        sink.emit({ type: 'done' });
        res.end();
      }
    }

    return undefined;
  });

  router.get('/workflows', async (req, res) => {
    const parsed = workflowListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid workflow query', details: parsed.error.issues });
    }

    const runs = await repository.listRuns(parsed.data.projectId, parsed.data.phase);
    return res.json({
      projectId: parsed.data.projectId,
      phase: parsed.data.phase,
      runs
    });
  });

  router.get('/workflows/:runId', async (req: AuthRequest, res) => {
    const parsed = workflowParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid workflow id', details: parsed.error.issues });
    }

    const run = await repository.getRun(parsed.data.runId);
    if (!run) {
      return res.status(404).json({ error: 'Workflow run not found' });
    }

    if (req.user && run.run.projectId) {
      const project = await verifyProjectOwnership(run.run.projectId, req.user.user_id, projectRepository);
      if (!project) {
        return res.status(404).json({ error: 'Workflow run not found' });
      }
    }

    return res.json({ run });
  });

  return router;
}
