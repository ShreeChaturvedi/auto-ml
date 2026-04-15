/**
 * NlStreamPanel — minimal streaming transcript for NL query generation.
 *
 * Replaces: NlWorkPlanPanel + TranscriptSection + TranscriptTimeline + TranscriptBlock
 */

import {
  AlertTriangle,
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  FileCode2,
  Info,
  ListChecks,
  Loader2,
  ShieldCheck,
  Wrench
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { ProgressiveMessageText } from '@/components/llm/ProgressiveMessageText';
import { cn } from '@/lib/utils';
import type { NlModelWorkKind } from '@/lib/api/query';
import type { NlModelWorkBlockState } from '@/types/nlQuery';

import {
  distanceFromViewportBottom,
  scrollViewportToBottom
} from './viewportScrollUtils';

const BLOCK_ICON: Record<NlModelWorkKind, LucideIcon> = {
  plan:       ListChecks,
  thinking:   Brain,
  tool:       Wrench,
  sql:        FileCode2,
  validation: ShieldCheck,
  repair:     AlertTriangle,
  status:     Info,
};

interface NlStreamPanelProps {
  modelWorkBlocks: NlModelWorkBlockState[];
  isStreaming: boolean;
  isExpanded: boolean;
  autoCollapsed: boolean;
  onToggleExpanded: () => void;
  containerHeight: number;
  className?: string;
}

function NlStreamPanel({
  modelWorkBlocks,
  isStreaming,
  isExpanded,
  onToggleExpanded,
  className
}: NlStreamPanelProps) {
  const [visualExpanded, setVisualExpanded] = useState(isExpanded);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const viewportContentRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoFollowRef = useRef(true);

  const transcriptSignature = useMemo(
    () => modelWorkBlocks.map((b) => `${b.blockId}:${b.status}:${b.content.length}`).join('|'),
    [modelWorkBlocks]
  );

  const shouldKeepLive = isStreaming || modelWorkBlocks.some((b) => b.status === 'streaming');

  const refreshFollow = useCallback((behavior: ScrollBehavior = 'auto') => {
    const viewport = viewportRef.current;
    if (!viewport || !shouldAutoFollowRef.current) return;
    scrollViewportToBottom(viewport, behavior);
  }, []);

  const handleViewportScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    shouldAutoFollowRef.current = distanceFromViewportBottom(viewport) <= 40;
  }, []);

  useEffect(() => {
    setVisualExpanded(isExpanded);
  }, [isExpanded]);

  useLayoutEffect(() => {
    if (!isExpanded || !shouldKeepLive || !shouldAutoFollowRef.current) return;
    refreshFollow();
  }, [isExpanded, shouldKeepLive, transcriptSignature, refreshFollow]);

  useEffect(() => {
    if (!isExpanded || !shouldKeepLive) return;
    const content = viewportContentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      if (shouldAutoFollowRef.current) {
        refreshFollow();
      }
    });

    observer.observe(content);
    return () => observer.disconnect();
  }, [isExpanded, shouldKeepLive, refreshFollow]);

  const hasBlocks = modelWorkBlocks.length > 0;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md border border-border/50',
        className
      )}
      data-testid="nl-stream-panel"
    >
      {/* Collapsed state */}
      {!visualExpanded && (
        <div className="flex min-h-[2rem] items-center px-3">
          {!isStreaming && hasBlocks && (
            <div className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">Done</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-1">
            {isStreaming && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
            )}
            <button
              type="button"
              onClick={onToggleExpanded}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
              aria-label="Expand transcript"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Expanded state */}
      <div
        className={cn(
          'grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
          visualExpanded
            ? 'grid-rows-[1fr] opacity-100'
            : 'pointer-events-none grid-rows-[0fr] opacity-0'
        )}
        aria-hidden={!visualExpanded}
      >
        <div className="overflow-hidden">
          {/* Spinner + collapse — top-right, same line as first header */}
          <div className="absolute top-1.5 right-2 z-[3] flex items-center gap-1">
            {isStreaming && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
            )}
            <button
              type="button"
              onClick={onToggleExpanded}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
              aria-label="Collapse transcript"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="px-3 pb-3 pt-1">
            <div
              ref={viewportRef}
              className="nl-model-work-stream max-h-[clamp(12rem,28vh,18rem)] overflow-y-auto overflow-x-hidden scrollbar-hide"
              data-testid="nl-stream-viewport"
              onScroll={handleViewportScroll}
            >
              {/* Scroll fade — sticky gradient, below headers (z-[0]) */}
              <div
                className="pointer-events-none sticky top-0 z-[0] -mb-8 h-8 bg-gradient-to-b from-background from-30% to-transparent"
                aria-hidden="true"
              />

              <div ref={viewportContentRef}>
                {modelWorkBlocks.length === 0 && isStreaming && (
                  <p className="text-xs text-muted-foreground">Analyzing query…</p>
                )}

                {modelWorkBlocks.map((block) => {
                  const Icon = BLOCK_ICON[block.kind] ?? BLOCK_ICON.status;
                  return (
                    <div
                      key={block.blockId}
                      data-testid={`nl-stream-block-${block.blockId}`}
                    >
                      <div
                        className="sticky top-0 z-[1] flex items-center gap-1.5 py-1.5 pr-14"
                        data-testid={`nl-stream-header-${block.blockId}`}
                      >
                        <Icon
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span
                          className={cn(
                            'text-sm font-medium text-foreground',
                            block.status === 'streaming' && 'shimmer-text'
                          )}
                        >
                          {block.title}
                        </span>
                        {block.status === 'streaming' && (
                          <span className="ml-auto text-[10px] font-medium leading-none text-emerald-500">
                            Live
                          </span>
                        )}
                      </div>

                      <div className="pb-2 pl-5">
                        <ProgressiveMessageText
                          messageId={block.blockId}
                          text={block.content || 'Waiting for streamed model output.'}
                          isLive={block.status === 'streaming'}
                          mode="markdown"
                          showStreamingCaret={block.status === 'streaming'}
                          className="text-foreground/90"
                          onVisibleTextChange={() => {
                            if (shouldAutoFollowRef.current) {
                              refreshFollow();
                            }
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

NlStreamPanel.displayName = 'NlStreamPanel';

export { NlStreamPanel };
export type { NlStreamPanelProps };
