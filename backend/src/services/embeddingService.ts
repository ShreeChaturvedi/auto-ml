import OpenAI from 'openai';

import { env } from '../config.js';

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
 * Compute embeddings for one or more texts using OpenAI.
 * Returns a 1536-dimensional vector per text.
 */
export async function computeEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const sanitized = texts.map((t) => t.replace(/\n/g, ' ').trim() || ' ');

  const response = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    input: sanitized,
  });

  return response.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

/**
 * Compute a single text embedding. Convenience wrapper around computeEmbeddings.
 */
export async function computeTextEmbedding(text: string): Promise<number[]> {
  const [embedding] = await computeEmbeddings([text]);
  return embedding;
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
