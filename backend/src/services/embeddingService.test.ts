import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createMock } = vi.hoisted(() => {
  const createMock = vi.fn();
  return { createMock };
});

vi.mock('openai', () => {
  return {
    default: class {
      embeddings = { create: createMock };
    }
  };
});

import { computeTextEmbedding, computeEmbeddings, cosineSimilarity, EMBEDDING_DIMENSION } from './embeddingService.js';

function makeFakeEmbedding(seed: number): number[] {
  const vec = new Array<number>(1536).fill(0);
  for (let i = 0; i < 1536; i += 1) {
    vec[i] = Math.sin(seed + i) * 0.01;
  }
  return vec;
}

describe('embeddingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('EMBEDDING_DIMENSION', () => {
    it('is 1536 for text-embedding-3-small', () => {
      expect(EMBEDDING_DIMENSION).toBe(1536);
    });
  });

  describe('computeTextEmbedding', () => {
    it('returns a 1536-dim vector from OpenAI', async () => {
      const fakeVec = makeFakeEmbedding(42);
      createMock.mockResolvedValue({
        data: [{ index: 0, embedding: fakeVec }]
      });

      const result = await computeTextEmbedding('hello world');
      expect(result).toEqual(fakeVec);
      expect(result).toHaveLength(1536);
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'text-embedding-3-small',
          input: ['hello world']
        })
      );
    });
  });

  describe('computeEmbeddings', () => {
    it('returns empty array for empty input', async () => {
      const result = await computeEmbeddings([]);
      expect(result).toEqual([]);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('batches multiple texts in one call', async () => {
      const vec1 = makeFakeEmbedding(1);
      const vec2 = makeFakeEmbedding(2);
      createMock.mockResolvedValue({
        data: [
          { index: 0, embedding: vec1 },
          { index: 1, embedding: vec2 }
        ]
      });

      const result = await computeEmbeddings(['text one', 'text two']);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(vec1);
      expect(result[1]).toEqual(vec2);
    });

    it('sorts results by index', async () => {
      const vec0 = makeFakeEmbedding(10);
      const vec1 = makeFakeEmbedding(20);
      createMock.mockResolvedValue({
        data: [
          { index: 1, embedding: vec1 },
          { index: 0, embedding: vec0 }
        ]
      });

      const result = await computeEmbeddings(['first', 'second']);
      expect(result[0]).toEqual(vec0);
      expect(result[1]).toEqual(vec1);
    });
  });

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const vec = [0.5, 0.5, 0.5, 0.5];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
      const vec1 = [1, 0, 0, 0];
      const vec2 = [0, 1, 0, 0];
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(0, 5);
    });

    it('returns -1 for opposite vectors', () => {
      expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
    });

    it('returns 0 for vectors of different lengths', () => {
      expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
    });

    it('returns 0 for zero vectors', () => {
      expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
    });

    it('is commutative', () => {
      const vec1 = [0.1, 0.5, 0.3, 0.8];
      const vec2 = [0.4, 0.2, 0.6, 0.1];
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(cosineSimilarity(vec2, vec1), 10);
    });

    it('handles empty arrays', () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });
  });
});
