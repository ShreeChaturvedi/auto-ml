import { useCallback, useLayoutEffect, useRef } from 'react';

import { ProgressiveMessageText } from '@/components/llm/ProgressiveMessageText';
import { getNlWorkPhaseLabel } from '@/lib/nlQuery/phaseStateMachine';
import type { NlModelWorkBlockState } from '@/types/nlQuery';
import { cn } from '@/lib/utils';

import {
  blockAppearance,
  distanceFromViewportBottom,
  scheduleScrollToBottom,
  scrollElementToBottom,
  transcriptBodyClass
} from './nlWorkPlanUtils';

interface TranscriptBlockProps {
  block: NlModelWorkBlockState;
  isLive: boolean;
  isLast: boolean;
}

function TranscriptBlock({ block, isLive, isLast }: TranscriptBlockProps) {
  const appearance = blockAppearance(block.kind);
  const Icon = appearance.icon;
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoFollowInnerRef = useRef(true);

  const followInnerTranscript = useCallback(() => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }

    scheduleScrollToBottom(body);
  }, []);

  const handleInnerScroll = useCallback(() => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }

    shouldAutoFollowInnerRef.current = distanceFromViewportBottom(body) <= 24;
  }, []);

  useLayoutEffect(() => {
    if (!isLive || block.status !== 'streaming' || !shouldAutoFollowInnerRef.current) {
      return;
    }

    const body = bodyRef.current;
    if (!body) {
      return;
    }

    scrollElementToBottom(body);
  }, [block.content, block.status, isLive]);

  return (
    <li className="relative pl-5">
      {!isLast && (
        <span className="absolute left-[6px] top-6 bottom-[-14px] w-px bg-border/70" aria-hidden="true" />
      )}
      <span
        className={cn(
          'absolute left-0 top-3 h-3 w-3 rounded-full ring-4 ring-background/95',
          appearance.dot
        )}
        aria-hidden="true"
      />

      <section
        className={cn(
          'rounded-xl border px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
          appearance.card
        )}
        data-testid={`nl-model-work-block-${block.blockId}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium', appearance.badge)}>
                <Icon className="h-3 w-3" />
                {appearance.label}
              </span>
              {block.phaseId && (
                <span className="text-[11px] text-muted-foreground">
                  {getNlWorkPhaseLabel(block.phaseId)}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm font-semibold leading-snug text-foreground/95">{block.title}</p>
          </div>

          {block.status === 'streaming' && (
            <span className="rounded-full border border-border/70 bg-background/70 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Live
            </span>
          )}
          {block.status === 'failed' && (
            <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-destructive">
              Failed
            </span>
          )}
        </div>

        <div
          ref={bodyRef}
          className={cn(
            'mt-2 overflow-y-auto pr-1 text-foreground/90',
            transcriptBodyClass(block.kind)
          )}
          data-testid={`nl-model-work-block-body-${block.blockId}`}
          onScroll={handleInnerScroll}
        >
          <ProgressiveMessageText
            messageId={block.blockId}
            text={block.content || 'Waiting for streamed model output.'}
            isLive={isLive && block.status === 'streaming'}
            mode="markdown"
            showStreamingCaret={block.status === 'streaming'}
            onVisibleTextChange={() => {
              if (!shouldAutoFollowInnerRef.current) {
                return;
              }

              followInnerTranscript();
            }}
            className="nl-model-work-stream text-[12px] leading-relaxed"
          />
        </div>
      </section>
    </li>
  );
}

TranscriptBlock.displayName = 'TranscriptBlock';

export { TranscriptBlock };
export type { TranscriptBlockProps };
