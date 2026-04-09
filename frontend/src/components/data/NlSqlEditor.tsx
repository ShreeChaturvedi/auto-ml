/**
 * NlSqlEditor — three-phase SQL display for NL query generation.
 *
 * Phases:
 *  1. generating — Monaco (empty, read-only) with shimmer overlay
 *  2. revealing  — char-by-char <pre> overlay on top of Monaco (single mount)
 *  3. reviewing  — <pre> fades to opacity-0, Monaco fully visible + editable
 *
 * Monaco is mounted across all non-idle phases so the editor chrome
 * (line numbers, gutter) is always visible.
 */

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef
} from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import type { Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditorType } from 'monaco-editor';

import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { useEditorPrefsStore, getEditorMonacoOptions } from '@/stores/editorPrefsStore';
import { assignMonacoHiddenTextareaIdentity } from '@/lib/monaco/dom';
import { LazyMonacoEditor } from '@/lib/monaco/LazyMonacoEditor';
import { cn } from '@/lib/utils';
import { CHAR_ANIM_DURATION_MS } from '@/components/ui/useAnimatedPlaceholder';

import type { ApproveThemeClasses } from './NlQueryReducer';
import { tokenizeSql } from './sqlTokenize';
import { TOKEN_INLINE_COLORS, computeRevealStagger, computeRevealDuration } from './sqlRevealUtils';

interface NlSqlEditorProps {
  sql: string;
  phase: 'generating' | 'revealing' | 'reviewing';
  editedSql: string;
  onSqlChange: (value: string) => void;
  originalSql: string;
  onApprove?: () => void;
  onReject?: () => void;
  onRevealComplete: () => void;
  approveThemeClasses?: ApproveThemeClasses;
  queryExecutionError?: string | null;
  className?: string;
}

const CONTAINER_HEIGHT = 170;
const DEFAULT_CONTENT_LEFT = 30;

const MONO_FONT = '"Monaspace Neon", "JetBrains Mono", monospace';

const controlButtonClassName = cn(
  'inline-flex items-center gap-1 rounded-md px-2.5 py-1',
  'text-xs font-medium',
  'border border-border bg-card text-muted-foreground',
  'transition-colors duration-150'
);

