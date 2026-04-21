import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Post-build string-assertion test that confirms every marketing phrase —
// from the hero through the footer — actually lands in the static HTML.
// Run `npm --prefix landing run build` before running the test.

describe('full-page marketing copy', () => {
  const distPath = resolve(__dirname, '../../dist/index.html');
  const readDist = (): string => {
    try {
      return readFileSync(distPath, 'utf-8');
    } catch {
      throw new Error('dist/index.html not found — run `npm run build` first');
    }
  };

  it('hero through footer copy all render', () => {
    const html = readDist();
    const phrases = [
      'The fastest way to build production ML models,',
      'agentically.',
      'Now supporting GPT 5.4 class reasoning',
      'Upload your data. Describe your goal.',
      'HOW IT WORKS',
      'From raw data to a deployed model',
      '1.0 INGEST',
      '7.0 DEPLOY',
      '01 — CHAT',
      '02 — PLAN',
      '03 — NOTEBOOK',
      'SANDBOX',
      'OPTIMIZATION',
      'ORCHESTRATION',
      'ECOSYSTEM',
      'Plug into your data',
      'READY WHEN YOU ARE',
      'Stop babysitting',
      'your notebooks.',
      '© 2026 Agentic AutoML Platform',
      'Agentic AutoML',
    ];
    for (const phrase of phrases) {
      expect(html).toContain(phrase);
    }
  });

  it('no visible school attribution leaked through', () => {
    const html = readDist();
    // The attribution line was removed per user decision.
    expect(html).not.toContain('Arizona State University');
    expect(html).not.toContain('Built at Miami University');
  });
});
