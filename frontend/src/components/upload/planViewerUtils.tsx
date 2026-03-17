import { createElement, type ReactNode } from 'react';
import type { Components } from 'react-markdown';

export interface TocHeading {
  level: 2 | 3;
  text: string;
  slug: string;
}

const SLUG_PREFIX = 'plan-viewer-';

/**
 * Convert heading text to a DOM-safe slug with plan-viewer- prefix
 * to avoid collisions with other IDs in the page.
 */
export function slugifyHeading(text: string): string {
  return (
    SLUG_PREFIX +
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
 */
export function extractTocHeadings(markdown: string): TocHeading[] {
  const headings: TocHeading[] = [];
  const lines = markdown.split('\n');
  for (const line of lines) {
    const m2 = line.match(/^##\s+(.+)$/);
    if (m2) {
      const text = m2[1].trim();
      headings.push({ level: 2, text, slug: slugifyHeading(text) });
      continue;
    }
    const m3 = line.match(/^###\s+(.+)$/);
    if (m3) {
      const text = m3[1].trim();
      headings.push({ level: 3, text, slug: slugifyHeading(text) });
    }
  }
  return headings;
}

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Recursively walk ReactNode children, splitting text nodes on regex match
 * and wrapping hits in <mark>.
 */
function highlightText(children: ReactNode, regex: RegExp): ReactNode {
  if (children == null || typeof children === 'boolean') return children;
  if (typeof children === 'number') return children;

  if (typeof children === 'string') {
    if (!regex.test(children)) return children;

    const result: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    const globalRegex = new RegExp(regex.source, 'gi');

    while ((match = globalRegex.exec(children)) !== null) {
      if (match.index > lastIndex) {
        result.push(children.slice(lastIndex, match.index));
      }
      result.push(
        createElement('mark', {
          key: match.index,
          className: 'bg-yellow-200/70 dark:bg-yellow-500/30 rounded-sm px-0.5',
        }, match[0])
      );
      lastIndex = globalRegex.lastIndex;
    }
    if (lastIndex < children.length) {
      result.push(children.slice(lastIndex));
    }
    return result.length > 0 ? result : children;
  }

  if (Array.isArray(children)) {
    return children.map((child, i) => {
      const highlighted = highlightText(child, regex);
      if (highlighted !== child && Array.isArray(highlighted)) {
        return createElement('span', { key: i }, ...highlighted);
      }
      return highlighted;
    });
  }

  if (typeof children === 'object' && 'props' in children) {
    const element = children as unknown as { props: { children?: ReactNode } };
    const newChildren = highlightText(element.props.children, regex);
    if (newChildren !== element.props.children) {
      return newChildren;
    }
  }

  return children;
}

/**
 * Build react-markdown component overrides for heading IDs and optional search highlighting.
 */
export function buildMarkdownComponents(searchQuery: string): Components {
  const headingRenderer = (tag: 'h2' | 'h3') => {
    const Component = ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
      const text = extractTextContent(children);
      const id = slugifyHeading(text);
      return createElement(tag, { ...props, id }, children);
    };
    Component.displayName = `PlanViewer${tag}`;
    return Component;
  };

  const base: Components = {
    h2: headingRenderer('h2'),
    h3: headingRenderer('h3'),
  };

  if (!searchQuery.trim()) return base;

  const regex = new RegExp(escapeRegExp(searchQuery.trim()), 'gi');

  const withHighlight = (tag: string) => {
    const Component = ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => {
      const highlighted = highlightText(children, regex);
      return createElement(tag, props, highlighted);
    };
    Component.displayName = `Highlighted${tag}`;
    return Component;
  };

  return {
    ...base,
    p: withHighlight('p'),
    li: withHighlight('li'),
    td: withHighlight('td'),
    blockquote: withHighlight('blockquote'),
    code: ({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) => {
      if (className && /language-/.test(className)) {
        return createElement('code', { ...props, className }, children);
      }
      const highlighted = highlightText(children, regex);
      return createElement('code', { ...props, className }, highlighted);
    },
  };
}
