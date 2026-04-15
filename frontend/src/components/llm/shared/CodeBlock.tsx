/**
 * CodeBlock — Monaco-backed read-only code rendering that matches
 * the notebook cell's syntax highlighting exactly.
 *
 * Lazy-mounts Monaco via `IntersectionObserver`: until the card enters
 * the viewport we render a cheap `<pre>` fallback. A chat history with
 * many code cards only pays the Monaco cost for cards the user actually
 * scrolls to.
 *
 * Theme is driven by `useProjectThemeColor().syntaxThemeId`, the same
 * source the notebook uses, so the palette re-hues when the active
 * project accent changes.
 */

import * as React from 'react';
import { Suspense } from 'react';
import { cn } from '@/lib/utils';
import { LazyMonacoEditor } from '@/lib/monaco/LazyMonacoEditor';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import type { editor } from 'monaco-editor';

export interface CodeBlockProps {
  code: string;
  language?: string;
  maxHeight?: number | 'auto';
  showLineNumbers?: boolean;
  className?: string;
}

/**
 * A readable plain-text fallback rendered:
 *   1. before the card scrolls into view (IntersectionObserver gate),
 *   2. during Monaco's cold-start Suspense boundary.
 * Keeps line wrapping and a mono font so the transition to Monaco is
 * visually continuous.
 */
function CodeFallback({ code, className }: { code: string; className?: string }) {
  return (
    <pre
      className={cn(
        'overflow-auto p-3 text-[12px] font-mono leading-relaxed whitespace-pre-wrap text-foreground/80',
        className,
      )}
    >
      <code>{code}</code>
    </pre>
  );
}

/** Inner component — only rendered once the card intersects the viewport. */
function MonacoCodeBlock({
  code,
  language,
  height,
  showLineNumbers,
}: {
  code: string;
  language: string;
  height: string;
  showLineNumbers: boolean;
}) {
  const { syntaxThemeId } = useProjectThemeColor();

  return (
    <Suspense fallback={<CodeFallback code={code} />}>
      <LazyMonacoEditor
        height={height}
        language={language}
        value={code}
        theme={syntaxThemeId}
        onMount={(ed, monaco) => {
          monaco.editor.setTheme(syntaxThemeId);
          const e = ed as editor.IStandaloneCodeEditor;
          e.updateOptions({ readOnly: true, domReadOnly: true });
        }}
        options={{
          readOnly: true,
          domReadOnly: true,
          minimap: { enabled: false },
          glyphMargin: false,
          folding: false,
          scrollBeyondLastLine: false,
          renderLineHighlight: 'none',
          overviewRulerBorder: false,
          overviewRulerLanes: 0,
          lineNumbers: showLineNumbers ? 'on' : 'off',
          // Monaco has no "horizontal padding" knob. `lineDecorationsWidth`
          // reserves a gutter between the viewport edge and the first glyph
          // of source — set to 12px (matching the `<pre>` fallback's `p-3`)
          // so code never visually touches the card's left border.
          lineDecorationsWidth: 12,
          lineNumbersMinChars: showLineNumbers ? undefined : 0,
          fontSize: 12,
          lineHeight: 18,
          contextmenu: false,
          automaticLayout: true,
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
          padding: { top: 8, bottom: 8 },
        }}
      />
    </Suspense>
  );
}

export function CodeBlock({
  code,
  language = 'python',
  maxHeight = 400,
  showLineNumbers = false,
  className,
}: CodeBlockProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || visible) return;

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  // Compute the fixed pixel height Monaco needs — the editor cannot size
  // to content. Counts lines via `indexOf` in a single pass so long code
  // cells don't allocate a full split-array on every render.
  const heightPx = React.useMemo(() => {
    let lines = 1;
    for (let i = 0; i < code.length; i++) {
      if (code.charCodeAt(i) === 10) lines++;
    }
    const cap = maxHeight === 'auto' ? 400 : maxHeight;
    return `${Math.min(lines * 18 + 16, cap)}px`;
  }, [code, maxHeight]);

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      style={{ minHeight: heightPx }}
    >
      {visible && maxHeight !== 'auto' ? (
        <MonacoCodeBlock
          code={code}
          language={language}
          height={heightPx}
          showLineNumbers={showLineNumbers}
        />
      ) : (
        <CodeFallback code={code} />
      )}
    </div>
  );
}
