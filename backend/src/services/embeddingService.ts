import OpenAI from 'openai';

import { env } from '../config.js';
import { appLogger } from '../logging/logger.js';

const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSION = 1536;

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: env.openaiApiKey,
      baseURL: env.openaiBaseUrl.replace(/\/$/, '') || undefined,
      maxRetries: 1,
    });
  }
  return openaiClient;
}

/**
 * Sanitize text identically to how the OpenAI embeddings API will see it.
 * Extracted so the cache key and the network call see the same value —
 * any drift here causes silent cache-miss storms.
 */
function sanitizeEmbeddingInput(text: string): string {
  return text.replace(/\n/g, ' ').trim() || ' ';
}

// In-process cache for single-text embeddings. Read-side only — batch
// embeddings for document ingestion bypass this cache by design (each
// chunk is unique, so caching them is pure waste).
//
// Capacity chosen so 500 × 1536 × 8 ≈ 6MB raw + ~2MB V8 overhead.
// Do NOT raise without re-running the memory math.
const EMBEDDING_CACHE_MAX_ENTRIES = 500;
const EMBEDDING_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface CachedEmbedding {
  vector: number[];
  expiresAt: number;
}

const embeddingCache = new Map<string, CachedEmbedding>();
const inflightEmbeddings = new Map<string, Promise<number[]>>();

function readCachedEmbedding(key: string): number[] | undefined {
  const entry = embeddingCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    embeddingCache.delete(key);
    return undefined;
  }
  return entry.vector;
}

function storeCachedEmbedding(key: string, vector: number[]): void {
  // Dimension sanity check — if OpenAI silently changes model output shape,
  // drop the cache rather than serving mismatched vectors that would corrupt
  // pgvector similarity queries.
  if (vector.length !== EMBEDDING_DIMENSION) {
    appLogger.warn('[embeddingCache] Unexpected embedding dimension; clearing cache', {
      expected: EMBEDDING_DIMENSION,
      actual: vector.length
    });
    embeddingCache.clear();
    return;
  }
  // Insertion-order eviction: delete oldest entry when at capacity.
  if (embeddingCache.size >= EMBEDDING_CACHE_MAX_ENTRIES) {
    const oldestKey = embeddingCache.keys().next().value;
    if (oldestKey !== undefined) {
      embeddingCache.delete(oldestKey);
    }
  }
  embeddingCache.set(key, { vector, expiresAt: Date.now() + EMBEDDING_CACHE_TTL_MS });
}

/**
 * Compute embeddings for one or more texts using OpenAI.
 * Returns a 1536-dimensional vector per text.
 */
export async function computeEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const sanitized = texts.map(sanitizeEmbeddingInput);

  const response = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    input: sanitized,
  });

  return response.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

/**
 * Compute a single text embedding with in-process caching + in-flight dedup.
 *
 * This is the hot path for RAG retrieval (loadRagSnippets → searchDocuments).
 * Before this cache, a single workflow turn with 24 graph iterations would
 * fire 24 identical embedding requests against OpenAI, burning through the
 * shared org rate-limit bucket that also serves chat completions.
 *
 * Cache semantics:
 *   - Key: sanitized input text (so equivalent queries collide correctly)
 *   - TTL: 15 minutes (bounds staleness on model version drifts)
 *   - Max entries: 500 (~8-12MB memory ceiling including overhead)
 *   - In-flight dedup: concurrent identical calls share one network round-trip
 */
export async function computeTextEmbedding(text: string): Promise<number[]> {
  const key = sanitizeEmbeddingInput(text);

  const cached = readCachedEmbedding(key);
  if (cached) {
    return cached;
  }

  const existingInflight = inflightEmbeddings.get(key);
  if (existingInflight) {
    return existingInflight;
  }

  const pending = (async () => {
    const [embedding] = await computeEmbeddings([text]);
    storeCachedEmbedding(key, embedding);
    return embedding;
  })();

  inflightEmbeddings.set(key, pending);
  try {
    return await pending;
  } finally {
    inflightEmbeddings.delete(key);
  }
}

/** Test-only: clear the embedding cache and any in-flight promises. */
export function __clearEmbeddingCacheForTests(): void {
  embeddingCache.clear();
  inflightEmbeddings.clear();
}

/**
 * Cosine similarity between two vectors.
 * Retained for tests and optional in-memory scoring.
 */
/** Format a number[] as a pgvector literal string for use in SQL casts. */
export function toVecLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
