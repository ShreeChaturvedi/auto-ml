import { Router } from 'express';
import { z } from 'zod';

import { env } from '../config.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { sanitizeTableName } from '../services/datasetLoader.js';
import {
  executePreprocessingTool,
  isPreprocessingToolName,
  syncPreprocessingLangGraphState
} from '../services/llm/preprocessingGraph.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);

const compatibilityCheckSchema = z.object({
  projectId: z.string().min(1),
  runId: z.string().min(1),
  checkpointId: z.string().min(1),
  replayDatasetId: z.string().min(1)
});

export function createPreprocessingRouter() {
  const router = Router();

  router.get('/preprocessing/tables', async (req, res) => {

    try {
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      let datasets = await datasetRepository.list();
      if (projectId) {
        datasets = datasets.filter((dataset) => dataset.projectId === projectId);
      }

      const tables = datasets.map((dataset) => ({
        datasetId: dataset.datasetId,
        name:
          typeof dataset.metadata?.tableName === 'string'
            ? dataset.metadata.tableName
            : sanitizeTableName(dataset.filename, dataset.datasetId),
        filename: dataset.filename,
        sizeBytes: dataset.size,
        nRows: dataset.nRows,
        nCols: dataset.nCols,
        columns: dataset.columns.map((column) => ({ name: column.name, dtype: column.dtype })),
        previewRows: dataset.sample?.slice(0, 5) ?? []
      }));

      return res.json({ tables });
    } catch (error) {
      console.error('[preprocessing] Failed to list tables:', error);
      return res.status(500).json({ error: 'Failed to list tables' });
    }
  });

  router.post('/preprocessing/check-compatibility', async (req, res) => {
    const parsed = compatibilityCheckSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    }

    const { projectId, runId, checkpointId, replayDatasetId } = parsed.data;
    const toolName = 'restore_checkpoint';

    if (!isPreprocessingToolName(toolName)) {
      return res.status(500).json({ error: 'Tool not available' });
    }

    try {
      const toolArgs = {
        runId,
        checkpointId,
        operation: 'compatibility_check',
        replayDatasetId,
        toolCallId: `compat-check-${Date.now()}`
      };

      const rawResult = await executePreprocessingTool(projectId, toolName, toolArgs);
      const result = await syncPreprocessingLangGraphState(projectId, toolName, toolArgs, rawResult);

      return res.json({
        output: result.output,
        error: result.error
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Compatibility check failed';
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
