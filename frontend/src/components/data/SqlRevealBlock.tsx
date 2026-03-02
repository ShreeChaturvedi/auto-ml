/**
 * SqlRevealBlock
 *
 * Displays generated SQL in two sequential phases:
 *
 * Revealing phase
 * ───────────────
 * A <pre> element renders syntax-highlighted SQL tokens one-by-one as the
 * `visibleTokenCount` advances (driven by the useTypewriter hook in
 * NlQueryWorkflow).  Each non-whitespace token enters with the
 * `.sql-word-enter` CSS animation — a subtle brightness flash + fade-in
 * inspired by the animated-placeholder character entrance.
 *
 * Reviewing phase (isRevealComplete = true)
 * ──────────────────────────────────────────
 * The <pre> is swapped for a scrollable <textarea> that the user can freely
 * edit before approving.  Visual affordances indicate the SQL is editable:
 *   • A thin primary-tinted border + faint primary background
 *   • A "Reset" badge appears bottom-right when the content differs from the
 *     server-generated original
 *
 * Rationale
 * ─────────
 * When a non-empty `rationale` string is supplied the component renders a
 * short explanatory paragraph below the SQL area.  It appears with a gentle
 * fade-in + upward-slide entrance animation so it doesn't distract from the
 * SQL reveal but is easy to read once the typing is done.
 */

import { useRef, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';

// ─── SQL tokenizer ────────────────────────────────────────────────────────────

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

/**
 * Split a SQL string into a flat list of tokens suitable for syntax
 * highlighting and word-by-word reveal animation.
 *
 * The tokenizer is intentionally simple — it covers the common Postgres
 * subset used by the NL query generator.  It will never fail or throw;
 * unrecognised characters are emitted as `'identifier'` tokens.
 */
export function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let i = 0;

  while (i < sql.length) {
    // ── Whitespace ──────────────────────────────────────────────────────
    if (/\s/.test(sql[i])) {
      let j = i;
      while (j < sql.length && /\s/.test(sql[j])) j++;
      tokens.push({ text: sql.slice(i, j), type: 'whitespace' });
      i = j;
      continue;
    }

    // ── Single-line comment (-- ...) ────────────────────────────────────
    if (sql[i] === '-' && i + 1 < sql.length && sql[i + 1] === '-') {
      let j = i + 2;
      while (j < sql.length && sql[j] !== '\n') j++;
      tokens.push({ text: sql.slice(i, j), type: 'identifier' });
      i = j;
      continue;
    }

    // ── String literal ('...' or "...") ─────────────────────────────────
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i];
      let j = i + 1;
      while (j < sql.length && sql[j] !== quote) {
        if (sql[j] === '\\') j++; // skip escaped char
        j++;
      }
      if (j < sql.length) j++; // closing quote
      tokens.push({ text: sql.slice(i, j), type: 'string' });
      i = j;
      continue;
    }

    // ── Number ──────────────────────────────────────────────────────────
    if (/\d/.test(sql[i]) || (sql[i] === '.' && i + 1 < sql.length && /\d/.test(sql[i + 1]))) {
      let j = i;
      while (j < sql.length && /[\d.]/.test(sql[j])) j++;
      tokens.push({ text: sql.slice(i, j), type: 'number' });
      i = j;
      continue;
    }

    // ── Operator (=, <, >, !=, <=, >=, <>, ||, +, -, *, /, %) ─────────
    if (/[=<>!+\-*/%|]/.test(sql[i])) {
      let j = i + 1;
      if (j < sql.length && /[=<>|]/.test(sql[j])) j++;
      tokens.push({ text: sql.slice(i, j), type: 'operator' });
      i = j;
      continue;
    }

    // ── Punctuation (parens, commas, semicolons, dots) ──────────────────
    if (/[(),;.]/.test(sql[i])) {
      tokens.push({ text: sql[i], type: 'punctuation' });
      i++;
      continue;
    }

    // ── Word (keyword, function, or identifier) ─────────────────────────
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

    // ── Fallback (backticks, special chars, etc.) ───────────────────────
    tokens.push({ text: sql[i], type: 'identifier' });
    i++;
  }

  return tokens;
}

// ─── Token → CSS class mapping ────────────────────────────────────────────────

