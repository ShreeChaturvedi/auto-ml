import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('deep-dive copy (post-build)', () => {
  const distPath = resolve(__dirname, '../../dist/index.html');
  const readDist = () => readFileSync(distPath, 'utf-8');

  it('contains all 3 deep-dive eyebrows', () => {
    const html = readDist();
    expect(html).toContain('01 — CHAT');
    expect(html).toContain('02 — PLAN');
    expect(html).toContain('03 — NOTEBOOK');
  });

  it('contains the chat headline', () => {
    expect(readDist()).toContain('Talk to your data like a colleague.');
  });

  it('contains the plan headline', () => {
    expect(readDist()).toContain('Turn intent into a training plan.');
    expect(readDist()).toContain('Radio buttons, not prompt engineering.');
  });

  it('contains the notebook headline', () => {
    expect(readDist()).toContain('A real notebook, not a pipeline.');
    expect(readDist()).toContain('Pandas, sklearn, Plotly — every cell editable.');
  });
});
