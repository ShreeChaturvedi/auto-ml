import { getDbPool } from '../db.js';

import { computeTextEmbedding, toVecLiteral } from './embeddingService.js';

export interface DocumentSearchResult {
  chunkId: string;
  documentId: string;
  filename: string;
  score: number;
  snippet: string;
  span: { start: number; end: number };
}

interface SearchOptions {
  projectId?: string;
  query: string;
  limit: number;
}

/**
 * Semantic search over document chunks using pgvector cosine distance.
 * The query text is embedded via OpenAI and matched against stored vectors.
 */
export async function searchDocuments(options: SearchOptions): Promise<DocumentSearchResult[]> {
  const queryEmbedding = await computeTextEmbedding(options.query);
  const vecLiteral = toVecLiteral(queryEmbedding);
  const pool = getDbPool();

  const rows = await pool.query(
    `SELECT e.chunk_id,
            c.content,
            c.span,
            d.filename,
            d.document_id,
            1 - (e.embedding_vec <=> $1::vector) AS score
       FROM embeddings e
       JOIN chunks c ON c.chunk_id = e.chunk_id
       JOIN documents d ON d.document_id = c.document_id
      WHERE ($2::uuid IS NULL OR e.project_id = $2)
        AND e.embedding_vec IS NOT NULL
      ORDER BY e.embedding_vec <=> $1::vector
      LIMIT $3`,
    [vecLiteral, options.projectId ?? null, options.limit]
  );

  if (rows.rowCount === 0) return [];

  return rows.rows.map((row) => ({
    chunkId: row.chunk_id as string,
    documentId: row.document_id as string,
    filename: row.filename as string,
    score: Number(Number(row.score).toFixed(4)),
    snippet: buildSnippet(row.content as string),
    span: row.span ?? { start: 0, end: 0 }
  }));
}

function buildSnippet(text: string): string {
  return text.length > 220 ? `${text.slice(0, 220)}…` : text;
}
