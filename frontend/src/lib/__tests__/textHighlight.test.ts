import { describe, expect, it } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { highlightText, highlightTextItem } from '../textHighlight';

function renderToStrings(node: ReactNode): string[] {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(renderToStrings);
  if (typeof node === 'object' && 'props' in node) {
    const el = node as { type: string | ((...args: unknown[]) => unknown); props: { children?: ReactNode; className?: string } };
    if (el.type === 'mark') return [`<mark>${renderToStrings(el.props.children).join('')}</mark>`];
    if (el.type === 'span') return renderToStrings(el.props.children);
    if (el.type === 'strong') return [`<strong>${renderToStrings(el.props.children).join('')}</strong>`];
    if (el.type === 'em') return [`<em>${renderToStrings(el.props.children).join('')}</em>`];
    return renderToStrings(el.props.children);
  }
  return [];
}

describe('highlightText', () => {
  const regex = /hello/gi;

  it('returns original when no match', () => {
    const result = highlightText('world', regex);
    expect(result).toBe('world');
  });

  it('wraps matches in <mark> elements', () => {
    const result = highlightText('say hello there', regex);
    const strings = renderToStrings(result);
    expect(strings).toEqual(['say ', '<mark>hello</mark>', ' there']);
  });

  it('handles multiple matches in one string', () => {
    const result = highlightText('hello world hello', regex);
    const strings = renderToStrings(result);
    expect(strings).toEqual(['<mark>hello</mark>', ' world ', '<mark>hello</mark>']);
  });

  it('skips non-string children', () => {
    expect(highlightText(42, regex)).toBe(42);
    expect(highlightText(null, regex)).toBeNull();
    expect(highlightText(true, regex)).toBe(true);
  });

  it('walks arrays of children', () => {
    const children = ['hello ', createElement('span', null, 'hello')];
    const result = highlightText(children, regex);
    expect(Array.isArray(result)).toBe(true);
  });

  it('is case-insensitive', () => {
    const result = highlightText('HELLO Hello', regex);
    const strings = renderToStrings(result);
    expect(strings).toEqual(['<mark>HELLO</mark>', ' ', '<mark>Hello</mark>']);
  });

  it('preserves wrapper elements like <strong>', () => {
    const child = createElement('strong', null, 'say hello');
    const result = highlightText(child, regex);
    const strings = renderToStrings(result);
    expect(strings).toEqual(['<strong>say <mark>hello</mark></strong>']);
  });

  it('preserves wrapper elements like <em>', () => {
    const child = createElement('em', null, 'hello world');
    const result = highlightText(child, regex);
    const strings = renderToStrings(result);
    expect(strings).toEqual(['<em><mark>hello</mark> world</em>']);
  });

  it('does not break with a shared g-flagged regex across calls', () => {
    const shared = /test/gi;
    const r1 = highlightText('test one', shared);
    const r2 = highlightText('test two', shared);
    expect(renderToStrings(r1)).toEqual(['<mark>test</mark>', ' one']);
    expect(renderToStrings(r2)).toEqual(['<mark>test</mark>', ' two']);
  });
});

describe('highlightTextItem', () => {
  it('returns HTML string with <mark> wrapping', () => {
    const regex = /world/gi;
    const result = highlightTextItem('hello world today', regex);
    expect(result).toBe('hello <mark>world</mark> today');
  });

  it('returns unmodified string when no match', () => {
    const regex = /xyz/gi;
    expect(highlightTextItem('hello', regex)).toBe('hello');
  });

  it('wraps multiple matches', () => {
    const regex = /a/gi;
    const result = highlightTextItem('banana', regex);
    expect(result).toContain('<mark');
    expect((result.match(/<mark/g) ?? []).length).toBe(3);
  });

  it('HTML-escapes matched text to prevent injection', () => {
    const regex = /test/gi;
    const result = highlightTextItem('<b>test</b>', regex);
    expect(result).not.toContain('<mark><b>');
    expect(result).toContain('&lt;b&gt;');
    expect(result).toContain('<mark>test</mark>');
  });
});
