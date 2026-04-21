import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Read the built HTML from dist/ and assert the marketing strings exist.
// Run `npm run build --workspace=landing` before running tests.

describe('marketing DOM (post-build)', () => {
  const distPath = resolve(__dirname, '../../dist/index.html');

  const readDist = (): string => {
    try {
      return readFileSync(distPath, 'utf-8');
    } catch {
      throw new Error('dist/index.html not found — run `npm run build` first');
    }
  };

  it('contains the hero H1 first line', () => {
    expect(readDist()).toContain('The fastest way to build production ML models,');
  });

  it('contains the hero H1 second line', () => {
    expect(readDist()).toContain('agentically.');
  });

  it('contains the subhead', () => {
    expect(readDist()).toContain('Upload your data. Describe your goal.');
  });

  it('contains the pulse announcement', () => {
    expect(readDist()).toContain('Now supporting GPT 5.4 class reasoning');
  });

  it('contains the primary CTA', () => {
    expect(readDist()).toContain('Get Started');
  });

  it('contains all 3 nav link labels', () => {
    const html = readDist();
    // "Quick Look" replaces the old nav label. "Product" still renders in the
    // footer column heading, so it must remain present in the built HTML.
    expect(html).toContain('Quick Look');
    expect(html).toContain('Product');
    expect(html).toContain('Features');
    expect(html).toContain('How it works');
  });
});
