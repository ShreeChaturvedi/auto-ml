import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../middleware/asyncHandler.js';
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

  router.post('/workflows/turns/stream', asyncHandler(async (req, res) => {
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
    } catch {
      // The executor already emitted workflow_state and workflow_error with a
      // structured code, and persisted the failure to the DB. Here we only
      // ensure the response is closed cleanly — never double-emit the error.
      if (!res.writableEnded) {
        sink.emit({ type: 'done' });
        res.end();
      }
    }

    return undefined;
  }));

  const interruptBodySchema = z.object({
    reason: z.string().max(500).optional()
  });

  router.post('/workflows/:runId/interrupt', asyncHandler(async (req: AuthRequest, res) => {
    const paramsParsed = workflowParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return res.status(400).json({ error: 'Invalid workflow id', details: paramsParsed.error.issues });
    }

    const bodyParsed = interruptBodySchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) {
      return res.status(400).json({ error: 'Invalid interrupt body', details: bodyParsed.error.issues });
    }

    const snapshot = await repository.getRun(paramsParsed.data.runId);
    if (!snapshot) {
      return res.status(404).json({ error: 'Workflow run not found' });
    }

    if (req.user && snapshot.run.projectId) {
      const project = await verifyProjectOwnership(snapshot.run.projectId, req.user.user_id, projectRepository);
      if (!project) {
        return res.status(404).json({ error: 'Workflow run not found' });
      }
    }

    // Idempotent: only flip runs that are still active.
    const isActive = snapshot.run.status === 'running' || snapshot.run.status === 'paused';
    if (!isActive) {
      return res.json({ run: snapshot.run, interrupted: false });
    }

    const reason = bodyParsed.data.reason ?? 'Interrupted by user.';
    const updated = await repository.saveRun({
      ...snapshot.run,
      status: 'interrupted',
      pendingInputKind: undefined,
      pauseReason: undefined,
      lastFailureCode: 'USER_INTERRUPTED',
      lastFailureMessage: reason
    });

    await repository.appendEvent(updated.runId, 'workflow_interrupted', { reason });

    return res.json({ run: updated, interrupted: true });
  }));

  router.get('/workflows', asyncHandler(async (req, res) => {
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
  }));

  router.get('/workflows/:runId', asyncHandler(async (req: AuthRequest, res) => {
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
  }));

  return router;
}
