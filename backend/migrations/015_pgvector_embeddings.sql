-- Enable pgvector extension and add vector column for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Add a vector column; dimension 1536 matches OpenAI text-embedding-3-small
ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS embedding_vec vector(1536);

-- HNSW index for cosine similarity (works on empty tables unlike ivfflat)
CREATE INDEX IF NOT EXISTS idx_embeddings_vec_cosine
  ON embeddings USING hnsw (embedding_vec vector_cosine_ops);
