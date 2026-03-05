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
import { fetchNlSuggestions, type NlSuggestion } from '@/lib/api/query';
import { useProjectStore } from '@/stores/projectStore';
import { NlFlowConnector } from './NlFlowConnector';
import { NlWorkPlanPanel } from './NlWorkPlanPanel';
import { SqlRevealBlock } from './SqlRevealBlock';
import { tokenizeSql } from './sqlTokenize';
import {
  applyNlModelWorkEvent,
  applyNlWorkPhaseEvent,
  completeNlWorkDonePhase,
  createInitialNlWorkPhases,
  finalizeNlModelWorkBlocks,
  finalizeNlWorkPhasesWithoutStream,
  markNlWorkPhasesFailed,
  type NlGenerationResult,
  type NlModelWorkBlockState,
  type NlQueryStreamEvent,
  type NlWorkPhaseState
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

const MAX_VISIBLE_SUGGESTIONS = 6;

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
  connectorColorClassName?: string;
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
    connectorColorClassName,
    className,
  }: NlQueryWorkflowProps,
  ref: Ref<NlQueryWorkflowHandle>
) {
  const { activeProjectId } = useProjectStore();
  const [state, dispatch] = useReducer(nlReducer, initialState);
  const [workPhases, setWorkPhases] = useState<NlWorkPhaseState[]>(() => createInitialNlWorkPhases());
  const [modelWorkBlocks, setModelWorkBlocks] = useState<NlModelWorkBlockState[]>([]);
  const [nlSuggestions, setNlSuggestions] = useState<NlSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [manualPanelExpanded, setManualPanelExpanded] = useState<boolean | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const streamAbortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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

  useEffect(() => {
    if (!activeProjectId) {
      setNlSuggestions([]);
      return;
    }

    let cancelled = false;
    void fetchNlSuggestions(activeProjectId, 8)
      .then((response) => {
        if (!cancelled) {
          setNlSuggestions(response.suggestions);
        }
      })
      .catch((error) => {
        console.error('Failed to load NL suggestions:', error);
        if (!cancelled) {
          setNlSuggestions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  const filteredSuggestions = useMemo(() => {
    const input = englishQuery.trim().toLowerCase();
    const suggestions = input
      ? nlSuggestions.filter((suggestion) => (
          suggestion.prompt.toLowerCase().includes(input)
          || suggestion.label.toLowerCase().includes(input)
          || suggestion.category.toLowerCase().includes(input)
        ))
      : nlSuggestions;

    return suggestions.slice(0, MAX_VISIBLE_SUGGESTIONS);
  }, [englishQuery, nlSuggestions]);

  useEffect(() => {
    if (activeSuggestionIndex >= filteredSuggestions.length) {
      setActiveSuggestionIndex(0);
    }
  }, [activeSuggestionIndex, filteredSuggestions.length]);

  const applySuggestion = useCallback((suggestion: NlSuggestion) => {
    onQueryChange(suggestion.prompt);
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(0);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [onQueryChange]);

  const handleGenerate = useCallback(async () => {
    const query = englishQuery.trim();
    if (!query) return;

    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;

    setWorkPhases(createInitialNlWorkPhases());
    setModelWorkBlocks([]);
    setManualPanelExpanded(null);
    dispatch({ type: 'GENERATE' });

    const handleScopedStreamEvent = (event: NlQueryStreamEvent) => {
      if (controller.signal.aborted || streamAbortRef.current !== controller) {
        return;
      }

      if (event.type === 'result') {
        return;
      }

      if (event.type === 'done') {
        setWorkPhases((previous) => completeNlWorkDonePhase(previous));
        setModelWorkBlocks((previous) => finalizeNlModelWorkBlocks(previous));
        return;
      }

      if (
        event.type === 'model_work_block_started'
        || event.type === 'model_work_delta'
        || event.type === 'model_work_block_completed'
      ) {
        setModelWorkBlocks((previous) => applyNlModelWorkEvent(previous, event));
        return;
      }

      setWorkPhases((previous) => applyNlWorkPhaseEvent(previous, event));
    };

    try {
      const generationResult = await onGenerate(query, handleScopedStreamEvent, controller.signal);
      if (controller.signal.aborted || streamAbortRef.current !== controller) {
        return;
      }
      setWorkPhases((previous) => finalizeNlWorkPhasesWithoutStream(previous));
      setModelWorkBlocks((previous) => finalizeNlModelWorkBlocks(previous));
      dispatch({ type: 'RESULT', payload: generationResult });
    } catch (err) {
      if (controller.signal.aborted || streamAbortRef.current !== controller) {
        return;
      }
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred.';
      setWorkPhases((previous) => markNlWorkPhasesFailed(previous, message));
      setModelWorkBlocks((previous) => finalizeNlModelWorkBlocks(previous));
      dispatch({ type: 'ERROR', payload: message });
    } finally {
      if (streamAbortRef.current === controller) {
        streamAbortRef.current = null;
      }
    }
  }, [englishQuery, onGenerate]);

  const handleApprove = useCallback(() => {
    if (!result) return;
    onApprove(result, editedSql);
    dispatch({ type: 'REJECT' });
  }, [result, editedSql, onApprove]);

  const handleReject = useCallback(() => {
    streamAbortRef.current?.abort();
    setWorkPhases(createInitialNlWorkPhases());
    setModelWorkBlocks([]);
    dispatch({ type: 'REJECT' });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      get phase() { return phase; },
      triggerGenerate: () => {
        void handleGenerate();
      },
      approve: handleApprove,
      reject: handleReject,
    }),
    [phase, handleGenerate, handleApprove, handleReject]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (phase === 'idle' && suggestionsOpen && filteredSuggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveSuggestionIndex((previous) => (previous + 1) % filteredSuggestions.length);
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveSuggestionIndex((previous) => (
            previous === 0 ? filteredSuggestions.length - 1 : previous - 1
          ));
          return;
        }

        if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
          e.preventDefault();
          const suggestion = filteredSuggestions[activeSuggestionIndex];
          if (suggestion) {
            applySuggestion(suggestion);
          }
          return;
        }

        if (e.key === 'Escape') {
          setSuggestionsOpen(false);
          return;
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (phase === 'idle' && englishQuery.trim()) {
          void handleGenerate();
        }
      }
    },
    [phase, suggestionsOpen, filteredSuggestions, activeSuggestionIndex, applySuggestion, englishQuery, handleGenerate]
  );

  const isIdle = phase === 'idle' || phase === 'error';
  const showConnector = phase !== 'idle' && phase !== 'error';
  const topConnectorState: 'active' | 'settled' = phase === 'submitting' ? 'active' : 'settled';
  const bottomConnectorState: 'active' | 'settled' = phase === 'revealing' ? 'active' : 'settled';
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
      className={cn('flex flex-1 min-h-0 flex-col overflow-hidden pr-0.5', className)}
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
        <div className="relative h-full">
          <AnimatedPlaceholderTextarea
            ref={textareaRef}
            placeholders={nlSuggestions.map((suggestion) => suggestion.prompt)}
            value={englishQuery}
            autoFocus={isIdle}
            onChange={(e) => {
              if (isIdle) {
                onQueryChange(e.target.value);
                setSuggestionsOpen(true);
                setActiveSuggestionIndex(0);
              }
            }}
            onFocus={() => {
              if (isIdle && filteredSuggestions.length > 0) {
                setSuggestionsOpen(true);
              }
            }}
            onBlur={() => {
              window.setTimeout(() => setSuggestionsOpen(false), 120);
            }}
            onKeyDown={handleKeyDown}
            readOnly={!isIdle}
            disabled={phase === 'submitting'}
            aria-label="Natural language query input"
            aria-autocomplete="list"
            aria-expanded={isIdle && suggestionsOpen && filteredSuggestions.length > 0}
            className={cn(
              'h-full resize-none leading-relaxed',
              'focus-visible:border-ring focus-visible:ring-0 focus-visible:ring-offset-0',
              'transition-colors duration-200',
              !isIdle && 'cursor-default',
            )}
          />

          {isIdle && suggestionsOpen && filteredSuggestions.length > 0 && (
            <div className="absolute inset-x-0 top-full z-20 mt-2 rounded-xl border border-border/70 bg-background/95 p-2 shadow-xl backdrop-blur-sm">
              <div className="mb-1 px-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Suggested analyses
              </div>
              <div className="space-y-1">
                {filteredSuggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    className={cn(
                      'flex w-full flex-col rounded-lg border px-3 py-2 text-left transition-colors',
                      index === activeSuggestionIndex
                        ? 'border-foreground/15 bg-muted/80'
                        : 'border-transparent hover:border-border/70 hover:bg-muted/50'
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => applySuggestion(suggestion)}
                  >
                    <span className="text-[11px] font-medium text-foreground/95">{suggestion.label}</span>
                    <span className="mt-1 text-xs leading-relaxed text-muted-foreground">{suggestion.prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {(showPlanPanel || showSqlBlock) && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <div
              data-testid="nl-flow-connector-top"
              className={cn(
                'overflow-hidden transition-[opacity,flex] ease-out motion-reduce:transition-none',
                showConnector
                  ? 'flex min-h-[2.75rem] flex-1 items-end justify-center opacity-100 duration-400'
                  : 'h-0 opacity-0 duration-200 pointer-events-none',
              )}
            >
              <NlFlowConnector
                stretch
                state={topConnectorState}
                variant="fan-in"
                className={cn('h-full', connectorColorClassName)}
              />
            </div>

            {showPlanPanel && (
              <NlWorkPlanPanel
                explanation={result?.explanation}
                phase={panelPhase}
                workPhases={workPhases}
                modelWorkBlocks={modelWorkBlocks}
                isStreaming={phase === 'submitting'}
                isExpanded={isPanelExpanded}
                autoCollapsed={autoCollapsed}
                onToggleExpanded={togglePanelExpanded}
                className="mx-auto w-full max-w-[44rem] shrink-0"
              />
            )}

            <div
              data-testid="nl-flow-connector-bottom"
              className={cn(
                'overflow-hidden transition-[opacity,flex] ease-out motion-reduce:transition-none',
                showConnector
                  ? 'flex min-h-[2.75rem] flex-1 items-start justify-center opacity-100 duration-400'
                  : 'h-0 opacity-0 duration-200 pointer-events-none',
              )}
            >
              <NlFlowConnector
                stretch
                state={bottomConnectorState}
                variant="fan-out"
                className={cn('h-full', connectorColorClassName)}
              />
            </div>
          </div>

          {showSqlBlock && (
            <div
              className={cn(
                'mt-auto shrink-0 min-h-[12rem]',
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
                onApprove={handleApprove}
                onReject={handleReject}
                approveThemeClasses={approveThemeClasses}
                className="h-full"
              />
            </div>
          )}
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
