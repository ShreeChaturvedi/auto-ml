import type { NlModelWorkBlockState, NlWorkPhaseState } from '@/types/nlQuery';

import { TranscriptBlock } from './TranscriptBlock';

interface TranscriptTimelineProps {
  modelWorkBlocks: NlModelWorkBlockState[];
  active: NlWorkPhaseState;
  isLive: boolean;
}

function TranscriptTimeline({ modelWorkBlocks, active, isLive }: TranscriptTimelineProps) {
  if (modelWorkBlocks.length > 0) {
    return (
      <ol className="space-y-3">
        {modelWorkBlocks.map((block, index) => (
          <TranscriptBlock
            key={block.blockId}
            block={block}
            isLive={isLive}
            isLast={index === modelWorkBlocks.length - 1}
          />
        ))}
      </ol>
    );
  }

  if (active.events.length > 0) {
    return (
      <div className="rounded-xl border border-border/70 bg-background/70 p-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Phase updates</p>
        <div className="scrollbar-thin mt-2 max-h-40 space-y-1 overflow-y-auto pr-1 text-[12px] leading-relaxed text-muted-foreground">
          {active.events.map((entry, index) => (
            <p key={`${entry.phaseId}-${entry.timestamp}-${index}`}>{entry.summary}</p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-background/45 px-3 py-2 text-[12px] text-muted-foreground">
      Streaming model output will appear here as the query is planned and generated.
    </div>
  );
}

TranscriptTimeline.displayName = 'TranscriptTimeline';

export { TranscriptTimeline };
export type { TranscriptTimelineProps };