function NlSqlEditor({
  sql,
  phase,
  editedSql,
  onSqlChange,
  onApprove,
  onReject,
  onRevealComplete,
  approveThemeClasses,
  queryExecutionError,
  className
}: NlSqlEditorProps) {
  const globalEditorOpts = useEditorPrefsStore(getEditorMonacoOptions);
  const monacoEditorRef = useRef<MonacoEditorType.IStandaloneCodeEditor | null>(null);
  const monacoApiRef = useRef<Monaco | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const contentLeftRef = useRef(DEFAULT_CONTENT_LEFT);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const revealStartRef = useRef(0);
  const { syntaxThemeId } = useProjectThemeColor();

  // Theme sync
  useEffect(() => {
    if (!monacoApiRef.current) return;
    monacoApiRef.current.editor.setTheme(syntaxThemeId);
  }, [syntaxThemeId]);

  // Tokenize for char animation
  const tokens = useMemo(() => (sql ? tokenizeSql(sql) : []), [sql]);
  const visibleCharCount = useMemo(() => {
    let count = 0;
    for (const token of tokens) {
      if (token.type !== 'whitespace') count += Array.from(token.text).length;
    }
    return count;
  }, [tokens]);

  const stagger = useMemo(() => computeRevealStagger(visibleCharCount), [visibleCharCount]);

  // ── Reveal completion timeout ────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'revealing' || !sql) return;

    revealStartRef.current = Date.now();
    const duration = computeRevealDuration(visibleCharCount);
    revealTimerRef.current = setTimeout(onRevealComplete, duration);

    return () => {
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, [phase, sql, visibleCharCount, onRevealComplete]);

  // ── Auto-scroll <pre> during reveal ──────────────────────────────────
  useEffect(() => {
    if (phase !== 'revealing' || !sql) return;

    const tick = () => {
      const pre = preRef.current;
      if (pre) {
        const elapsed = Date.now() - revealStartRef.current;
        const frontChar = Math.min(visibleCharCount, Math.floor(elapsed / stagger));
        const frontSpan = pre.querySelector<HTMLSpanElement>(`[data-char-idx="${frontChar}"]`);
        if (frontSpan) {
          pre.scrollTop = Math.max(0, frontSpan.offsetTop - CONTAINER_HEIGHT + 40);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [phase, sql, visibleCharCount, stagger]);

  // ── Focus Monaco on review ────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'reviewing') return;

    const pre = preRef.current;
    const editor = monacoEditorRef.current;
    if (pre && editor) {
      editor.setScrollTop(pre.scrollTop);
    }

    if (editor) {
      editor.focus();
      const model = editor.getModel();
      const lineCount = model?.getLineCount() ?? 1;
      const col = model?.getLineMaxColumn(lineCount) ?? 1;
      editor.setPosition({ lineNumber: lineCount, column: col });
      editor.revealLine(lineCount);
    }
  }, [phase]);

  const handleMonacoMount = useCallback((editorInstance: MonacoEditorType.IStandaloneCodeEditor, monaco: Monaco) => {
    monacoEditorRef.current = editorInstance;
    monacoApiRef.current = monaco;
    monaco.editor.setTheme(syntaxThemeId);
    assignMonacoHiddenTextareaIdentity(editorInstance.getDomNode(), 'nl-sql-editor-ime');

    const layout = editorInstance.getLayoutInfo();
    contentLeftRef.current = layout.contentLeft || DEFAULT_CONTENT_LEFT;
  }, [syntaxThemeId]);

  // ── Render ───────────────────────────────────────────────────────────
  const isGenerating = phase === 'generating';
  const isRevealing = phase === 'revealing';
  const isReviewing = phase === 'reviewing';

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        className="relative overflow-hidden rounded-md border border-border"
        style={{ height: CONTAINER_HEIGHT }}
      >
        {/* Monaco — always mounted; read-only except during reviewing */}
        <Suspense fallback={<div className="h-full w-full animate-pulse bg-primary/10" />}>
          <LazyMonacoEditor
            height={`${CONTAINER_HEIGHT}px`}
            language="sql"
            value={isGenerating ? '' : editedSql}
            onChange={(value) => onSqlChange(value || '')}
            onMount={handleMonacoMount}
            theme={syntaxThemeId}
            options={{
              ...globalEditorOpts,
              readOnly: !isReviewing,
              domReadOnly: !isReviewing,
              lineNumbersMinChars: 2,
              glyphMargin: false,
              folding: false,
              lineDecorationsWidth: 8,
              roundedSelection: false,
              scrollBeyondLastLine: false,
              scrollbar: { verticalScrollbarSize: 12 },
              automaticLayout: true,
              padding: { top: 8, bottom: 8 },
            }}
          />
        </Suspense>

        {/* Shimmer overlay during generating — sits on top of Monaco */}
        {isGenerating && (
          <div
            className="nl-editor-shimmer pointer-events-none absolute inset-0 z-[5]"
            aria-label="Generating SQL…"
          />
        )}

        {/* <pre> overlay during revealing — fades out when reviewing */}
        {(isRevealing || isReviewing) && (
          <pre
            ref={preRef}
            className={cn(
              'absolute inset-0 z-[5] m-0 pointer-events-none whitespace-pre-wrap break-words bg-background',
              'transition-opacity duration-200',
              isReviewing ? 'opacity-0' : 'opacity-100'
            )}
            style={{
              fontFamily: MONO_FONT,
              fontSize: 13,
              lineHeight: '18px',
              fontFeatureSettings: '"liga" off, "calt" off',
              paddingTop: 8,
              paddingBottom: 8,
              paddingLeft: contentLeftRef.current,
              paddingRight: 12,
              height: CONTAINER_HEIGHT,
              overflowY: 'auto'
            }}
            aria-live="polite"
            aria-label="Generated SQL (revealing)"
          >
            {isRevealing && (() => {
              let charIdx = 0;
              return tokens.map((token, ti) => {
                if (token.type === 'whitespace') {
                  return <span key={`ws-${ti}`}>{token.text}</span>;
                }
                return Array.from(token.text).map((char, ci) => {
                  const idx = charIdx++;
                  const delay = idx * stagger;
                  return (
                    <span
                      key={`t${ti}-c${ci}`}
                      data-char-idx={idx}
                      style={{
                        '--sql-token-color': TOKEN_INLINE_COLORS[token.type],
                        animation: `sql-placeholder-char-in ${CHAR_ANIM_DURATION_MS}ms ease-out both`,
                        animationDelay: `${delay}ms`,
                      } as React.CSSProperties}
                    >
                      {char}
                    </span>
                  );
                });
              });
            })()}
          </pre>
        )}
      </div>

      {/* Approve / Reject buttons */}
      {isReviewing && (
        <div
          className={cn(
            'flex items-center justify-end gap-1.5 px-2',
            'animate-in fade-in slide-in-from-bottom-1 duration-200'
          )}
        >
          {onReject && (
            <button
              type="button"
              onClick={onReject}
              className={cn(
                controlButtonClassName,
                'hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30'
              )}
              aria-label="Reject generated SQL"
            >
              <X className="h-3 w-3" />
              Reject
            </button>
          )}

          {onApprove && (
            <button
              type="button"
              onClick={onApprove}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-3 py-1',
                'text-xs font-medium border border-border/70 bg-background/80 text-muted-foreground',
                'transition-colors duration-150',
                approveThemeClasses?.hoverText,
                approveThemeClasses?.hoverBorder,
                approveThemeClasses?.hoverBg
              )}
              aria-label="Approve and run this SQL"
            >
              <Check className="h-3 w-3" />
              Approve &amp; Run
            </button>
          )}
        </div>
      )}

      {/* Query execution error */}
      {isReviewing && queryExecutionError && (
        <div
          className={cn(
            'rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs',
            'text-foreground',
            'animate-in fade-in slide-in-from-bottom-1 duration-300'
          )}
          style={{ animationDelay: '180ms', animationFillMode: 'both' }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
            <p className="leading-relaxed">
              <span className="font-medium">Initial execution failed:</span> {queryExecutionError}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

NlSqlEditor.displayName = 'NlSqlEditor';

export { NlSqlEditor };
export type { NlSqlEditorProps };
