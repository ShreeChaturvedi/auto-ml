import { useCallback, useRef } from 'react';
import DOMPurify from 'dompurify';

/**
 * Renders arbitrary HTML inside an open Shadow DOM root.
 *
 * Why Shadow DOM instead of an iframe?
 *  - CSS custom properties (--background, --foreground, etc.) cascade from the
 *    host page into the shadow tree, so kernel HTML inherits the current theme.
 *  - No cross-origin restrictions or height-sizing hacks — the content is
 *    inline DOM, measured naturally.
 *  - Style isolation still works: styles defined inside the shadow root don't
 *    leak outward, and the host page's Tailwind classes don't bleed in.
 */

/**
 * Minimal stylesheet injected into every shadow root.
 * Uses the host page's CSS variables so content adapts to light/dark theme.
 */
const SHADOW_STYLES = `
  :host {
    display: block;
    font-family: "Monaspace Neon", "JetBrains Mono", ui-monospace, monospace;
    font-size: 12px;
    line-height: 1.5;
    color: hsl(var(--foreground));
    overflow-x: auto;
  }

  /* DataFrame / general table styling */
  table {
    border-collapse: collapse;
    border: none;
    font-size: 12px;
    width: auto;
  }
  table.dataframe {
    border: 1px solid hsl(var(--border));
  }
  th, td {
    padding: 4px 10px;
    border: 1px solid hsl(var(--border));
    text-align: left;
    white-space: nowrap;
  }
  thead th {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    font-weight: 600;
  }
  tbody tr:nth-child(even) {
    background: hsl(var(--muted) / 0.4);
  }
  tbody th {
    background: hsl(var(--muted) / 0.6);
    color: hsl(var(--muted-foreground));
    font-weight: 500;
  }

  /* Links */
  a { color: hsl(var(--primary)); }

  /* Plotly / embedded visualizations */
  .plotly, .js-plotly-plot { width: 100%; }

  /* Prevent kernel CSS from overflowing the cell */
  img, svg { max-width: 100%; height: auto; }
`;

interface ShadowHtmlProps {
  html: string;
  className?: string;
}

export function ShadowHtml({ html, className }: ShadowHtmlProps) {
  const shadowRef = useRef<ShadowRoot | null>(null);

  // Attach the shadow root once on mount
  const attachShadow = useCallback((node: HTMLDivElement | null) => {
    if (!node || shadowRef.current) return;
    shadowRef.current = node.attachShadow({ mode: 'open' });
  }, []);

  // Attach shadow and set content via ref callback — avoids useEffect race
  const setContent = useCallback((node: HTMLDivElement | null) => {
    attachShadow(node);
    const shadow = shadowRef.current;
    if (shadow) {
      const sanitized = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'span', 'p',
          'b', 'i', 'em', 'strong', 'code', 'pre', 'ul', 'ol', 'li', 'h1', 'h2', 'h3',
          'h4', 'h5', 'h6', 'br', 'hr', 'a', 'img', 'svg', 'path', 'figure', 'figcaption',
          'caption', 'colgroup', 'col', 'sup', 'sub', 'small', 'mark', 'abbr'],
        ALLOWED_ATTR: ['class', 'style', 'href', 'src', 'alt', 'title', 'width', 'height',
          'colspan', 'rowspan', 'scope', 'align', 'valign', 'd', 'viewBox', 'fill',
          'stroke', 'xmlns', 'target', 'rel'],
        ALLOW_DATA_ATTR: false,
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'button'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
      });
      shadow.innerHTML = `<style>${SHADOW_STYLES}</style>${sanitized}`;
    }
  }, [attachShadow, html]);

  return <div ref={setContent} className={className} />;
}
