import { describe, it, expect } from 'vitest';

import { computeTextEmbedding, cosineSimilarity, EMBEDDING_DIMENSION } from './embeddingService.js';

describe('embeddingService', () => {
  describe('EMBEDDING_DIMENSION', () => {
    it('has default dimension of 64', () => {
      expect(EMBEDDING_DIMENSION).toBe(64);
    });
  });

  describe('computeTextEmbedding', () => {
    it('returns vector of correct default dimension', () => {
      const embedding = computeTextEmbedding('hello world');
      expect(embedding).toHaveLength(64);
    });

    it('returns vector of custom dimension', () => {
      const embedding = computeTextEmbedding('hello world', 128);
      expect(embedding).toHaveLength(128);
    });

    it('returns zero vector for empty string', () => {
      const embedding = computeTextEmbedding('');
      expect(embedding.every(v => v === 0)).toBe(true);
    });

    it('returns zero vector for whitespace-only string', () => {
      const embedding = computeTextEmbedding('   \t\n  ');
      expect(embedding.every(v => v === 0)).toBe(true);
    });

    it('returns normalized vector (unit length)', () => {
      const embedding = computeTextEmbedding('the quick brown fox');
      const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1, 5);
    });

    it('produces non-zero vector for non-empty text', () => {
      const embedding = computeTextEmbedding('machine learning');
      const hasNonZero = embedding.some(v => v !== 0);
      expect(hasNonZero).toBe(true);
    });

    it('produces same embedding for same text', () => {
      const text = 'consistent embedding test';
      const embedding1 = computeTextEmbedding(text);
      const embedding2 = computeTextEmbedding(text);
      expect(embedding1).toEqual(embedding2);
    });

    it('produces different embeddings for different texts', () => {
      const embedding1 = computeTextEmbedding('apple banana cherry');
      const embedding2 = computeTextEmbedding('dog cat elephant');
      expect(embedding1).not.toEqual(embedding2);
    });

    it('is case insensitive', () => {
      const embedding1 = computeTextEmbedding('Hello World');
      const embedding2 = computeTextEmbedding('hello world');
      expect(embedding1).toEqual(embedding2);
    });

    it('handles special characters by tokenizing on whitespace', () => {
      const embedding = computeTextEmbedding('hello! world? test@email.com');
      expect(embedding).toHaveLength(64);
      const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1, 5);
    });

    it('handles unicode text', () => {
      const embedding = computeTextEmbedding('bonjour monde');
      expect(embedding).toHaveLength(64);
      const hasNonZero = embedding.some(v => v !== 0);
      expect(hasNonZero).toBe(true);
    });

    it('values are within reasonable range', () => {
      const embedding = computeTextEmbedding('test embedding values');
      embedding.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const vec = [0.5, 0.5, 0.5, 0.5];
      const similarity = cosineSimilarity(vec, vec);
      expect(similarity).toBeCloseTo(1, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
      const vec1 = [1, 0, 0, 0];
      const vec2 = [0, 1, 0, 0];
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(0, 5);
    });

    it('returns -1 for opposite vectors', () => {
      const vec1 = [1, 0];
      const vec2 = [-1, 0];
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(-1, 5);
    });

    it('returns 0 for vectors of different lengths', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [1, 2];
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBe(0);
    });

    it('returns 0 for zero vectors', () => {
      const vec1 = [0, 0, 0];
      const vec2 = [0, 0, 0];
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBe(0);
    });

    it('returns 0 when one vector is zero', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [0, 0, 0];
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBe(0);
    });

    it('is commutative', () => {
      const vec1 = [0.1, 0.5, 0.3, 0.8];
      const vec2 = [0.4, 0.2, 0.6, 0.1];
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(cosineSimilarity(vec2, vec1), 10);
    });

    it('works with normalized vectors', () => {
      const vec1 = computeTextEmbedding('similar text here');
      const vec2 = computeTextEmbedding('similar text here');
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(1, 5);
    });

    it('returns high similarity for similar texts', () => {
      const vec1 = computeTextEmbedding('machine learning algorithms');
      const vec2 = computeTextEmbedding('machine learning models');
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBeGreaterThan(0.5);
    });

    it('returns lower similarity for different texts', () => {
      const vec1 = computeTextEmbedding('machine learning');
      const vec2 = computeTextEmbedding('cooking recipes');
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBeLessThan(0.5);
    });

    it('handles empty arrays', () => {
      const similarity = cosineSimilarity([], []);
      expect(similarity).toBe(0);
    });
  });
});
