/**
 * SqlRevealBlock
 *
 * Displays generated SQL in two sequential phases:
 *
 * Revealing phase
 * ───────────────
 * A <pre> element shows the growing `visibleText` string as it is typed
 * character-by-character by the useTypewriter hook in NlQueryWorkflow.
 * A blinking cursor is appended via the `.nl-typewriter-cursor` pseudo-element
 * class (defined in index.css) once the cursor holder span is rendered.
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

import { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface SqlRevealBlockProps {
  /** SQL text that should currently be rendered (full string for review mode,
   *  partial during typewriter reveal). */
  sql: string;
  /** Optional AI rationale shown below the SQL block once reveal is complete. */
  rationale?: string;
  /** True while the typewriter animation is in progress. */
  isRevealing: boolean;
  /** The slice of `sql` that should be shown in the typewriter <pre>. */
  visibleText: string;
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
  visibleText,
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

  const sharedClassName = cn(
    'w-full min-h-[8rem] resize-none rounded-md border p-3 font-mono text-sm leading-relaxed',
    'focus-visible:outline-none',
  );

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="relative">
        {!isRevealComplete ? (
          /*
           * Typewriter pre
           * The text grows character-by-character via `visibleText`.
           * The `nl-typewriter-cursor` class injects a blinking ○ via ::after
           * on this element only while the animation is running.
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
            {visibleText}
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
