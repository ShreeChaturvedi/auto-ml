/**
 * NlQueryWorkflow
 *
 * Orchestrates the natural-language → SQL generation and review flow.
 */

import {
  useReducer,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
  useState,
  type KeyboardEvent,
  type Ref,
} from 'react';
import { cn } from '@/lib/utils';
import { AnimatedPlaceholderTextarea } from '@/components/ui/animated-placeholder-textarea';
import { NlFlowConnector } from './NlFlowConnector';
import { NlWorkPlanPanel } from './NlWorkPlanPanel';
import { SqlRevealBlock, tokenizeSql } from './SqlRevealBlock';
import type {
  NlGenerationResult,
  NlQueryStreamEvent,
  NlStreamPhaseEvent,
  NlStreamPhaseId,
  NlWorkPhaseState,
  NlWorkPhaseStatus
} from '@/types/nlQuery';

export type ApproveThemeClasses = {
  hoverText: string;
  hoverBorder: string;
  hoverBg: string;
};

const TOKEN_INTERVAL_MS = 65;
const TYPEWRITER_START_DELAY_MS = 150;
const AUTO_COLLAPSE_HEIGHT_PX = 920;

interface TypewriterState {
  visibleTokenCount: number;
  isComplete: boolean;
}

function useTypewriter(
  totalTokens: number,
  isActive: boolean
): TypewriterState {
  const stateRef = useRef<TypewriterState>({ visibleTokenCount: 0, isComplete: false });
  const forceUpdate = useReducer((n: number) => n + 1, 0)[1];
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenIndexRef = useRef(0);
  const targetRef = useRef(totalTokens);

  useEffect(() => {
    targetRef.current = totalTokens;
  }, [totalTokens]);

  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
      if (startDelayRef.current !== null) clearTimeout(startDelayRef.current);
      stateRef.current = { visibleTokenCount: 0, isComplete: false };
      tokenIndexRef.current = 0;
      forceUpdate();
      return;
    }

    tokenIndexRef.current = 0;
    stateRef.current = { visibleTokenCount: 0, isComplete: false };
    forceUpdate();

    startDelayRef.current = setTimeout(() => {
      startDelayRef.current = null;

      intervalRef.current = setInterval(() => {
        const total = targetRef.current;
        tokenIndexRef.current = Math.min(tokenIndexRef.current + 1, total);
        const done = tokenIndexRef.current >= total;
        stateRef.current = { visibleTokenCount: tokenIndexRef.current, isComplete: done };
        forceUpdate();

        if (done && intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }, TOKEN_INTERVAL_MS);
    }, TYPEWRITER_START_DELAY_MS);

    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
      if (startDelayRef.current !== null) clearTimeout(startDelayRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  return stateRef.current;
}

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

const WORK_PHASE_IDS: NlStreamPhaseId[] = [
  'schema_context',
  'planning',
  'sql_generation',
  'validation',
  'initial_execution',
  'repair',
  'done'
];

const WORK_PHASE_LABELS: Record<NlStreamPhaseId, string> = {
  schema_context: 'Schema context',
  planning: 'Planning',
  sql_generation: 'SQL generation',
  validation: 'Validation',
  initial_execution: 'Initial execution',
  repair: 'Repair',
  done: 'Done'
};

function createInitialWorkPhases(): NlWorkPhaseState[] {
  return WORK_PHASE_IDS.map((phaseId) => ({
    phaseId,
    label: WORK_PHASE_LABELS[phaseId],
    status: 'pending',
    events: []
  }));
}

function mapPhaseTypeToStatus(type: NlStreamPhaseEvent['type']): NlWorkPhaseStatus {
  if (type === 'phase_completed') return 'completed';
  if (type === 'phase_failed') return 'failed';
  return 'active';
}

function applyPhaseEvent(
  previous: NlWorkPhaseState[],
  event: NlStreamPhaseEvent
): NlWorkPhaseState[] {
  const targetStatus = mapPhaseTypeToStatus(event.type);
  const targetIndex = previous.findIndex((entry) => entry.phaseId === event.phaseId);
  if (targetIndex === -1) {
    return previous;
  }

  return previous.map((entry, index) => {
    if (entry.phaseId === event.phaseId) {
      return {
        ...entry,
        status: targetStatus,
        lastSummary: event.summary,
        events: [...entry.events, event]
      };
    }

    if ((targetStatus === 'active' || targetStatus === 'completed' || targetStatus === 'failed') && index < targetIndex && entry.status === 'pending') {
      return { ...entry, status: 'completed' };
    }

    if (targetStatus === 'active' && entry.status === 'active') {
      return { ...entry, status: 'completed' };
    }

    return entry;
  });
}

function finalizePhasesWithoutStream(previous: NlWorkPhaseState[]): NlWorkPhaseState[] {
  if (previous.some((entry) => entry.events.length > 0)) {
    return previous;
  }

  return previous.map((entry) => {
    if (entry.phaseId === 'repair') {
      return entry;
    }
    if (entry.phaseId === 'done') {
      return {
        ...entry,
        status: 'completed',
        lastSummary: 'NL query pipeline finished.'
      };
    }
    return {
      ...entry,
      status: 'completed'
    };
  });
}

function markFailureOnPhases(previous: NlWorkPhaseState[], message: string): NlWorkPhaseState[] {
  const activeIndex = previous.findIndex((entry) => entry.status === 'active');
  if (activeIndex >= 0) {
    return previous.map((entry, index) => {
      if (index === activeIndex) {
        return { ...entry, status: 'failed', lastSummary: message };
      }
      if (entry.phaseId === 'done') {
        return { ...entry, status: 'failed', lastSummary: message };
      }
      return entry;
    });
  }

  return previous.map((entry) => {
    if (entry.phaseId === 'done') {
      return { ...entry, status: 'failed', lastSummary: message };
    }
    return entry;
  });
}

export interface NlQueryWorkflowHandle {
  phase: NlPhase;
  triggerGenerate: () => void;
  approve: () => void;
  reject: () => void;
}

interface NlQueryWorkflowProps {
  englishQuery: string;
  onQueryChange: (value: string) => void;
  onGenerate: (
    query: string,
    onStreamEvent?: (event: NlQueryStreamEvent) => void,
    signal?: AbortSignal
  ) => Promise<NlGenerationResult>;
  onApprove: (result: NlGenerationResult, approvedSql: string) => void;
  isExpanding?: boolean;
  onPhaseChange?: (phase: NlPhase) => void;
  approveThemeClasses?: ApproveThemeClasses;
  className?: string;
}

const NlQueryWorkflow = forwardRef(function NlQueryWorkflow(
  {
    englishQuery,
    onQueryChange,
    onGenerate,
    onApprove,
    isExpanding,
    onPhaseChange,
    approveThemeClasses,
    className,
  }: NlQueryWorkflowProps,
  ref: Ref<NlQueryWorkflowHandle>
) {
  const [state, dispatch] = useReducer(nlReducer, initialState);
  const [workPhases, setWorkPhases] = useState<NlWorkPhaseState[]>(() => createInitialWorkPhases());
  const [manualPanelExpanded, setManualPanelExpanded] = useState<boolean | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const streamAbortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { phase, result, editedSql, errorMessage } = state;

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  const resultTokens = useMemo(
    () => (result?.sql ? tokenizeSql(result.sql) : []),
    [result?.sql]
  );

  const { visibleTokenCount, isComplete: typewriterComplete } = useTypewriter(
    resultTokens.length,
    phase === 'revealing'
  );

  useEffect(() => {
    if (typewriterComplete && phase === 'revealing') {
      dispatch({ type: 'REVEAL_COMPLETE' });
    }
  }, [typewriterComplete, phase]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setContainerHeight(entry.contentRect.height);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (phase === 'idle' || phase === 'error') {
      setManualPanelExpanded(null);
    }
  }, [phase]);

  const handleStreamEvent = useCallback((event: NlQueryStreamEvent) => {
    if (event.type === 'result') {
      return;
    }

    if (event.type === 'done') {
      setWorkPhases((previous) => {
        const donePhase = previous.find((entry) => entry.phaseId === 'done');
        if (!donePhase || donePhase.status === 'completed' || donePhase.status === 'failed') {
          return previous;
        }

        return previous.map((entry) => (
          entry.phaseId === 'done'
            ? {
                ...entry,
                status: 'completed',
                lastSummary: entry.lastSummary ?? 'NL query pipeline finished.'
              }
            : entry
        ));
      });
      return;
    }

    setWorkPhases((previous) => applyPhaseEvent(previous, event));
  }, []);

  const handleGenerate = useCallback(async () => {
    const query = englishQuery.trim();
    if (!query) return;

    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;

    setWorkPhases(createInitialWorkPhases());
    setManualPanelExpanded(null);
    dispatch({ type: 'GENERATE' });

    try {
      const generationResult = await onGenerate(query, handleStreamEvent, controller.signal);
      setWorkPhases((previous) => finalizePhasesWithoutStream(previous));
      dispatch({ type: 'RESULT', payload: generationResult });
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred.';
      setWorkPhases((previous) => markFailureOnPhases(previous, message));
      dispatch({ type: 'ERROR', payload: message });
    } finally {
      if (streamAbortRef.current === controller) {
        streamAbortRef.current = null;
      }
    }
  }, [englishQuery, onGenerate, handleStreamEvent]);

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
        dispatch({ type: 'REJECT' });
      },
      reject: () => {
        streamAbortRef.current?.abort();
        dispatch({ type: 'REJECT' });
      },
    }),
    [phase, result, editedSql, onApprove, handleGenerate]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (phase === 'idle' && englishQuery.trim()) {
          void handleGenerate();
        }
      }
    },
    [phase, englishQuery, handleGenerate]
  );

  const isIdle = phase === 'idle' || phase === 'error';
  const showConnector = phase !== 'idle' && phase !== 'error';
  const connectorState: 'active' | 'settled' = phase === 'reviewing' ? 'settled' : 'active';
  const panelPhase: 'submitting' | 'revealing' | 'reviewing' = phase === 'reviewing' ? 'reviewing' : phase === 'revealing' ? 'revealing' : 'submitting';
  const showPlanPanel = phase === 'submitting' || phase === 'revealing' || phase === 'reviewing';
  const showSqlBlock = phase === 'submitting' || phase === 'revealing' || phase === 'reviewing';

  const autoCollapsed = showPlanPanel && containerHeight > 0 && containerHeight < AUTO_COLLAPSE_HEIGHT_PX;
  const isPanelExpanded = manualPanelExpanded ?? !autoCollapsed;

  const togglePanelExpanded = useCallback(() => {
    setManualPanelExpanded((previous) => {
      const current = previous ?? !autoCollapsed;
      return !current;
    });
  }, [autoCollapsed]);

  return (
    <div
      ref={containerRef}
      className={cn('flex flex-1 flex-col min-h-0 overflow-y-auto overscroll-contain pr-0.5', className)}
    >
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

      <div
        data-testid="nl-flow-connector-top"
        className={cn(
          'transition-[opacity,height] ease-out motion-reduce:transition-none overflow-hidden',
          showConnector
            ? 'h-16 opacity-100 duration-400'
            : 'h-0 opacity-0 duration-200 pointer-events-none',
        )}
      >
        <NlFlowConnector state={connectorState} variant="fan-in" />
      </div>

      {showPlanPanel && (
        <NlWorkPlanPanel
          explanation={result?.explanation}
          phase={panelPhase}
          workPhases={workPhases}
          isExpanded={isPanelExpanded}
          autoCollapsed={autoCollapsed}
          onToggleExpanded={togglePanelExpanded}
          className="mb-2 shrink-0"
        />
      )}

      <div
        data-testid="nl-flow-connector-bottom"
        className={cn(
          'transition-[opacity,height] ease-out motion-reduce:transition-none overflow-hidden',
          showConnector
            ? 'h-16 opacity-100 duration-400'
            : 'h-0 opacity-0 duration-200 pointer-events-none',
        )}
      >
        <NlFlowConnector state={connectorState} variant="fan-out" />
      </div>

      {showSqlBlock && (
        <div
          className={cn(
            'shrink-0 min-h-[12rem]',
            'animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out',
          )}
        >
          <SqlRevealBlock
            sql={result?.sql ?? ''}
            queryExecutionError={result?.queryExecutionError}
            isRevealing={phase === 'revealing'}
            visibleTokenCount={visibleTokenCount}
            isRevealComplete={phase === 'reviewing'}
            editedSql={editedSql}
            onSqlChange={(v) => dispatch({ type: 'SQL_EDIT', payload: v })}
            originalSql={result?.sql ?? ''}
            onApprove={() => {
              if (!result) return;
              onApprove(result, editedSql);
              dispatch({ type: 'REJECT' });
            }}
            onReject={() => dispatch({ type: 'REJECT' })}
            approveThemeClasses={approveThemeClasses}
            className="h-full"
          />
        </div>
      )}

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
