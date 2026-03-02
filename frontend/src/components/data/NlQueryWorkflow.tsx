/**
 * NlQueryWorkflow
 *
 * Orchestrates the natural-language → SQL generation and review flow inside
 * the English query mode of QueryPanel.  It is entirely self-contained: the
 * parent (QueryPanel) only needs to provide the query text, callbacks, and the
 * two async operations (onGenerate / onApprove).
 *
 * ─── State machine ──────────────────────────────────────────────────────────
 *
 *   idle  ──[generate]──→  submitting  ──[result]──→  revealing  ──[done]──→  reviewing
 *    ↑                         │                                                   │
 *    └──────[reject]───────────┘──────────────────────[reject]────────────────────┘
 *
 *   Any state  ──[error]──→  error  ──[dismiss]──→  idle
 *
 * ─── Typewriter animation ───────────────────────────────────────────────────
 *
 * The `useTypewriter` hook uses requestAnimationFrame to advance the visible
 * text slice at ~CHARS_PER_FRAME characters per frame.  A 150 ms startup
 * delay is imposed so the component has time to mount and the user sees the
 * connector animation before text starts appearing.
 *
 * ─── Layout ─────────────────────────────────────────────────────────────────
 *
 *   ┌─────────────────────────────────────────┐
 *   │  AnimatedPlaceholderTextarea             │  ← always rendered; collapses
 *   │  (flex-1 when idle, compact otherwise)  │    to compact read-only strip
 *   ├─────────────────────────────────────────┤    in all non-idle phases
 *   │  NlFlowConnector                        │  ← fades in during submitting;
 *   │  (h-0 opacity-0 when idle)              │    runs particles; dims settled
 *   ├─────────────────────────────────────────┤
 *   │  SqlRevealBlock                         │  ← typewriter → editable area
 *   │  (hidden when idle/error)               │
 *   └─────────────────────────────────────────┘
 *
 * The `phase` is forwarded to QueryPanel via the `onPhaseChange` callback so
 * the parent can render phase-aware footer buttons without holding any of the
 * internal state.
 */

import {
  useReducer,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type Ref,
} from 'react';
import { cn } from '@/lib/utils';
import { AnimatedPlaceholderTextarea } from '@/components/ui/animated-placeholder-textarea';
import { NlFlowConnector } from './NlFlowConnector';
import { SqlRevealBlock } from './SqlRevealBlock';
import type { NlGenerationResult } from '@/types/nlQuery';

// ─── Typewriter hook ──────────────────────────────────────────────────────────

const CHARS_PER_FRAME = 3;
const TYPEWRITER_START_DELAY_MS = 150;

interface TypewriterState {
  visibleText: string;
  isComplete: boolean;
}

