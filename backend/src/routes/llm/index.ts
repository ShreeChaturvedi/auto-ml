import { Router } from 'express';

import { createCatalogRouter } from './catalogRoutes.js';

export function createLlmRouter(): Router {
  const router = Router();
  router.use(createCatalogRouter());
  return router;
}
