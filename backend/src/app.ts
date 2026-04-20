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
import { resolveDeploymentPredictTarget, rewriteDeploymentPredictPath } from './services/deploymentPredictProxy.js';

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

    // Hard upper bounds for the predict endpoint. Requests carry tabular
    // feature dicts (normally <10 KB); responses are JSON predictions. Large
    // bodies on this public route would be a memory-exhaustion DoS vector
    // (issue #318) and buffering entire responses into memory can corrupt
    // non-JSON / compressed payloads (issue #319). These limits cap both.
    const PREDICT_REQUEST_MAX_BYTES = 1_048_576; // 1 MiB
    const PREDICT_RESPONSE_LOG_MAX_BYTES = 262_144; // 256 KiB — only log small JSON bodies
    const HOP_BY_HOP_HEADERS = new Set([
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade',
    ]);

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
          return resolveDeploymentPredictTarget(deployment, entry);
        },
        pathRewrite: rewriteDeploymentPredictPath,
        on: {
          proxyReq: (proxyReq, req: IncomingMessage, res) => {
            // Enforce a hard request-body size limit (issue #318). We stop
            // buffering once the cap is exceeded, destroy the upstream socket,
            // and reject with 413 so the client sees a clear error instead of
            // hanging. Without this, `Buffer.concat(reqChunks)` grew unbounded.
            const predictReq = req as PredictRequest & { parsedBody?: Record<string, unknown> };
            const reqChunks: Buffer[] = [];
            let bytesBuffered = 0;
            let limitExceeded = false;
            req.on('data', (chunk: Buffer) => {
              if (limitExceeded) return;
              bytesBuffered += chunk.length;
              if (bytesBuffered > PREDICT_REQUEST_MAX_BYTES) {
                limitExceeded = true;
                reqChunks.length = 0;
                try { proxyReq.destroy(); } catch { /* ignore */ }
                const clientRes = res as ServerResponse;
                if (!clientRes.headersSent) {
                  clientRes.writeHead(413, { 'Content-Type': 'application/json' });
                  clientRes.end(JSON.stringify({
                    error: 'Request body too large',
                    maxBytes: PREDICT_REQUEST_MAX_BYTES,
                  }));
                }
                return;
              }
              reqChunks.push(chunk);
            });
            req.on('end', () => {
              if (limitExceeded) return;
              try {
                predictReq.parsedBody = JSON.parse(Buffer.concat(reqChunks).toString('utf8'));
              } catch { /* body might not be JSON */ }
            });
          },
          proxyRes: async (proxyRes, req: IncomingMessage, res: ServerResponse) => {
            // Stream response bytes through as Buffers without any `.toString()`
            // round-trip in the transport path (issue #319). The previous
            // implementation did `Buffer.concat(chunks).toString()` before
            // `res.end(body)` — that silently corrupts any non-UTF-8 or
            // compressed payload and invalidates `content-length`.
            // We only decode/parse a SMALL copy of the body when it is
            // advertised as JSON AND under the log-size cap — and only for the
            // prediction-log insert, not for the forwarded bytes.
            const startTime = Date.now();
            const chunks: Buffer[] = [];
            const predictReq = req as PredictRequest & { parsedBody?: Record<string, unknown> };

            res.statusCode = proxyRes.statusCode ?? 200;
            for (const [k, v] of Object.entries(proxyRes.headers)) {
              if (v == null) continue;
              if (HOP_BY_HOP_HEADERS.has(k.toLowerCase())) continue;
              res.setHeader(k, v);
            }

            proxyRes.on('data', (chunk: Buffer) => {
              chunks.push(chunk);
              res.write(chunk);
            });
            proxyRes.on('end', async () => {
              res.end();
              // Log asynchronously. Only parse JSON for small responses with
              // a JSON-ish content-type; otherwise record a placeholder.
              try {
                const contentType = String(proxyRes.headers['content-type'] ?? '').toLowerCase();
                const total = chunks.reduce((n, c) => n + c.length, 0);
                let parsed: Record<string, unknown> = { bytes: total };
                if (contentType.includes('json') && total <= PREDICT_RESPONSE_LOG_MAX_BYTES) {
                  try {
                    const decoded = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                    if (decoded && typeof decoded === 'object') {
                      parsed = decoded as Record<string, unknown>;
                    }
                  } catch { /* keep placeholder */ }
                }
                const deployment = predictReq.deployment;
                if (deployment) {
                  const latencyMs = Date.now() - startTime;
                  const hourBucket = new Date();
                  hourBucket.setMinutes(0, 0, 0);

                  await Promise.all([
                    predictDeploymentRepo.insertPredictionLog({
                      deploymentId: deployment.deploymentId,
                      modelId: deployment.modelId,
                      projectId: deployment.projectId,
                      createdAt: new Date().toISOString(),
                      latencyMs,
                      inputFeatures: predictReq.parsedBody ?? {},
                      prediction: parsed,
                      status: proxyRes.statusCode === 200 ? 'success' : 'error',
                      metadata: {},
                    }),
                    predictDeploymentRepo.upsertHourlyStats(deployment.deploymentId, hourBucket, {
                      requestCount: 1,
                      errorCount: proxyRes.statusCode !== 200 ? 1 : 0,
                      latencyAvg: latencyMs,
                    }),
                  ]);
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