function tokenClassName(type: SqlTokenType): string {
  switch (type) {
    case 'keyword':     return 'sql-tk-kw';
    case 'function':    return 'sql-tk-fn';
    case 'string':      return 'sql-tk-str';
    case 'number':      return 'sql-tk-num';
    case 'operator':    return 'sql-tk-op';
    case 'punctuation': return 'sql-tk-punc';
    case 'identifier':  return 'sql-tk-id';
    case 'whitespace':  return '';
    default:            return '';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface SqlRevealBlockProps {
  /** Full generated SQL string (used for tokenization and as fallback). */
  sql: string;
  /** Optional AI rationale shown below the SQL block once reveal is complete. */
  rationale?: string;
  /** True while the typewriter animation is in progress. */
  isRevealing: boolean;
  /** Number of tokens currently visible during the typewriter reveal. */
  visibleTokenCount: number;
  /** True once the typewriter has finished and the full SQL is shown. */
  isRevealComplete: boolean;
  /** Current value of the editable textarea (may diverge from `sql` after user
   *  edits). */
  editedSql: string;
  /** Callback fired when the user edits the SQL textarea. */
  onSqlChange: (value: string) => void;
  /** Original server-generated SQL, used to determine if the user has made
   *  changes and to allow them to reset. */
  originalSql: string;
  className?: string;
}

function SqlRevealBlock({
  sql,
  rationale,
  isRevealing,
  visibleTokenCount,
  isRevealComplete,
  editedSql,
  onSqlChange,
  originalSql,
  className,
}: SqlRevealBlockProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isEdited = editedSql !== originalSql;

  // Focus the textarea as soon as it mounts (i.e. when review mode begins).
  useEffect(() => {
    if (isRevealComplete && textareaRef.current) {
      textareaRef.current.focus();
      // Place cursor at the end of the content.
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isRevealComplete]);

  // Tokenize the SQL once (memoized on the sql string).
  const tokens = useMemo(() => tokenizeSql(sql), [sql]);

  const sharedClassName = cn(
    'w-full min-h-[8rem] resize-none rounded-md border p-3 font-mono text-sm leading-relaxed',
    'focus-visible:outline-none',
  );

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="relative">
        {!isRevealComplete ? (
          /*
           * Typewriter pre — syntax highlighted, word-by-word reveal
           * Each token enters with the `sql-word-enter` animation:
           * a brightness flash + fade-in that settles to the token's
           * natural syntax color.
           */
          <pre
            className={cn(
              sharedClassName,
              'overflow-x-auto whitespace-pre-wrap break-words',
              'border-border bg-muted/30',
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
                  // Only animate non-whitespace tokens so spaces/newlines
                  // don't get an awkward brightness flash.
                  token.type !== 'whitespace' && 'sql-word-enter',
                )}
              >
                {token.text}
              </span>
            ))}
          </pre>
        ) : (
          /*
           * Editable textarea
           * Matches the <pre> dimensions visually so the swap is seamless.
           * A primary-tinted border + background signals editability.
           */
          <textarea
            ref={textareaRef}
            value={editedSql}
            onChange={(e) => onSqlChange(e.target.value)}
            spellCheck={false}
            aria-label="Generated SQL - editable before approval"
            className={cn(
              sharedClassName,
              'border-primary/30 bg-primary/5',
              'focus-visible:ring-1 focus-visible:ring-ring',
              'transition-colors duration-200',
            )}
          />
        )}

        {/* Reset badge — only shown once the typewriter is done AND user has
            made changes.  Positioned bottom-right of the SQL block. */}
        {isRevealComplete && isEdited && (
          <button
            type="button"
            onClick={() => onSqlChange(originalSql)}
            className={cn(
              'absolute bottom-2 right-2',
              'rounded px-1.5 py-0.5 text-xs font-medium',
              'bg-muted text-muted-foreground',
              'border border-border',
              'hover:bg-accent hover:text-accent-foreground',
              'transition-colors duration-150',
            )}
            aria-label="Reset SQL to original generated version"
          >
            Reset
          </button>
        )}
      </div>

      {/* Rationale paragraph — animated entrance after reveal completes */}
      {isRevealComplete && rationale && (
        <p
          className={cn(
            'text-xs text-muted-foreground',
            // Entrance animation: fade-in + slide up from 4 px below.
            'animate-in fade-in slide-in-from-bottom-1 duration-300',
          )}
          style={{ animationDelay: '400ms', animationFillMode: 'both' }}
        >
          {rationale}
        </p>
      )}

      {/* Placeholder shown while the block is first entering the DOM but the
          typewriter hasn't started yet (extremely brief; avoids a flash of
          empty space). */}
      {!isRevealing && !isRevealComplete && !sql && (
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
    </div>
  );
}

SqlRevealBlock.displayName = 'SqlRevealBlock';

export { SqlRevealBlock };
export type { SqlRevealBlockProps };
