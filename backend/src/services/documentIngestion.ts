import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { env } from '../config.js';
import { getDbPool } from '../db.js';

import type { ParsedDocument } from './documentParser.js';
import { computeTextEmbedding, EMBEDDING_DIMENSION } from './embeddingService.js';
import { chunkDocument } from './textChunker.js';

interface IngestOptions {
  projectId?: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  document: ParsedDocument;
}

export interface IngestedDocument {
  documentId: string;
  projectId?: string;
  chunkCount: number;
  embeddingDimension: number;
}

export async function ingestDocument(options: IngestOptions): Promise<IngestedDocument> {
  const documentId = randomUUID();
  const storagePath = persistDocumentFile(documentId, options.filename, options.buffer);
  const pool = getDbPool();

  await pool.query(
    `INSERT INTO documents (document_id, project_id, filename, mime_type, byte_size, metadata, storage_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      documentId,
      options.projectId ?? null,
      options.filename,
      options.mimeType,
      options.buffer.byteLength,
      JSON.stringify({
        type: options.document.type,
        parseError: options.document.parseError ?? null,
        textLength: options.document.text.length
      }),
      storagePath
    ]
  );

  const chunkSize = Math.max(50, env.docChunkSize);
  const overlap = Math.min(Math.floor(chunkSize / 2), env.docChunkOverlap);
  const chunks = chunkDocument(options.document, { chunkSize, overlap });

  for (const chunk of chunks) {
    const chunkId = randomUUID();
    await pool.query(
      `INSERT INTO chunks (chunk_id, document_id, project_id, chunk_index, token_count, span, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        chunkId,
        documentId,
        options.projectId ?? null,
        chunk.chunkIndex,
        chunk.tokenCount,
        JSON.stringify({ start: chunk.startOffset, end: chunk.endOffset }),
        chunk.text
      ]
    );

    const embedding = computeTextEmbedding(chunk.text);
    await pool.query(
      `INSERT INTO embeddings (embedding_id, chunk_id, project_id, embedding, dimension)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), chunkId, options.projectId ?? null, embedding, embedding.length]
    );
  }

  return {
    documentId,
    projectId: options.projectId,
    chunkCount: chunks.length,
    embeddingDimension: EMBEDDING_DIMENSION
  };
}

function persistDocumentFile(documentId: string, filename: string, buffer: Buffer): string {
  const dir = join(env.documentStorageDir, documentId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, filename);
  writeFileSync(filePath, buffer);
  return filePath;
}
