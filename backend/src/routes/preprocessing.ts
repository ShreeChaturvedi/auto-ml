/**
 * Preprocessing Routes
 * 
 * Endpoints for analyzing datasets and generating preprocessing suggestions.
 */

import { Router } from 'express';
import { z } from 'zod';

import { env } from '../config.js';
import { hasDatabaseConfiguration, getDbPool } from '../db.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { sanitizeTableName } from '../services/datasetLoader.js';
import { analyzeDataForPreprocessing } from '../services/preprocessingSuggestions.js';
import type { QueryRow } from '../types/query.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);

const analyzeSchema = z.object({
  projectId: z.string().uuid('projectId must be a valid UUID'),
  tableName: z.string().min(1).optional(),
  datasetId: z.string().min(1).optional(),
  sampleSize: z.number().int().min(100).max(10000).optional().default(1000)
}).refine((data) => Boolean(data.tableName || data.datasetId), {
  message: 'tableName or datasetId is required',
  path: ['tableName']
});

export function createPreprocessingRouter() {
  const router = Router();

  /**
   * POST /preprocessing/analyze
   * 
   * Analyzes a dataset table and returns preprocessing suggestions.
   * Uses a sample of the data for performance.
   */
  router.post('/preprocessing/analyze', async (req, res) => {
    console.log('[preprocessing] Analyze request:', req.body);
    
    const result = analyzeSchema.safeParse(req.body);
    if (!result.success) {
      console.log('[preprocessing] Validation error:', result.error.flatten());
      return res.status(400).json({ errors: result.error.flatten() });
    }

    if (!hasDatabaseConfiguration()) {
      return res.status(503).json({ error: 'Database is not configured' });
    }

    const { tableName, datasetId, sampleSize } = result.data;

    let resolvedTableName = tableName;

    if (!resolvedTableName && datasetId) {
      const dataset = await datasetRepository.getById(datasetId);
      if (!dataset) {
        return res.status(404).json({ error: 'Dataset not found' });
      }
      if (dataset.projectId && dataset.projectId !== result.data.projectId) {
        return res.status(403).json({ error: 'Dataset does not belong to this project' });
      }
      resolvedTableName =
        typeof dataset.metadata?.tableName === 'string'
          ? dataset.metadata.tableName
          : sanitizeTableName(dataset.filename, dataset.datasetId);
    }

    if (!resolvedTableName) {
      return res.status(400).json({ error: 'No table available for preprocessing' });
    }

    try {
      const pool = getDbPool();
      
      // Fetch sample data from the table
      // Use TABLESAMPLE for large tables, or regular LIMIT for smaller ones
      const countResult = await pool.query(
        `SELECT COUNT(*)::integer as count FROM "${resolvedTableName}"`
      );
      const totalRows = countResult.rows[0].count;

      let sampleQuery: string;
      if (totalRows > sampleSize * 2) {
        // Use random sampling for large tables
        sampleQuery = `SELECT * FROM "${resolvedTableName}" ORDER BY RANDOM() LIMIT ${sampleSize}`;
      } else {
        // Just get all rows for smaller tables
        sampleQuery = `SELECT * FROM "${resolvedTableName}" LIMIT ${sampleSize}`;
      }

      const dataResult = await pool.query(sampleQuery);
      const rows: QueryRow[] = dataResult.rows;

      if (rows.length === 0) {
        return res.json({
          analysis: {
            rowCount: 0,
            columnCount: 0,
            duplicateRowCount: 0,
            columnProfiles: [],
            suggestions: []
          },
          metadata: {
            tableName: resolvedTableName,
            totalRows: 0,
            sampledRows: 0,
            samplePercentage: 0
          }
        });
      }

      // Run preprocessing analysis
      const analysis = analyzeDataForPreprocessing(rows);

      return res.json({
        analysis,
        metadata: {
          tableName: resolvedTableName,
          totalRows,
          sampledRows: rows.length,
          samplePercentage: totalRows > 0 ? (rows.length / totalRows) * 100 : 100
        }
      });
    } catch (error) {
      console.error('[preprocessing] Analysis failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to analyze dataset';
      return res.status(400).json({ error: message });
    }
  });

  /**
   * GET /preprocessing/tables
   * 
   * Lists available tables that can be analyzed.
   */
  router.get('/preprocessing/tables', async (req, res) => {
    if (!hasDatabaseConfiguration()) {
      return res.status(503).json({ error: 'Database is not configured' });
    }

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
        nCols: dataset.nCols
      }));

      return res.json({ tables });
    } catch (error) {
      console.error('[preprocessing] Failed to list tables:', error);
      return res.status(500).json({ error: 'Failed to list tables' });
    }
  });

  return router;
}



