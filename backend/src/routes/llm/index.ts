import { Router } from 'express';

import { createCatalogRouter } from './catalogRoutes.js';
import { createPreprocessingHandlerRouter } from './preprocessingHandler.js';

export function createLlmRouter(): Router {
  const router = Router();

  router.use(createCatalogRouter());
  // preprocessingHandler still provides /llm/tools/execute (used by step approval)
  // and /llm/preprocessing/runs (used by run hydration) — will be fully migrated later
  router.use(createPreprocessingHandlerRouter());

  return router;
}
