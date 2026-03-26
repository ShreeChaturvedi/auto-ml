import { createElement, type ReactNode } from 'react';
import type { Components } from 'react-markdown';

import { escapeRegExp } from '@/lib/utils';
import { buildHeadingComponents } from '@/lib/markdown/tocUtils';

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
export function buildMarkdownComponents(searchQuery: string, prefix = 'plan-viewer-'): Components {
  const base: Components = {
    ...buildHeadingComponents(prefix),
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
