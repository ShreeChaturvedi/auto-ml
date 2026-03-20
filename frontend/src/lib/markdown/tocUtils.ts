import { createElement, type ReactNode } from 'react';
import type { Components } from 'react-markdown';

export interface TocHeading {
  level: 2 | 3;
  text: string;
  slug: string;
}

/**
 * Convert heading text to a DOM-safe slug with an optional prefix
 * to avoid collisions with other IDs in the page.
 *
 * The default prefix (`'plan-viewer-'`) preserves backwards compatibility
 * with existing plan-viewer anchor IDs.
 */
export function slugifyHeading(text: string, prefix = 'plan-viewer-'): string {
  return (
    prefix +
    text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  );
}

/**
 * Flatten a ReactNode tree to plain text (for slugifying rendered headings).
 */
export function extractTextContent(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractTextContent).join('');
  if (typeof node === 'object' && 'props' in node) {
    const el = node as unknown as { props: { children?: ReactNode } };
    return extractTextContent(el.props.children);
  }
  return '';
}

/**
 * Extract h2/h3 headings from raw markdown for TOC generation.
 *
 * When `cellId` is provided, slugs are prefixed with `notebook-${cellId}-`
 * to prevent collisions between markdown cells that share the same heading text.
 * When omitted, the default `'plan-viewer-'` prefix is used (backwards-compatible).
 */
export function extractTocHeadings(markdown: string, cellId?: string): TocHeading[] {
  const headings: TocHeading[] = [];
  const lines = markdown.split('\n');

  const makeSlug = (text: string): string =>
    cellId
      ? `notebook-${cellId}-${slugifyHeading(text, '')}`
      : slugifyHeading(text);

  for (const line of lines) {
    const m2 = line.match(/^##\s+(.+)$/);
    if (m2) {
      const text = m2[1].trim();
      headings.push({ level: 2, text, slug: makeSlug(text) });
      continue;
    }
    const m3 = line.match(/^###\s+(.+)$/);
    if (m3) {
      const text = m3[1].trim();
      headings.push({ level: 3, text, slug: makeSlug(text) });
    }
  }
  return headings;
}

/**
 * Factory that returns react-markdown component overrides for h1, h2, and h3.
 * Each override attaches a stable DOM `id` derived from the heading text,
 * enabling TOC scroll-to-anchor behaviour.
 *
 * @param prefix - Slug prefix passed to `slugifyHeading` (e.g. `'plan-viewer-'`)
 */
export function buildHeadingComponents(
  prefix: string
): Pick<Components, 'h1' | 'h2' | 'h3'> {
  const makeHeading = (tag: 'h1' | 'h2' | 'h3') => {
    const Component = ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLHeadingElement>) => {
      const text = extractTextContent(children);
      const id = slugifyHeading(text, prefix);
      return createElement(tag, { ...props, id }, children);
    };
    Component.displayName = `HeadingComponent_${tag}`;
    return Component;
  };

  return {
    h1: makeHeading('h1'),
    h2: makeHeading('h2'),
    h3: makeHeading('h3'),
  };
}
