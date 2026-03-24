import { env } from '../config.js';
import { appLogger } from '../logging/logger.js';

import { searchDocuments } from './documentSearchService.js';
import { createLlmClient } from './llm/llmClient.js';

interface AnswerOptions {
  projectId?: string;
  question: string;
  topK?: number;
}

export interface AnswerCitation {
  chunkId: string;
  documentId: string;
  filename: string;
  span: { start: number; end: number };
}

export interface AnswerResponse {
  status: 'ok' | 'not_found';
  answer: string;
  citations: AnswerCitation[];
  meta: {
    cached: boolean;
    latencyMs: number;
    chunksConsidered: number;
    cacheTimestamp?: string;
  };
}

interface CachedEntry {
  expiresAt: number;
  response: AnswerResponse;
}

const answerCache = new Map<string, CachedEntry>();

export async function generateAnswer(options: AnswerOptions): Promise<AnswerResponse> {
  const cacheKey = buildCacheKey(options);
  const cached = answerCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.response,
      meta: { ...cached.response.meta, cached: true, cacheTimestamp: new Date(cached.expiresAt - env.answerCacheTtlMs).toISOString() }
    };
  }

  const startedAt = Date.now();
  const limit = Math.min(10, Math.max(1, options.topK ?? 5));
  const documents = await searchDocuments({
    projectId: options.projectId,
    query: options.question,
    limit
  });

  if (documents.length === 0) {
    return {
      status: 'not_found',
      answer: 'No supporting documents found.',
      citations: [],
      meta: { cached: false, latencyMs: Date.now() - startedAt, chunksConsidered: 0 }
    };
  }

  const answerText = await composeAnswer(options.question, documents);
  const citations: AnswerCitation[] = documents.map((doc) => ({
    chunkId: doc.chunkId,
    documentId: doc.documentId,
    filename: doc.filename,
    span: doc.span
  }));

  const response: AnswerResponse = {
    status: 'ok',
    answer: answerText,
    citations,
    meta: { cached: false, latencyMs: Date.now() - startedAt, chunksConsidered: documents.length }
  };

  answerCache.set(cacheKey, {
    expiresAt: Date.now() + env.answerCacheTtlMs,
    response
  });

  return response;
}

function buildCacheKey(options: AnswerOptions): string {
  const projectPart = options.projectId ?? 'global';
  return `${projectPart}:${options.question.trim().toLowerCase()}:${options.topK ?? 5}`;
}

async function composeAnswer(question: string, docs: { snippet: string; filename: string }[]): Promise<string> {
  const contextBlock = docs
    .map((doc, i) => `[${i + 1}] (${doc.filename}): ${doc.snippet}`)
    .join('\n\n');

  const systemPrompt = `You are a document Q&A assistant. Answer the user's question based ONLY on the provided context excerpts. Cite sources using [1], [2], etc. If the context does not contain enough information, say so. Be concise.`;

  const userPrompt = `Context:\n${contextBlock}\n\nQuestion: ${question}`;

  try {
    const client = createLlmClient();
    const answer = await client.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      maxOutputTokens: 1024,
    });
    return answer.trim();
  } catch (error) {
    appLogger.error('[answerService] LLM call failed, falling back to snippet summary', error);
    // Graceful degradation: return concatenated snippets
    const snippets = docs.map((doc) => doc.snippet.trim()).filter(Boolean);
    return snippets.slice(0, 3).join('\n\n') || `Unable to find supporting evidence for "${question}".`;
  }
}
