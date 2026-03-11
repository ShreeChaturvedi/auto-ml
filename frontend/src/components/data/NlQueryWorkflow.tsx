/**
 * NlQueryWorkflow
 *
 * Orchestrates the natural-language -> SQL generation and review flow.
 */

import {
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useReducer,
  forwardRef,
  useImperativeHandle,
  useState,
  type KeyboardEvent,
  type Ref,
} from 'react';
import { cn } from '@/lib/utils';
import { AnimatedPlaceholderTextarea } from '@/components/ui/animated-placeholder-textarea';
import { fetchNlSuggestions, type NlSuggestion } from '@/lib/api/query';
import { tokenizeSql } from './sqlTokenize';
import { useTypewriter } from './hooks/useTypewriter';
import {
  applyNlModelWorkEvent,
  applyNlWorkPhaseEvent,
  completeNlWorkDonePhase,
  createInitialNlWorkPhases,
  finalizeNlModelWorkBlocks,
  finalizeNlWorkPhasesWithoutStream,
  markNlWorkPhasesFailed
} from '@/lib/nlQuery/phaseStateMachine';
import { NlWorkflowSteps } from './NlWorkflowSteps';
import { NlApprovalDialog } from './NlApprovalDialog';
import {
  nlReducer,
  initialNlState,
  type ApproveThemeClasses,
  type NlPhase,
} from './NlQueryReducer';
import type {
  NlGenerationResult,
  NlModelWorkBlockState,
  NlQueryStreamEvent,
  NlWorkPhaseState
} from '@/types/nlQuery';

const MAX_VISIBLE_SUGGESTIONS = 6;

export interface NlQueryWorkflowHandle {
  phase: NlPhase;
  triggerGenerate: () => void;
  approve: () => void;
  reject: () => void;
}

interface NlQueryWorkflowProps {
  projectId?: string | null;
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
    projectId,
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
  const [state, dispatch] = useReducer(nlReducer, initialNlState);
  const [workPhases, setWorkPhases] = useState<NlWorkPhaseState[]>(() => createInitialNlWorkPhases());
  const [modelWorkBlocks, setModelWorkBlocks] = useState<NlModelWorkBlockState[]>([]);
  const [nlSuggestions, setNlSuggestions] = useState<NlSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const streamAbortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);

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
    if (!projectId) {
      setNlSuggestions([]);
      return;
    }

    let cancelled = false;
    void fetchNlSuggestions(projectId, 8)
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
  }, [projectId]);

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

  const placeholderPrompts = useMemo(
    () => nlSuggestions
      .map((suggestion) => suggestion.prompt.trim())
      .filter((prompt) => prompt.length > 0),
    [nlSuggestions]
  );

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
            placeholders={placeholderPrompts}
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
            <NlApprovalDialog
              suggestions={filteredSuggestions}
              activeSuggestionIndex={activeSuggestionIndex}
              onApplySuggestion={applySuggestion}
            />
          )}
        </div>
      </div>

      <NlWorkflowSteps
        phase={phase}
        result={result}
        editedSql={editedSql}
        onSqlEdit={(v) => dispatch({ type: 'SQL_EDIT', payload: v })}
        errorMessage={errorMessage}
        onDismissError={() => dispatch({ type: 'DISMISS_ERROR' })}
        onApprove={handleApprove}
        onReject={handleReject}
        workPhases={workPhases}
        modelWorkBlocks={modelWorkBlocks}
        visibleTokenCount={visibleTokenCount}
        isRevealComplete={phase === 'reviewing'}
        approveThemeClasses={approveThemeClasses}
        connectorColorClassName={connectorColorClassName}
        containerHeight={containerHeight}
      />
    </div>
  );
});

NlQueryWorkflow.displayName = 'NlQueryWorkflow';

export { NlQueryWorkflow };
export type { NlQueryWorkflowProps };
export { type ApproveThemeClasses, type NlPhase } from './NlQueryReducer';
