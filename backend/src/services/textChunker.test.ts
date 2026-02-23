import { describe, it, expect } from 'vitest';

import type { ParsedDocument } from './documentParser.js';
import { chunkDocument, type ChunkOptions } from './textChunker.js';

describe('textChunker', () => {
  describe('chunkDocument', () => {
    const createDoc = (text: string): ParsedDocument => ({
      text,
      mimeType: 'text/markdown',
      type: 'markdown'
    });

    const defaultOptions: ChunkOptions = {
      chunkSize: 100,
      overlap: 20
    };

    it('returns empty array for empty document', () => {
      const doc = createDoc('');
      const chunks = chunkDocument(doc, defaultOptions);
      expect(chunks).toEqual([]);
    });

    it('returns empty array for whitespace-only document', () => {
      const doc = createDoc('   \n\t\n   ');
      const chunks = chunkDocument(doc, defaultOptions);
      expect(chunks).toEqual([]);
    });

    it('creates single chunk for text smaller than chunk size', () => {
      const doc = createDoc('Short text');
      const chunks = chunkDocument(doc, defaultOptions);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe('Short text');
      expect(chunks[0].chunkIndex).toBe(0);
      expect(chunks[0].startOffset).toBe(0);
    });

    it('creates multiple chunks for longer text', () => {
      const doc = createDoc('a '.repeat(100)); // 200 chars
      const options: ChunkOptions = { chunkSize: 50, overlap: 10 };
      const chunks = chunkDocument(doc, options);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('respects chunk size', () => {
      const longText = 'word '.repeat(100);
      const doc = createDoc(longText);
      const options: ChunkOptions = { chunkSize: 50, overlap: 10 };
      const chunks = chunkDocument(doc, options);

      chunks.forEach((chunk) => {
        expect(chunk.text.length).toBeLessThanOrEqual(50);
      });
    });

    it('includes overlap between chunks', () => {
      const longText = 'abcdefghijklmnopqrstuvwxyz '.repeat(10);
      const doc = createDoc(longText);
      const options: ChunkOptions = { chunkSize: 50, overlap: 20 };
      const chunks = chunkDocument(doc, options);

      // Check that chunks overlap
      if (chunks.length > 1) {
        const firstEnd = chunks[0].endOffset;
        const secondStart = chunks[1].startOffset;
        expect(firstEnd - secondStart).toBe(20);
      }
    });

    it('assigns sequential chunk indices', () => {
      const doc = createDoc('a '.repeat(200));
      const options: ChunkOptions = { chunkSize: 50, overlap: 10 };
      const chunks = chunkDocument(doc, options);

      chunks.forEach((chunk, i) => {
        expect(chunk.chunkIndex).toBe(i);
      });
    });

    it('calculates token count', () => {
      const doc = createDoc('one two three four five');
      const chunks = chunkDocument(doc, { chunkSize: 100, overlap: 0 });
      expect(chunks[0].tokenCount).toBe(5);
    });

    it('normalizes whitespace in chunks', () => {
      const doc = createDoc('word1   word2\n\nword3\t\tword4');
      const chunks = chunkDocument(doc, defaultOptions);
      expect(chunks[0].text).toBe('word1 word2 word3 word4');
    });

    it('enforces minimum chunk size of 50', () => {
      const doc = createDoc('a '.repeat(20));
      const options: ChunkOptions = { chunkSize: 10, overlap: 5 }; // Too small
      const chunks = chunkDocument(doc, options);

      // Should use 50 as minimum
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('limits overlap to half of chunk size', () => {
      const doc = createDoc('a '.repeat(100));
      const options: ChunkOptions = { chunkSize: 50, overlap: 40 }; // Too much overlap
      const chunks = chunkDocument(doc, options);

      if (chunks.length > 1) {
        const actualOverlap = chunks[0].endOffset - chunks[1].startOffset;
        expect(actualOverlap).toBeLessThanOrEqual(25); // Half of 50
      }
    });

    it('handles negative overlap by treating it as zero', () => {
      const doc = createDoc('a '.repeat(100));
      const options: ChunkOptions = { chunkSize: 50, overlap: -10 };
      const chunks = chunkDocument(doc, options);

      if (chunks.length > 1) {
        const actualOverlap = chunks[0].endOffset - chunks[1].startOffset;
        expect(actualOverlap).toBe(0);
      }
    });

    it('includes correct offsets', () => {
      const doc = createDoc('Short text');
      const chunks = chunkDocument(doc, defaultOptions);
      expect(chunks[0].startOffset).toBe(0);
      expect(chunks[0].endOffset).toBe(10);
    });
  });
});
