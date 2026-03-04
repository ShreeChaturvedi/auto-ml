/**
 * SqlRevealBlock
 *
 * Displays generated SQL in two sequential phases:
 * - reveal phase: syntax-highlighted token stream in a <pre>
 * - review phase: Monaco SQL editor + approval controls
 */

import {
  useRef,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { cn } from '@/lib/utils';
import { Check, X, RotateCcw, AlertTriangle } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import Editor from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditorType } from 'monaco-editor';
import type { ApproveThemeClasses } from './NlQueryWorkflow';

export type SqlTokenType =
  | 'keyword'
  | 'function'
  | 'string'
  | 'number'
  | 'operator'
  | 'punctuation'
  | 'identifier'
  | 'whitespace';

export interface SqlToken {
  text: string;
  type: SqlTokenType;
}

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL',
  'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON',
  'AS', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT',
  'UNION', 'ALL', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'VIEW', 'EXISTS',
  'BETWEEN', 'LIKE', 'ILIKE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'ASC', 'DESC', 'TRUE', 'FALSE', 'WITH', 'RECURSIVE', 'OVER', 'PARTITION',
  'WINDOW', 'ROWS', 'RANGE', 'PRECEDING', 'FOLLOWING', 'CURRENT', 'ROW',
  'FETCH', 'NEXT', 'ONLY', 'FIRST', 'LAST', 'NULLS',
]);

const SQL_FUNCTIONS = new Set([
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF',
  'CAST', 'CONVERT', 'EXTRACT', 'DATE_PART', 'DATE_TRUNC',
  'UPPER', 'LOWER', 'TRIM', 'LENGTH', 'SUBSTRING', 'REPLACE',
  'CONCAT', 'STRING_AGG', 'ARRAY_AGG', 'ROW_NUMBER', 'RANK',
  'DENSE_RANK', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE',
  'ROUND', 'CEIL', 'FLOOR', 'ABS', 'NOW', 'CURRENT_TIMESTAMP',
]);

export function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let i = 0;

  while (i < sql.length) {
    if (/\s/.test(sql[i])) {
      let j = i;
      while (j < sql.length && /\s/.test(sql[j])) j++;
      tokens.push({ text: sql.slice(i, j), type: 'whitespace' });
      i = j;
      continue;
    }

    if (sql[i] === '-' && i + 1 < sql.length && sql[i + 1] === '-') {
      let j = i + 2;
      while (j < sql.length && sql[j] !== '\n') j++;
      tokens.push({ text: sql.slice(i, j), type: 'identifier' });
      i = j;
      continue;
    }

    if (sql[i] === '\'') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '\'' && sql[j + 1] === '\'') {
          j += 2;
          continue;
        }
        if (sql[j] === '\'') {
          j += 1;
          break;
        }
        j += 1;
      }
      tokens.push({ text: sql.slice(i, j), type: 'string' });
      i = j;
      continue;
    }

    if (sql[i] === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '"' && sql[j + 1] === '"') {
          j += 2;
          continue;
        }
        if (sql[j] === '"') {
          j += 1;
          break;
        }
        j += 1;
      }
      tokens.push({ text: sql.slice(i, j), type: 'identifier' });
      i = j;
      continue;
    }

    if (/\d/.test(sql[i]) || (sql[i] === '.' && i + 1 < sql.length && /\d/.test(sql[i + 1]))) {
      let j = i;
      while (j < sql.length && /[\d.]/.test(sql[j])) j++;
      tokens.push({ text: sql.slice(i, j), type: 'number' });
      i = j;
      continue;
    }

    if (/[=<>!+\-*/%|]/.test(sql[i])) {
      let j = i + 1;
      if (j < sql.length && /[=<>|]/.test(sql[j])) j++;
      tokens.push({ text: sql.slice(i, j), type: 'operator' });
      i = j;
      continue;
    }

    if (/[(),;.]/.test(sql[i])) {
      tokens.push({ text: sql[i], type: 'punctuation' });
      i++;
      continue;
    }

    if (/[a-zA-Z_]/.test(sql[i])) {
      let j = i;
      while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) j++;
      const word = sql.slice(i, j);
      const upper = word.toUpperCase();
      if (SQL_KEYWORDS.has(upper)) {
        tokens.push({ text: word, type: 'keyword' });
      } else if (SQL_FUNCTIONS.has(upper)) {
        tokens.push({ text: word, type: 'function' });
      } else {
        tokens.push({ text: word, type: 'identifier' });
      }
      i = j;
      continue;
    }

    tokens.push({ text: sql[i], type: 'identifier' });
    i++;
  }

  return tokens;
}

function tokenClassName(type: SqlTokenType): string {
  switch (type) {
    case 'keyword': return 'sql-tk-kw';
    case 'function': return 'sql-tk-fn';
    case 'string': return 'sql-tk-str';
    case 'number': return 'sql-tk-num';
    case 'operator': return 'sql-tk-op';
    case 'punctuation': return 'sql-tk-punc';
    case 'identifier': return 'sql-tk-id';
    case 'whitespace': return '';
    default: return '';
  }
}

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

function resolveEditorTheme(theme: 'light' | 'dark' | 'system'): 'light' | 'dark' {
  if (theme !== 'system') {
    return theme;
  }

  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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
  const { theme: appTheme } = useTheme();
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => resolveEditorTheme(appTheme));
  const monacoTheme = resolvedTheme === 'dark' ? 'sql-dark' : 'sql-light';

  useEffect(() => {
    setResolvedTheme(resolveEditorTheme(appTheme));

    if (appTheme !== 'system') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setResolvedTheme(e.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [appTheme]);

  useEffect(() => {
    if (!monacoApiRef.current) {
      return;
    }
    monacoApiRef.current.editor.setTheme(monacoTheme);
  }, [monacoTheme]);

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

  const sharedClassName = cn(
    'w-full min-h-[8rem] rounded-md border p-3 font-mono text-sm leading-relaxed',
    'focus-visible:outline-none',
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
            <Editor
              height="170px"
              language="sql"
              value={editedSql}
              onChange={(value) => onSqlChange(value || '')}
              onMount={(editorInstance, monaco: Monaco) => {
                monacoEditorRef.current = editorInstance;
                monacoApiRef.current = monaco;
                monaco.editor.setTheme(monacoTheme);
              }}
              theme={monacoTheme}
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
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                wordWrap: 'on',
                automaticLayout: true,
                padding: { top: 8, bottom: 8 },
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
              }}
            />
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
          <pre
            className={cn(
              sharedClassName,
              'border-border bg-muted/30 text-muted-foreground',
            )}
            aria-label="Generating SQL..."
          >
            <span className="shimmer-text inline-block">Generating SQL...</span>
          </pre>
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
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1',
                  'text-xs font-medium',
                  'border border-border bg-card text-muted-foreground',
                  'hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30',
                  'transition-colors duration-150',
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
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1',
                  'text-xs font-medium',
                  'border border-border bg-card text-muted-foreground',
                  'hover:bg-accent hover:text-accent-foreground',
                  'transition-colors duration-150',
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
