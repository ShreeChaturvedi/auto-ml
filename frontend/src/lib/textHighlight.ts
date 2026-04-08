import { cloneElement, createElement, isValidElement, type ReactNode } from 'react';

export const SEARCH_MARK_CLASS = 'bg-yellow-200/70 dark:bg-yellow-500/30 rounded-sm px-0.5';

/**
 * Recursively walk ReactNode children, splitting text nodes on regex match
 * and wrapping hits in <mark>. Preserves wrapper elements (strong, em, etc.).
 */
export function highlightText(children: ReactNode, regex: RegExp): ReactNode {
  if (children == null || typeof children === 'boolean') return children;
  if (typeof children === 'number') return children;

  if (typeof children === 'string') {
    // Fresh regex avoids lastIndex contamination from a shared g-flagged instance
    if (!new RegExp(regex.source, 'i').test(children)) return children;

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
          className: SEARCH_MARK_CLASS,
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

  // Preserve wrapper elements (strong, em, a, etc.) by cloning with updated children
  if (isValidElement(children)) {
    const props = children.props as { children?: ReactNode };
    const newChildren = highlightText(props.children, regex);
    if (newChildren !== props.children) {
      return cloneElement(children, {}, newChildren);
    }
  }

  return children;
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch]);
}

/**
 * Return an HTML string with `<mark>` wrapping regex matches.
 * For use with react-pdf's customTextRenderer (injects via innerHTML).
 * HTML-escapes all text to prevent injection. Uses no inline classes —
 * PDF marks are styled via `.textLayer mark` CSS rule.
 */
export function highlightTextItem(str: string, regex: RegExp): string {
  const globalRegex = new RegExp(regex.source, 'gi');
  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = globalRegex.exec(str)) !== null) {
    if (match.index > lastIndex) {
      parts.push(escapeHtml(str.slice(lastIndex, match.index)));
    }
    parts.push(`<mark>${escapeHtml(match[0])}</mark>`);
    lastIndex = globalRegex.lastIndex;
  }

  if (lastIndex < str.length) {
    parts.push(escapeHtml(str.slice(lastIndex)));
  }

  return parts.length > 0 ? parts.join('') : escapeHtml(str);
}
