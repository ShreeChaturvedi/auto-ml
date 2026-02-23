import { describe, it, expect } from 'vitest';

import { parseDocument } from './documentParser.js';

describe('documentParser', () => {
  describe('parseDocument', () => {
    describe('text files', () => {
      it('parses plain text', async () => {
        const buffer = Buffer.from('Hello, world!');
        const result = await parseDocument(buffer, 'text/plain');

        expect(result.text).toBe('Hello, world!');
        expect(result.mimeType).toBe('text/plain');
        expect(result.type).toBe('text');
      });

      it('parses markdown as markdown type', async () => {
        const buffer = Buffer.from('# Heading\n\nSome text');
        const result = await parseDocument(buffer, 'text/markdown');

        expect(result.text).toBe('# Heading\n\nSome text');
        expect(result.type).toBe('markdown');
      });

      it('parses text/md as text type (does not contain "markdown")', async () => {
        // Note: text/md doesn't include 'markdown' in the string,
        // so it returns 'text' type per current implementation
        const buffer = Buffer.from('# Title');
        const result = await parseDocument(buffer, 'text/md');

        expect(result.type).toBe('text');
      });

      it('parses text/x-markdown as markdown type', async () => {
        const buffer = Buffer.from('## Subtitle');
        const result = await parseDocument(buffer, 'text/x-markdown');

        expect(result.type).toBe('markdown');
      });

      it('parses HTML as text', async () => {
        const buffer = Buffer.from('<html><body>Content</body></html>');
        const result = await parseDocument(buffer, 'text/html');

        expect(result.text).toContain('Content');
        expect(result.type).toBe('text');
      });

      it('parses JSON as text', async () => {
        const buffer = Buffer.from('{"key": "value"}');
        const result = await parseDocument(buffer, 'application/json');

        expect(result.text).toBe('{"key": "value"}');
        expect(result.type).toBe('text');
      });
    });

    describe('UTF-8 handling', () => {
      it('handles UTF-8 encoded text', async () => {
        const buffer = Buffer.from('Hello UTF-8!', 'utf8');
        const result = await parseDocument(buffer, 'text/plain');

        expect(result.text).toBe('Hello UTF-8!');
      });

      it('handles empty buffer', async () => {
        const buffer = Buffer.from('');
        const result = await parseDocument(buffer, 'text/plain');

        expect(result.text).toBe('');
      });

      it('handles buffer with newlines', async () => {
        const buffer = Buffer.from('Line 1\nLine 2\nLine 3');
        const result = await parseDocument(buffer, 'text/plain');

        expect(result.text).toContain('Line 1');
        expect(result.text).toContain('Line 2');
      });
    });

    describe('fallback behavior', () => {
      it('falls back to text for unknown mime type', async () => {
        const buffer = Buffer.from('Some content');
        const result = await parseDocument(buffer, 'application/unknown');

        expect(result.text).toBe('Some content');
        expect(result.type).toBe('text');
      });

      it('falls back to text when no mime type provided', async () => {
        const buffer = Buffer.from('Default content');
        const result = await parseDocument(buffer);

        expect(result.text).toBe('Default content');
        expect(result.mimeType).toBe('text/plain');
      });

      it('returns unknown type for empty content without mime', async () => {
        const buffer = Buffer.from('');
        const result = await parseDocument(buffer);

        expect(result.type).toBe('unknown');
      });
    });

    describe('special characters', () => {
      it('preserves special characters', async () => {
        const text = 'Special: @#$%^&*()';
        const buffer = Buffer.from(text);
        const result = await parseDocument(buffer, 'text/plain');

        expect(result.text).toBe(text);
      });

      it('preserves tabs and spaces', async () => {
        const text = 'Tab:\tSpace:   End';
        const buffer = Buffer.from(text);
        const result = await parseDocument(buffer, 'text/plain');

        expect(result.text).toBe(text);
      });
    });
  });
});