function useTypewriter(
  fullText: string,
  isActive: boolean
): TypewriterState {
  const stateRef = useRef<TypewriterState>({ visibleText: '', isComplete: false });
  // We use a stable ref-driven loop and only flush to React state
  // via a forceUpdate to keep the render count low.
  const forceUpdate = useReducer((n: number) => n + 1, 0)[1];
  const rafRef = useRef<number | null>(null);
  const startDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const charIndexRef = useRef(0);
  const targetRef = useRef(fullText);

  useEffect(() => {
    targetRef.current = fullText;
  }, [fullText]);

  useEffect(() => {
    // Reset when deactivated or target text changes.
    if (!isActive) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (startDelayRef.current !== null) clearTimeout(startDelayRef.current);
      stateRef.current = { visibleText: '', isComplete: false };
      charIndexRef.current = 0;
      forceUpdate();
      return;
    }

    charIndexRef.current = 0;
    stateRef.current = { visibleText: '', isComplete: false };
    forceUpdate();

    const tick = () => {
      const t = targetRef.current;
      charIndexRef.current = Math.min(
        charIndexRef.current + CHARS_PER_FRAME,
        t.length
      );
      const visible = t.slice(0, charIndexRef.current);
      const done = charIndexRef.current >= t.length;
      stateRef.current = { visibleText: visible, isComplete: done };
      forceUpdate();

      if (!done) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    startDelayRef.current = setTimeout(() => {
      startDelayRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    }, TYPEWRITER_START_DELAY_MS);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (startDelayRef.current !== null) clearTimeout(startDelayRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  return stateRef.current;
}

// ─── State machine ────────────────────────────────────────────────────────────

export type NlPhase =
  | 'idle'
  | 'submitting'
  | 'revealing'
  | 'reviewing'
  | 'error';

interface NlState {
  phase: NlPhase;
  result: NlGenerationResult | null;
  editedSql: string;
  errorMessage: string | null;
}

type NlAction =
  | { type: 'GENERATE' }
  | { type: 'RESULT'; payload: NlGenerationResult }
  | { type: 'REVEAL_COMPLETE' }
  | { type: 'SQL_EDIT'; payload: string }
  | { type: 'REJECT' }
  | { type: 'ERROR'; payload: string }
  | { type: 'DISMISS_ERROR' };

function nlReducer(state: NlState, action: NlAction): NlState {
  switch (action.type) {
    case 'GENERATE':
      return { ...state, phase: 'submitting', result: null, editedSql: '', errorMessage: null };
    case 'RESULT':
      return {
        ...state,
        phase: 'revealing',
        result: action.payload,
        editedSql: action.payload.sql,
      };
    case 'REVEAL_COMPLETE':
      return { ...state, phase: 'reviewing' };
    case 'SQL_EDIT':
      return { ...state, editedSql: action.payload };
    case 'REJECT':
      return { ...state, phase: 'idle', result: null, editedSql: '', errorMessage: null };
    case 'ERROR':
      return { ...state, phase: 'error', errorMessage: action.payload };
    case 'DISMISS_ERROR':
      return { ...state, phase: 'idle', errorMessage: null };
    default:
      return state;
  }
}

const initialState: NlState = {
  phase: 'idle',
  result: null,
  editedSql: '',
  errorMessage: null,
};

// ─── Placeholder cycling ──────────────────────────────────────────────────────

const NL_PLACEHOLDER_QUERIES = [
  'Show total revenue by product category for last quarter',
  'Which customers placed more than 5 orders this year?',
  'Find products with inventory below their reorder threshold',
  'Compare monthly signups vs churn over the past 12 months',
  'List the top 10 users by lifetime spend',
  'Show average delivery time by carrier and region',
  'Which campaigns generated the highest conversion rate?',
  'Summarise support tickets opened per day this week',
] as const;

// ─── Public handle (for QueryPanel footer button wiring) ──────────────────────

export interface NlQueryWorkflowHandle {
  phase: NlPhase;
  /** Trigger the generation flow from the parent footer button. */
  triggerGenerate: () => void;
  /** Trigger the approve flow from the parent footer button. */
  approve: () => void;
  /** Reject / reset the workflow from the parent footer button. */
  reject: () => void;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface NlQueryWorkflowProps {
  englishQuery: string;
  onQueryChange: (value: string) => void;
  /** Called when the user submits the NL query.  Must return a generation
   *  result or throw on error. */
  onGenerate: (query: string) => Promise<NlGenerationResult>;
  /** Called when the user approves the (possibly edited) SQL. */
  onApprove: (result: NlGenerationResult, approvedSql: string) => void;
  /** Passed through from QueryPanel; suppresses animations during panel expand. */
  isExpanding?: boolean;
  /**
   * Called whenever the internal phase changes.  QueryPanel uses this to
   * keep a local `nlPhase` state in sync so footer buttons can re-render
   * with phase-aware labels / variants without holding any workflow state.
   */
  onPhaseChange?: (phase: NlPhase) => void;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const NlQueryWorkflow = forwardRef(function NlQueryWorkflow(
  {
    englishQuery,
    onQueryChange,
    onGenerate,
    onApprove,
    isExpanding,
    onPhaseChange,
    className,
  }: NlQueryWorkflowProps,
  ref: Ref<NlQueryWorkflowHandle>
) {
  const [state, dispatch] = useReducer(nlReducer, initialState);
  const { phase, result, editedSql, errorMessage } = state;

  // Propagate phase to parent (QueryPanel) so footer buttons can re-render.
  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  // Typewriter: active while in the 'revealing' phase.
  const { visibleText, isComplete: typewriterComplete } = useTypewriter(
    result?.sql ?? '',
    phase === 'revealing'
  );

  // Advance to review once typewriter finishes.
  useEffect(() => {
    if (typewriterComplete && phase === 'revealing') {
      dispatch({ type: 'REVEAL_COMPLETE' });
    }
  }, [typewriterComplete, phase]);

  // ── Generate handler ── defined before useImperativeHandle to avoid TDZ ──
  const handleGenerate = useCallback(async () => {
    const query = englishQuery.trim();
    if (!query) return;

    dispatch({ type: 'GENERATE' });
    try {
      const generationResult = await onGenerate(query);
      dispatch({ type: 'RESULT', payload: generationResult });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred.';
      dispatch({ type: 'ERROR', payload: message });
    }
  }, [englishQuery, onGenerate]);

  // Expose controls to the parent (QueryPanel footer buttons).
  useImperativeHandle(
    ref,
    () => ({
      get phase() { return phase; },
      triggerGenerate: () => {
        void handleGenerate();
      },
      approve: () => {
        if (!result) return;
        onApprove(result, editedSql);
        dispatch({ type: 'REJECT' }); // reset after hand-off
      },
      reject: () => {
        dispatch({ type: 'REJECT' });
      },
    }),
    [phase, result, editedSql, onApprove, handleGenerate]
  );

  // ── Keyboard shortcut: Cmd/Ctrl+Enter in idle state submits ──────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (phase === 'idle' && englishQuery.trim()) {
          void handleGenerate();
        }
      }
    },
    [phase, englishQuery, handleGenerate]
  );

  // ── Derived layout state ──────────────────────────────────────────────────
  const isIdle = phase === 'idle' || phase === 'error';
  const showConnector = phase !== 'idle' && phase !== 'error';
  const connectorState: 'active' | 'settled' = phase === 'reviewing' ? 'settled' : 'active';
  const showSqlBlock = phase === 'submitting' || phase === 'revealing' || phase === 'reviewing';

  return (
    <div className={cn('flex flex-1 flex-col min-h-0', className)}>
      {/* ── English textarea ─────────────────────────────────────────────── */}
      <div
        className={cn(
          'transition-[flex,max-height,opacity] ease-out motion-reduce:transition-none',
          isIdle
            ? 'flex-1 max-h-none opacity-100 duration-300'
            : 'flex-none max-h-[4.5rem] opacity-70 duration-300 pointer-events-none',
          isExpanding && 'text-transparent',
        )}
      >
        <AnimatedPlaceholderTextarea
          placeholders={NL_PLACEHOLDER_QUERIES as unknown as string[]}
          value={englishQuery}
          onChange={(e) => {
            if (isIdle) onQueryChange(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          readOnly={!isIdle}
          disabled={phase === 'submitting'}
          aria-label="Natural language query input"
          className={cn(
            'h-full resize-none leading-relaxed focus-visible:ring-1',
            'transition-colors duration-200',
            !isIdle && 'cursor-default',
          )}
        />
      </div>

      {/* ── Flow connector ───────────────────────────────────────────────── */}
      <div
        data-testid="nl-flow-connector-wrapper"
        className={cn(
          'transition-[opacity,height] ease-out motion-reduce:transition-none overflow-hidden',
          showConnector
            ? 'h-10 opacity-100 duration-400'
            : 'h-0 opacity-0 duration-200 pointer-events-none',
        )}
      >
        <NlFlowConnector state={connectorState} />
      </div>

      {/* ── SQL block (shimmer → typewriter → editable) ──────────────────── */}
      {showSqlBlock && (
        <div
          className={cn(
            'flex-1 min-h-0',
            // Entry animation: fade in + slide up from 4 px below.
            'animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out',
          )}
        >
          <SqlRevealBlock
            sql={result?.sql ?? ''}
            rationale={result?.rationale}
            isRevealing={phase === 'revealing'}
            visibleText={visibleText}
            isRevealComplete={phase === 'reviewing'}
            editedSql={editedSql}
            onSqlChange={(v) => dispatch({ type: 'SQL_EDIT', payload: v })}
            originalSql={result?.sql ?? ''}
            className="h-full"
          />
        </div>
      )}

      {/* ── Error message ─────────────────────────────────────────────────── */}
      {phase === 'error' && errorMessage && (
        <div
          className={cn(
            'mt-2 rounded-md border border-destructive/30 bg-destructive/5',
            'px-3 py-2 text-xs text-destructive',
            'animate-in fade-in slide-in-from-bottom-1 duration-200',
          )}
          role="alert"
        >
          <p className="font-medium">Generation failed</p>
          <p className="mt-0.5 opacity-80">{errorMessage}</p>
          <button
            type="button"
            onClick={() => dispatch({ type: 'DISMISS_ERROR' })}
            className="mt-1.5 underline underline-offset-2 hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
});

NlQueryWorkflow.displayName = 'NlQueryWorkflow';

export { NlQueryWorkflow };
export type { NlQueryWorkflowProps };
