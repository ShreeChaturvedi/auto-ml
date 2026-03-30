/**
 * SqlRevealBlock
 *
 * Displays generated SQL in two sequential phases:
 * - reveal phase: syntax-highlighted token stream in a <pre>
 * - review phase: Monaco SQL editor + approval controls
 */

import {
  Suspense,
  useRef,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { cn } from '@/lib/utils';
import { Check, X, RotateCcw, AlertTriangle } from 'lucide-react';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { LazyMonacoEditor } from '@/lib/monaco/LazyMonacoEditor';
import type { Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditorType } from 'monaco-editor';
import type { ApproveThemeClasses } from './NlQueryWorkflow';
import { tokenizeSql } from './sqlTokenize';
import {
  tokenClassName,
  GENERATION_STATUS_STEPS,
  GENERATION_SKELETON_WIDTHS,
} from './sqlRevealUtils';

interface SqlRevealBlockProps {
  sql: string;
  queryExecutionError?: string | null;
  isRevealing: boolean;
  visibleTokenCount: number;
  isRevealComplete: boolean;
  editedSql: string;
  onSqlChange: (value: string) => void;
  originalSql: string;
  onApprove?: () => void;
  onReject?: () => void;
  approveThemeClasses?: ApproveThemeClasses;
  className?: string;
}

function SqlRevealBlock({
  sql,
  queryExecutionError,
  isRevealing,
  visibleTokenCount,
  isRevealComplete,
  editedSql,
  onSqlChange,
  originalSql,
  onApprove,
  onReject,
  approveThemeClasses,
  className,
}: SqlRevealBlockProps) {
  const monacoEditorRef = useRef<MonacoEditorType.IStandaloneCodeEditor | null>(null);
  const monacoApiRef = useRef<Monaco | null>(null);
  const isEdited = editedSql !== originalSql;
  const tokens = useMemo(() => tokenizeSql(sql), [sql]);
  const showGeneratingSurface = !sql && !isRevealComplete;
  const [generationStep, setGenerationStep] = useState(0);
  const { syntaxThemeId } = useProjectThemeColor();

  useEffect(() => {
    if (!monacoApiRef.current) return;
    monacoApiRef.current.editor.setTheme(syntaxThemeId);
  }, [syntaxThemeId]);

  useEffect(() => {
    if (isRevealComplete && monacoEditorRef.current) {
      monacoEditorRef.current.focus();
      const model = monacoEditorRef.current.getModel();
      const lineCount = model?.getLineCount() ?? 1;
      const col = model?.getLineMaxColumn(lineCount) ?? 1;
      monacoEditorRef.current.setPosition({ lineNumber: lineCount, column: col });
      monacoEditorRef.current.revealLine(lineCount);
    }
  }, [isRevealComplete]);

  useEffect(() => {
    if (!showGeneratingSurface) {
      setGenerationStep(0);
      return;
    }

    const interval = window.setInterval(() => {
      setGenerationStep((previous) => (previous + 1) % GENERATION_STATUS_STEPS.length);
    }, 1250);

    return () => window.clearInterval(interval);
  }, [showGeneratingSurface]);

  const sharedClassName = cn(
    'w-full min-h-[8rem] rounded-md border p-3 font-mono text-sm leading-relaxed',
    'focus-visible:outline-none',
  );
  const controlButtonClassName = cn(
    'inline-flex items-center gap-1 rounded-md px-2.5 py-1',
    'text-xs font-medium',
    'border border-border bg-card text-muted-foreground',
    'transition-colors duration-150'
  );

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="relative">
        {isRevealComplete ? (
          <div
            className={cn(
              'w-full min-h-[8rem] rounded-md border border-primary/30 bg-primary/5 overflow-hidden',
              'transition-colors duration-200',
            )}
          >
            <Suspense fallback={<div className="h-[170px] w-full animate-pulse bg-primary/10" />}>
              <LazyMonacoEditor
                height="170px"
                language="sql"
                value={editedSql}
                onChange={(value) => onSqlChange(value || '')}
                onMount={(editorInstance, monaco: Monaco) => {
                  monacoEditorRef.current = editorInstance;
                  monacoApiRef.current = monaco;
                  monaco.editor.setTheme(syntaxThemeId);
                }}
                theme={syntaxThemeId}
                options={{
                  readOnly: false,
                  domReadOnly: false,
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  lineNumbersMinChars: 2,
                  glyphMargin: false,
                  folding: false,
                  lineDecorationsWidth: 8,
                  roundedSelection: false,
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  fontFamily: '"Monaspace Neon", "JetBrains Mono", monospace',
                  wordWrap: 'on',
                  automaticLayout: true,
                  padding: { top: 8, bottom: 8 },
                  cursorBlinking: 'smooth',
                  cursorSmoothCaretAnimation: 'on',
                }}
              />
            </Suspense>
          </div>
        ) : sql ? (
          <pre
            className={cn(
              sharedClassName,
              'overflow-x-auto whitespace-pre-wrap break-words border-border bg-background',
              isRevealing && 'nl-typewriter-cursor',
            )}
            aria-live="polite"
            aria-label="Generated SQL (being typed)"
          >
            {tokens.slice(0, visibleTokenCount).map((token, i) => (
              <span
                key={i}
                className={cn(
                  tokenClassName(token.type),
                  token.type !== 'whitespace' && 'sql-word-enter',
                )}
              >
                {token.text}
              </span>
            ))}
          </pre>
        ) : (
          <div
            className={cn(
              sharedClassName,
              'sql-generation-surface border-border bg-muted/30 text-muted-foreground',
            )}
            aria-label="Generating SQL..."
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground/85">
                SQL generation in progress
              </p>
              <span className="text-[11px] text-muted-foreground">Live model synthesis</span>
            </div>

            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {GENERATION_STATUS_STEPS[generationStep]}
            </p>

            <div className="mt-3 space-y-1.5">
              {GENERATION_SKELETON_WIDTHS.map((width, index) => {
                const isActiveLine = index === generationStep % GENERATION_SKELETON_WIDTHS.length;
                return (
                  <div
                    key={`sql-gen-line-${index}`}
                    className={cn(
                      'h-2 rounded-full bg-muted-foreground/18 transition-opacity duration-300',
                      isActiveLine && 'sql-generation-line-active',
                    )}
                    style={{ width: `${width}%` }}
                  />
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
              {GENERATION_STATUS_STEPS.map((_, index) => (
                <span
                  key={`sql-gen-dot-${index}`}
                  className={cn(
                    'h-1.5 w-1.5 rounded-full bg-muted-foreground/30 transition-colors duration-300',
                    generationStep === index && 'sql-generation-dot-active',
                  )}
                />
              ))}
            </div>
          </div>
        )}

        {isRevealComplete && (onApprove || onReject || isEdited) && (
          <div
            className={cn(
              'flex items-center gap-1.5 mt-1.5',
              'animate-in fade-in slide-in-from-bottom-1 duration-200',
            )}
          >
            {onReject && (
              <button
                type="button"
                onClick={onReject}
                className={cn(
                  controlButtonClassName,
                  'hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30',
                )}
                aria-label="Reject generated SQL"
              >
                <X className="h-3 w-3" />
                Reject
              </button>
            )}

            {isEdited && (
              <button
                type="button"
                onClick={() => onSqlChange(originalSql)}
                className={cn(
                  controlButtonClassName,
                  'hover:bg-accent hover:text-accent-foreground',
                )}
                aria-label="Reset SQL to original generated version"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            )}

            <div className="flex-1" />

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
                  approveThemeClasses?.hoverBg,
                )}
                aria-label="Approve and run this SQL"
              >
                <Check className="h-3 w-3" />
                Approve &amp; Run
              </button>
            )}
          </div>
        )}
      </div>

      {isRevealComplete && queryExecutionError && (
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

SqlRevealBlock.displayName = 'SqlRevealBlock';

export { SqlRevealBlock };
export type { SqlRevealBlockProps };
