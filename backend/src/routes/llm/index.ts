import { Router } from 'express';

import { createCatalogRouter } from './catalogRoutes.js';
// TODO(Phase 6): Remove legacy feature handler — replaced by unified workflow PhaseConfig.
import { createFeatureHandlerRouter } from './featureHandler.js';
import { createOnboardingHandlerRouter } from './onboardingHandler.js';
import { createPreprocessingHandlerRouter } from './preprocessingHandler.js';
import { createTrainingHandlerRouter } from './trainingHandler.js';

export function createLlmRouter(): Router {
  const router = Router();

  router.use(createCatalogRouter());
  router.use(createPreprocessingHandlerRouter());
  router.use(createFeatureHandlerRouter());
  router.use(createOnboardingHandlerRouter());
  router.use(createTrainingHandlerRouter());

  return router;
}
