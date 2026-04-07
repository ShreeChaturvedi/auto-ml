import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

import cors from 'cors';
import express, { type NextFunction, Request, Response, Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

import { env } from './config.js';
import { getDbPool, hasDatabaseConfiguration } from './db.js';
import { appLogger } from './logging/logger.js';
import { requireAuth } from './middleware/auth.js';
import { deploymentRateLimit } from './middleware/deploymentRateLimit.js';
import { requestContextMiddleware } from './middleware/requestContext.js';
import { requestTimingMiddleware } from './middleware/requestTiming.js';
import { requireDeploymentAuth, type PredictRequest } from './middleware/requireDeploymentAuth.js';
import { requireProjectAccess } from './middleware/requireProjectAccess.js';
import { createDatasetRepository } from './repositories/datasetRepository.js';
import { createDeploymentRepository } from './repositories/deploymentRepository.js';
import { createProjectRepository } from './repositories/projectRepository.js';
import { registerAuthRoutes } from './routes/auth.js';
import { createDatasetUploadRouter } from './routes/datasets.js';
import { createDeploymentsRouter } from './routes/deployments.js';
import { createDocumentRouter } from './routes/documents.js';
import executionRouter from './routes/execution.js';
import { createExperimentsRouter } from './routes/experiments.js';
import { createFeatureEngineeringRouter } from './routes/featureEngineering.js';
import { registerHealthRoutes } from './routes/health.js';
import { createLlmRouter } from './routes/llm/index.js';
import { createMcpRouter } from './routes/mcp.js';
import modelRouter from './routes/models.js';
import notebookRouter from './routes/notebooks.js';
import { createPlanChatRouter } from './routes/planChats.js';
import { createPreprocessingRouter } from './routes/preprocessing.js';
import { registerProjectRoutes } from './routes/projects.js';
import { createQueryRouter } from './routes/query.js';
import { createRealtimeSessionRouter } from './routes/realtimeSession.js';
import { createSettingsRouter } from './routes/settings.js';
import { createWorkflowRouter } from './routes/workflows.js';
import * as deploymentManager from './services/deploymentManager.js';

export function createApp() {
  const app = express();
  const projectRepository = createProjectRepository(env.storagePath);
  const datasetRepository = createDatasetRepository(env.datasetMetadataPath);

  app.set('trust proxy', true);
  app.use(
    cors({
      origin: env.allowedOrigins,
      credentials: true
    })
  );
  app.use(requestContextMiddleware);
  app.use(requestTimingMiddleware);

  // Predict proxy -- mounted before express.json() to preserve raw body stream
  if (hasDatabaseConfiguration()) {
    const predictDeploymentRepo = createDeploymentRepository();

    app.use(
      '/api/deployments/:deploymentId/predict',
      requireDeploymentAuth,
      deploymentRateLimit,
      createProxyMiddleware({
        target: 'http://127.0.0.1:8000', // dynamic via router
        selfHandleResponse: true,
        router: async (req: IncomingMessage) => {
          const predictReq = req as PredictRequest;
          const deployment = predictReq.deployment;
          if (!deployment) throw new Error('No deployment');
          const entry = deploymentManager.getDeploymentFromCache(deployment.deploymentId);
          if (!entry || entry.status !== 'healthy') throw new Error('Deployment not available');
          return `http://127.0.0.1:${entry.port}`;
        },
        pathRewrite: { '^/api/deployments/[^/]+/predict': '/predict' },
        on: {
          proxyRes: async (proxyRes, req: IncomingMessage, res: ServerResponse) => {
            const startTime = Date.now();
            const chunks: Buffer[] = [];
            const predictReq = req as PredictRequest;
            proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on('end', async () => {
              const body = Buffer.concat(chunks).toString();
              // Forward to client first
              res.statusCode = proxyRes.statusCode ?? 200;
              for (const [k, v] of Object.entries(proxyRes.headers)) {
                if (v) res.setHeader(k, v);
              }
              res.end(body);
              // Log asynchronously
              try {
                const parsed = JSON.parse(body);
                const deployment = predictReq.deployment;
                if (deployment) {
                  const latencyMs = Date.now() - startTime;
                  const hourBucket = new Date();
                  hourBucket.setMinutes(0, 0, 0);

                  await predictDeploymentRepo.insertPredictionLog({
                    deploymentId: deployment.deploymentId,
                    modelId: deployment.modelId,
                    projectId: deployment.projectId,
                    createdAt: new Date().toISOString(),
                    latencyMs,
                    inputFeatures: (predictReq as PredictRequest & { body?: Record<string, unknown> }).body ?? {},
                    prediction: parsed,
                    status: proxyRes.statusCode === 200 ? 'success' : 'error',
                    metadata: {},
                  });

                  await predictDeploymentRepo.upsertHourlyStats(deployment.deploymentId, hourBucket, {
                    requestCount: 1,
                    errorCount: proxyRes.statusCode !== 200 ? 1 : 0,
                    latencyAvg: latencyMs,
                  });
                }
              } catch {
                /* don't fail prediction on log error */
              }
            });
          },
          error: (_err: Error, _req: IncomingMessage, res: ServerResponse | Socket) => {
            if (!('writeHead' in res)) return;
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Deployment unavailable' }));
            }
          },
        },
      }),
    );
  }

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  const router = Router();
  registerHealthRoutes(router);
  if (hasDatabaseConfiguration()) {
    registerAuthRoutes(router, getDbPool());
  } else {
    router.use('/auth', (_req, res) => {
      res.status(503).json({ error: 'Authentication is unavailable. Configure DATABASE_URL to enable auth.' });
    });
  }

  // Apply authentication + project ownership when database is configured
  if (hasDatabaseConfiguration()) {
    router.use(requireAuth);
    router.use(requireProjectAccess(projectRepository));
  }

  registerProjectRoutes(router, projectRepository);
  router.use(createDatasetUploadRouter(datasetRepository));
  router.use(createDocumentRouter());
  router.use(createQueryRouter());
  router.use(createPreprocessingRouter());
  router.use(createFeatureEngineeringRouter());
  router.use(createLlmRouter());
  router.use(createWorkflowRouter());
  router.use(createMcpRouter());
  router.use('/models', modelRouter);
  router.use('/experiments', createExperimentsRouter());
  if (hasDatabaseConfiguration()) {
    router.use('/deployments', createDeploymentsRouter());
  }
  router.use('/execute', executionRouter);
  router.use(notebookRouter);
  router.use(createSettingsRouter());
  router.use(createPlanChatRouter());
  router.use(createRealtimeSessionRouter());

  app.use('/api', router);

  app.get('/', (_req, res) => {
    res.json({ message: 'AI-Augmented AutoML Toolchain API' });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // Express requires exactly 4 parameters to recognize error-handling middleware.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    appLogger.error({ err }, 'Unhandled request error');
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}
