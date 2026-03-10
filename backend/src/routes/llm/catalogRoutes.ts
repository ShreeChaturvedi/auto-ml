import { Router } from 'express';

import {
  getDefaultReasoningEffortForModel,
  getDefaultLlmModel,
  listCatalogModels,
  listFeaturedModels
} from '../../services/llm/modelCatalog.js';
import { LLM_TOOL_DEFINITIONS } from '../../services/llm/toolRegistry.js';

export function createCatalogRouter(): Router {
  const router = Router();

  router.get('/llm/tools', (_req, res) => {
    return res.json({ tools: LLM_TOOL_DEFINITIONS });
  });

  router.get('/llm/models', (_req, res) => {
    return res.json({
      defaultModel: getDefaultLlmModel(),
      defaultReasoningEffort: getDefaultReasoningEffortForModel(getDefaultLlmModel()),
      featuredModels: listFeaturedModels(),
      models: listCatalogModels()
    });
  });

  return router;
}
