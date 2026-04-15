import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('hero heading motion', () => {
  it('uses a real text deblur on the hero title spans', () => {
    const source = readFileSync(
      resolve(__dirname, '../components/Hero.astro'),
      'utf8',
    );

    expect(source).toContain('.hero-title-bright');
    expect(source).toContain('.hero-title-muted');
    expect(source).toContain('filter: blur(18px);');
    expect(source).toContain('@keyframes hero-title-deblur');
    expect(source).toContain('animation: hero-title-deblur 780ms');
    expect(source).toContain('will-change: opacity, transform, filter;');
    expect(source).toContain('line-height: 1.06;');
    expect(source).toContain('padding-bottom: 0.08em;');
    expect(source).toContain('transform: translateY(');
    expect(source).not.toContain('contain: paint;');
    expect(source).not.toContain('62% {');
    expect(source).not.toContain('.hero-title-bright::after');
    expect(source).not.toContain('.hero-title-muted::after');
    expect(source).not.toContain('content: attr(data-text);');
  });
});
