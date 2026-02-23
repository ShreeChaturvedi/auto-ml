import { createReadStream, existsSync } from 'fs';
import { rm } from 'fs/promises';
import { dirname } from 'path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import { ingestDocument } from '../services/documentIngestion.js';
import { parseDocument } from '../services/documentParser.js';
import { searchDocuments } from '../services/documentSearchService.js';

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

  router.post('/upload/doc', upload.single('file'), async (req, res) => {
    const result = uploadSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten() });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'file field is required' });
    }

    if (!hasDatabaseConfiguration()) {
      return res.status(503).json({ error: 'Database is not configured for document ingestion' });
    }

    try {
      const parsed = await parseDocument(req.file.buffer, req.file.mimetype);
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error('[documents] failed to ingest:', errorMessage);
      if (errorStack) {
        console.error('[documents] stack:', errorStack);
      }

      // Return more specific error message for debugging
      return res.status(500).json({
        error: 'Failed to ingest document',
        details: process.env.NODE_ENV !== 'production' ? errorMessage : undefined
      });
    }
  });

  router.get('/docs/search', async (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = Number.parseInt(String(req.query.k ?? '5'), 10);

    if (!query.trim()) {
      return res.status(400).json({ error: 'q parameter is required' });
    }

    if (!hasDatabaseConfiguration()) {
      return res.status(503).json({ error: 'Database is not configured for document search' });
    }

    const results = await searchDocuments({
      projectId,
      query,
      limit: Number.isNaN(limit) ? 5 : Math.min(20, Math.max(1, limit))
    });

    return res.json({
      results
    });
  });

  router.get('/documents', async (req, res) => {
    if (!hasDatabaseConfiguration()) {
      return res.status(503).json({ error: 'Database is not configured for document listing' });
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
      console.error('[documents] Failed to list documents:', error);
      return res.status(500).json({ error: 'Failed to list documents' });
    }
  });

  router.get('/documents/:documentId/download', async (req, res) => {
    if (!hasDatabaseConfiguration()) {
      return res.status(503).json({ error: 'Database is not configured for document download' });
    }

    const { documentId } = req.params;
    const pool = getDbPool();

    try {
      const result = await pool.query(
        `SELECT filename, mime_type, storage_path, byte_size
         FROM documents
         WHERE document_id = $1`,
        [documentId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const row = result.rows[0];
      const storagePath = row.storage_path as string | null;

      if (!storagePath || !existsSync(storagePath)) {
        return res.status(404).json({ error: 'Document file not found on disk' });
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
      console.error('[documents] Failed to download document:', error);
      return res.status(500).json({ error: 'Failed to download document' });
    }
  });

  router.delete('/documents/:documentId', async (req, res) => {
    if (!hasDatabaseConfiguration()) {
      return res.status(503).json({ error: 'Database is not configured for document deletion' });
    }

    const { documentId } = req.params;
    const pool = getDbPool();

    try {
      const result = await pool.query(
        `SELECT storage_path FROM documents WHERE document_id = $1`,
        [documentId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const storagePath = result.rows[0].storage_path as string | null;
      await pool.query(`DELETE FROM documents WHERE document_id = $1`, [documentId]);

      if (storagePath) {
        const directory = dirname(storagePath);
        await rm(directory, { recursive: true, force: true });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('[documents] Failed to delete document:', error);
      return res.status(500).json({ error: 'Failed to delete document' });
    }
  });

  return router;
}
