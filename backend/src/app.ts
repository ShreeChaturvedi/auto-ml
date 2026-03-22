import cors from 'cors';
import express, { Request, Response, Router } from 'express';

import { env } from './config.js';
import { getDbPool, hasDatabaseConfiguration } from './db.js';
import { appLogger } from './logging/logger.js';
import { requireAuth } from './middleware/auth.js';
import { requestContextMiddleware } from './middleware/requestContext.js';
import { requestTimingMiddleware } from './middleware/requestTiming.js';
import { requireProjectAccess } from './middleware/requireProjectAccess.js';
import { createDatasetRepository } from './repositories/datasetRepository.js';
import { createProjectRepository } from './repositories/projectRepository.js';
import { createAnswerRouter } from './routes/answer.js';
import { registerAuthRoutes } from './routes/auth.js';
import { createDatasetUploadRouter } from './routes/datasets.js';
import { createDocumentRouter } from './routes/documents.js';
import executionRouter from './routes/execution.js';
import { createExperimentsRouter } from './routes/experiments.js';
import { createFeatureEngineeringRouter } from './routes/featureEngineering.js';
import { registerHealthRoutes } from './routes/health.js';
import { createLlmRouter } from './routes/llm/index.js';
import { createMcpRouter } from './routes/mcp.js';
import modelRouter from './routes/models.js';
import notebookRouter from './routes/notebooks.js';
import { createPreprocessingRouter } from './routes/preprocessing.js';
import { registerProjectRoutes } from './routes/projects.js';
import { createQueryRouter } from './routes/query.js';
import { createRealtimeSessionRouter } from './routes/realtimeSession.js';
import { createWorkflowRouter } from './routes/workflows.js';

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
  router.use(createAnswerRouter());
  router.use(createPreprocessingRouter());
  router.use(createFeatureEngineeringRouter());
  router.use(createLlmRouter());
  router.use(createWorkflowRouter());
  router.use(createMcpRouter());
  router.use('/models', modelRouter);
  router.use('/experiments', createExperimentsRouter());
  router.use('/execute', executionRouter);
  router.use(notebookRouter);
  router.use(createRealtimeSessionRouter());

  app.use('/api', router);

  app.get('/', (_req, res) => {
    res.json({ message: 'AI-Augmented AutoML Toolchain API' });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  app.use((err: unknown, _req: Request, res: Response) => {
    appLogger.error({ err }, 'Unhandled request error');
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}
