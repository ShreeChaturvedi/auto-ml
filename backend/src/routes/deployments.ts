import { join } from 'node:path';

import { Router, type Response } from 'express';

import { env } from '../config.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireDeploymentOwnership, type DeploymentAuthRequest } from '../middleware/requireDeploymentOwnership.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { createDeploymentRepository } from '../repositories/deploymentRepository.js';
import { createModelRepository } from '../repositories/modelRepository.js';
import * as deploymentManager from '../services/deploymentManager.js';
import type { AuthRequest } from '../types/auth.js';
import { loadModelFile } from '../utils/modelFileLoader.js';
import { resolveTargetColumn } from '../utils/modelUtils.js';

export function createDeploymentsRouter(): Router {
  const router = Router();
  const deploymentRepo = createDeploymentRepository();
  const datasetRepo = createDatasetRepository(env.datasetMetadataPath);
  const modelRepo = createModelRepository(env.modelMetadataPath);

  // POST / — Create deployment
  router.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { modelId, projectId, name } = req.body;
    if (!modelId || !projectId || !name) {
      res.status(400).json({ error: 'modelId, projectId, and name are required' });
      return;
    }
    const deployment = await deploymentManager.deployModel(modelId, projectId, name);
    res.status(201).json({ deployment });
  }));

  // GET / — List deployments for project
  router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
    const projectId = req.query.projectId as string;
    if (!projectId) { res.status(400).json({ error: 'projectId query param required' }); return; }
    const deployments = await deploymentRepo.listByProject(projectId);
    res.json({ deployments });
  }));

  // GET /:id — Get single deployment
  router.get('/:id', requireDeploymentOwnership, asyncHandler(async (req: DeploymentAuthRequest, res: Response) => {
    res.json({ deployment: req.deployment });
  }));

  // DELETE /:id — Delete deployment
  router.delete('/:id', requireDeploymentOwnership, asyncHandler(async (req: DeploymentAuthRequest, res: Response) => {
    await deploymentManager.deleteDeployment(req.deployment!.deploymentId);
    res.status(204).end();
  }));

  // PATCH /:id — Stop or start deployment
  router.patch('/:id', requireDeploymentOwnership, asyncHandler(async (req: DeploymentAuthRequest, res: Response) => {
    const { action } = req.body;
    const deployment = req.deployment!;
    if (action === 'stop') {
      await deploymentManager.stopDeployment(deployment.deploymentId);
    } else if (action === 'start') {
      await deploymentManager.startDeployment(deployment.deploymentId);
    } else {
      res.status(400).json({ error: 'action must be "stop" or "start"' });
      return;
    }
    const updated = await deploymentRepo.getById(deployment.deploymentId);
    res.json({ deployment: updated });
  }));

  // GET /:id/schema — Full schema payload for playground
  router.get('/:id/schema', requireDeploymentOwnership, asyncHandler(async (req: DeploymentAuthRequest, res: Response) => {
    const deployment = req.deployment!;
    const model = await modelRepo.getById(deployment.modelId);
    if (!model) { res.status(404).json({ error: 'Model not found' }); return; }

    // Resolve target column against dataset schema
    const dataset = await datasetRepo.getById(model.datasetId);
    const targetColumn = dataset
      ? resolveTargetColumn(model, dataset.columns)
      : model.targetColumn ?? '';

    // Load evaluation.json and baseline.json from model artifacts
    const modelDir = join(env.modelStorageDir, model.modelId);
    const [evalRaw, baselineRaw] = await Promise.all([
      loadModelFile(join(modelDir, 'evaluation.json')),
      loadModelFile(join(modelDir, 'baseline.json')),
    ]);

    // Treat loaded JSON as typed evaluation data
    type EvalData = {
      cross_validation?: { mean?: number; std?: number; scoring?: string };
      learning_curve?: { train_scores_mean?: number[]; test_scores_mean?: number[] };
      feature_importance?: FeatureImportanceData;
      confusion_matrix?: { labels?: string[] };
      class_distribution?: { test?: Record<string, number> };
    };
    type BaselineData = {
      numeric?: Record<string, unknown>;
      categorical?: Record<string, Record<string, number>>;
      prediction_distribution?: unknown;
    };

    const evaluation = evalRaw as EvalData | null;
    const baseline = baselineRaw as BaselineData | null;

    // Build readiness signals
    const cv = evaluation?.cross_validation;
    const lc = evaluation?.learning_curve;
    const trainScores = lc?.train_scores_mean ?? [];
    const testScores = lc?.test_scores_mean ?? [];
    const trainTestGap = trainScores.length > 0 && testScores.length > 0
      ? (trainScores[trainScores.length - 1] - testScores[testScores.length - 1])
      : 0;

    const fi = evaluation?.feature_importance;
    const permImportances = fi?.permutation?.importances_std ?? [];
    const featureImportanceStable = permImportances.length === 0 || permImportances.every((s) => s < 0.1);

    const classLabels = evaluation?.confusion_matrix?.labels
      ?? (evaluation?.class_distribution?.test ? Object.keys(evaluation.class_distribution.test) : undefined);

    const schema = {
      featureColumns: model.featureColumns ?? [],
      featureTypes: model.featureTypes ?? {},
      sampleRequest: model.sampleRequest ?? {},
      taskType: model.taskType,
      targetColumn,
      featureImportance: buildFeatureImportanceArray(fi),
      classLabels,
      metrics: model.metrics,
      featureRanges: baseline?.numeric ?? {},
      categoricalValues: Object.fromEntries(
        Object.entries(baseline?.categorical ?? {}).map(([k, v]) => [k, Object.keys(v)])
      ),
      predictionDistribution: baseline?.prediction_distribution ?? {},
      readiness: {
        cvStable: cv ? (cv.std ?? 1) < 0.05 : false,
        cvScore: cv?.mean ?? 0,
        cvStd: cv?.std ?? 0,
        overfitRisk: trainTestGap > 0.15 ? 'high' : trainTestGap > 0.08 ? 'medium' : 'low',
        trainTestGap,
        featureImportanceStable,
        sampleCount: model.sampleCount ?? 0,
        evaluationComplete: model.evaluationStatus === 'ready',
      },
    };
    res.json(schema);
  }));

  // GET /:id/logs — Prediction logs (paginated)
  router.get('/:id/logs', requireDeploymentOwnership, asyncHandler(async (req: DeploymentAuthRequest, res: Response) => {
    const { status, startTime, endTime, limit, offset } = req.query;
    const result = await deploymentRepo.getPredictionLogs(req.deployment!.deploymentId, {
      status: status as 'success' | 'error' | undefined,
      startTime: startTime as string | undefined,
      endTime: endTime as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });
    res.json(result);
  }));

  // GET /:id/stats — Aggregate stats
  router.get('/:id/stats', requireDeploymentOwnership, asyncHandler(async (req: DeploymentAuthRequest, res: Response) => {
    const range = (req.query.range as string) ?? '24h';
    const now = new Date();
    const rangeMs: Record<string, number> = { '1h': 3600e3, '6h': 6*3600e3, '24h': 24*3600e3, '7d': 7*24*3600e3 };
    const ms = rangeMs[range] ?? rangeMs['24h'];
    const startTime = new Date(now.getTime() - ms);
    const stats = await deploymentRepo.getHourlyStats(req.deployment!.deploymentId, startTime, now);
    res.json({ stats, range });
  }));

  // POST /:id/drift — Run drift detection
  router.post('/:id/drift', requireDeploymentOwnership, asyncHandler(async (req: DeploymentAuthRequest, res: Response) => {
    const { runDriftDetection } = await import('../services/driftDetection.js');
    const report = await runDriftDetection(req.deployment!);
    res.json(report);
  }));

  // POST /:id/api-keys — Generate API key
  router.post('/:id/api-keys', requireDeploymentOwnership, asyncHandler(async (req: DeploymentAuthRequest, res: Response) => {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'name is required' }); return; }
    const { key, rawKey } = await deploymentRepo.createApiKey(req.deployment!.deploymentId, name);
    res.status(201).json({ key, rawKey });
  }));

  // GET /:id/api-keys — List API keys
  router.get('/:id/api-keys', requireDeploymentOwnership, asyncHandler(async (req: DeploymentAuthRequest, res: Response) => {
    const keys = await deploymentRepo.listApiKeys(req.deployment!.deploymentId);
    res.json({ keys });
  }));

  // DELETE /:id/api-keys/:keyId — Revoke API key
  router.delete('/:id/api-keys/:keyId', requireDeploymentOwnership, asyncHandler(async (req: DeploymentAuthRequest, res: Response) => {
    const ok = await deploymentRepo.revokeApiKey(req.params.keyId, req.deployment!.deploymentId);
    if (!ok) { res.status(404).json({ error: 'API key not found' }); return; }
    res.status(204).end();
  }));

  // POST /:id/logs/:logId/feedback — Thumbs up/down
  router.post('/:id/logs/:logId/feedback', requireDeploymentOwnership, asyncHandler(async (req: DeploymentAuthRequest, res: Response) => {
    const { feedback } = req.body;
    if (!['positive', 'negative'].includes(feedback)) {
      res.status(400).json({ error: 'feedback must be "positive" or "negative"' });
      return;
    }
    const ok = await deploymentRepo.updatePredictionFeedback(parseInt(req.params.logId, 10), feedback);
    if (!ok) { res.status(404).json({ error: 'Log not found' }); return; }
    res.json({ ok: true });
  }));

  // GET /:id/container-logs — Docker container logs
  router.get('/:id/container-logs', requireDeploymentOwnership, asyncHandler(async (req: DeploymentAuthRequest, res: Response) => {
    const deployment = req.deployment!;
    if (!deployment.containerId) { res.status(404).json({ error: 'No container' }); return; }
    try {
      const { execDocker } = await import('../services/dockerUtils.js');
      const { stdout, stderr } = await execDocker(['logs', '--tail', '100', deployment.containerId]);
      res.json({ stdout, stderr });
    } catch {
      res.status(500).json({ error: 'Failed to read container logs' });
    }
  }));

  // POST /:id/pdp — Partial dependence for a single feature
  router.post('/:id/pdp', requireDeploymentOwnership, asyncHandler(async (req: DeploymentAuthRequest, res: Response) => {
    const { feature } = req.body;
    if (!feature) { res.status(400).json({ error: 'feature is required' }); return; }
    // TODO: Implement PDP endpoint via docker exec
    res.json({ feature, values: [], predictions: [] });
  }));

  return router;
}

type FeatureImportanceSource = {
  features?: string[];
  importances_mean?: number[];
  importances?: number[];
  importances_std?: number[];
};

type FeatureImportanceData = {
  permutation?: FeatureImportanceSource;
  model_based?: FeatureImportanceSource;
};

// Helper to flatten feature importance into array format
function buildFeatureImportanceArray(fi: FeatureImportanceData | null | undefined): { name: string; importance: number; std: number }[] {
  if (!fi) return [];
  const source = fi.permutation ?? fi.model_based;
  if (!source) return [];

  const features = source.features ?? [];
  const importances = source.importances_mean ?? source.importances ?? [];
  const stds = source.importances_std ?? Array(features.length).fill(0) as number[];

  return features.map((name, i) => ({
    name,
    importance: importances[i] ?? 0,
    std: stds[i] ?? 0,
  }));
}
