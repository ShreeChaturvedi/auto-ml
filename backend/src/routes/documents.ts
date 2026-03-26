import { createReadStream, existsSync } from 'fs';
import { rm } from 'fs/promises';
import { dirname } from 'path';

import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import { appLogger } from '../logging/logger.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { verifyProjectOwnership } from '../middleware/resourceOwnership.js';
import { getProjectRepository } from '../repositories/projectRepository.js';
import { ingestDocument } from '../services/documentIngestion.js';
import { parseDocument } from '../services/documentParser.js';
import { searchDocuments } from '../services/documentSearchService.js';
import type { AuthRequest } from '../types/auth.js';
import { sendBadRequest, sendError, sendInternalError, sendNotFound } from '../utils/errors.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

const uploadSchema = z.object({
  projectId: z.string().uuid().optional()
});

export function createDocumentRouter() {
  const router = Router();
  const projectRepository = getProjectRepository();

  router.post('/upload/doc', upload.single('file'), asyncHandler(async (req: AuthRequest, res) => {
    const result = uploadSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten() });
    }

    // Project ownership is verified by requireProjectAccess middleware

    if (!req.file) {
      sendBadRequest(res, 'file field is required');
      return;
    }

    if (!hasDatabaseConfiguration()) {
      sendError(res, 503, 'Database is not configured for document ingestion');
      return;
    }

    try {
      const parsed = await parseDocument(req.file.buffer, req.file.mimetype, req.file.originalname);
      const ingested = await ingestDocument({
        projectId: result.data.projectId,
        filename: req.file.originalname,
        mimeType: req.file.mimetype ?? parsed.mimeType,
        buffer: req.file.buffer,
        document: parsed
      });
      const parseWarning =
        parsed.parseError ||
        (parsed.text.trim().length === 0
          ? 'No text could be extracted from this document.'
          : undefined);

      return res.status(201).json({
        document: {
          documentId: ingested.documentId,
          projectId: ingested.projectId,
          filename: req.file.originalname,
          mimeType: req.file.mimetype ?? parsed.mimeType,
          chunkCount: ingested.chunkCount,
          embeddingDimension: ingested.embeddingDimension,
          parseWarning
        }
      });
    } catch (error) {
      appLogger.error('[documents] failed to ingest document', error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Return more specific error message for debugging
      sendError(res, 500, 'Failed to ingest document',
        process.env.NODE_ENV !== 'production' ? { message: errorMessage } : undefined
      );
    }
  }));

  router.get('/docs/search', asyncHandler(async (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = Number.parseInt(String(req.query.k ?? '5'), 10);

    if (!query.trim()) {
      sendBadRequest(res, 'q parameter is required');
      return;
    }

    if (!hasDatabaseConfiguration()) {
      sendError(res, 503, 'Database is not configured for document search');
      return;
    }

    const results = await searchDocuments({
      projectId,
      query,
      limit: Number.isNaN(limit) ? 5 : Math.min(20, Math.max(1, limit))
    });

    return res.json({
      results
    });
  }));

  router.get('/documents', asyncHandler(async (req, res) => {
    if (!hasDatabaseConfiguration()) {
      sendError(res, 503, 'Database is not configured for document listing');
      return;
    }

    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;

    try {
      const pool = getDbPool();
      const query = projectId
        ? `SELECT document_id, project_id, filename, mime_type, byte_size, metadata, storage_path, created_at
           FROM documents
           WHERE project_id = $1
           ORDER BY created_at DESC`
        : `SELECT document_id, project_id, filename, mime_type, byte_size, metadata, storage_path, created_at
           FROM documents
           ORDER BY created_at DESC`;

      const result = projectId
        ? await pool.query(query, [projectId])
        : await pool.query(query);

      const documents = result.rows.map((row) => ({
        documentId: row.document_id,
        projectId: row.project_id ?? undefined,
        filename: row.filename,
        mimeType: row.mime_type,
        byteSize: Number(row.byte_size ?? 0),
        metadata: row.metadata ?? {},
        storagePath: row.storage_path ?? null,
        createdAt: row.created_at
      }));

      return res.json({ documents });
    } catch (error) {
      appLogger.error('[documents] Failed to list documents:', error);
      sendInternalError(res, 'Failed to list documents', error);
    }
  }));

  router.get('/documents/:documentId/download', asyncHandler(async (req: AuthRequest, res) => {
    if (!hasDatabaseConfiguration()) {
      sendError(res, 503, 'Database is not configured for document download');
      return;
    }

    const { documentId } = req.params;
    const pool = getDbPool();

    try {
      const result = await pool.query(
        `SELECT filename, mime_type, storage_path, byte_size, project_id
         FROM documents
         WHERE document_id = $1`,
        [documentId]
      );

      if (result.rows.length === 0) {
        sendNotFound(res, 'Document');
        return;
      }

      const row = result.rows[0];

      const projectId = row.project_id as string | null;
      if (req.user && projectId) {
        const project = await verifyProjectOwnership(projectId, req.user.user_id, projectRepository);
        if (!project) {
          sendNotFound(res, 'Document');
          return;
        }
      }

      const storagePath = row.storage_path as string | null;

      if (!storagePath || !existsSync(storagePath)) {
        sendNotFound(res, 'Document file');
        return;
      }

      res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${row.filename}"`);
      res.setHeader('Content-Length', row.byte_size ?? undefined);

      const stream = createReadStream(storagePath);
      stream.on('error', () => {
        res.status(500).end();
      });
      return stream.pipe(res);
    } catch (error) {
      appLogger.error('[documents] Failed to download document:', error);
      sendInternalError(res, 'Failed to download document', error);
    }
  }));

  router.delete('/documents/:documentId', asyncHandler(async (req: AuthRequest, res) => {
    if (!hasDatabaseConfiguration()) {
      sendError(res, 503, 'Database is not configured for document deletion');
      return;
    }

    const { documentId } = req.params;
    const pool = getDbPool();

    try {
      const result = await pool.query(
        `SELECT storage_path, project_id FROM documents WHERE document_id = $1`,
        [documentId]
      );

      if (result.rows.length === 0) {
        sendNotFound(res, 'Document');
        return;
      }

      const row = result.rows[0];

      const projectId = row.project_id as string | null;
      if (req.user && projectId) {
        const project = await verifyProjectOwnership(projectId, req.user.user_id, projectRepository);
        if (!project) {
          sendNotFound(res, 'Document');
          return;
        }
      }

      const storagePath = row.storage_path as string | null;
      await pool.query(`DELETE FROM documents WHERE document_id = $1`, [documentId]);

      if (storagePath) {
        const directory = dirname(storagePath);
        await rm(directory, { recursive: true, force: true });
      }

      return res.json({ success: true });
    } catch (error) {
      appLogger.error('[documents] Failed to delete document:', error);
      sendInternalError(res, 'Failed to delete document', error);
    }
  }));

  return router;
}
