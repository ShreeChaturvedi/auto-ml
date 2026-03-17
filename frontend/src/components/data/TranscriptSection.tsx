import { ChevronDown, ChevronUp } from 'lucide-react';

import type { NlModelWorkBlockState, NlWorkPhaseState } from '@/types/nlQuery';
import { TranscriptTimeline } from './TranscriptTimeline';
import { pluralize } from './nlWorkPlanUtils';

interface TranscriptSectionProps {
  modelWorkBlocks: NlModelWorkBlockState[];
  active: NlWorkPhaseState;
  transcriptExpanded: boolean;
  onToggleTranscript: () => void;
  isReviewMode: boolean;
  shouldKeepTranscriptLive: boolean;
}

export function TranscriptSection({
  modelWorkBlocks,
  active,
  transcriptExpanded,
  onToggleTranscript,
  isReviewMode,
  shouldKeepTranscriptLive
}: TranscriptSectionProps) {
  if (!isReviewMode) {
    return (
      <TranscriptTimeline
        modelWorkBlocks={modelWorkBlocks}
        active={active}
        isLive={shouldKeepTranscriptLive}
      />
    );
  }

  return (
    <section className="rounded-xl border border-border/70 bg-background/55 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Transcript</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {modelWorkBlocks.length > 0
              ? `${pluralize('block', modelWorkBlocks.length)} captured`
              : 'No model transcript was captured.'}
          </p>
        </div>

        {modelWorkBlocks.length > 0 && (
          <button
            type="button"
            onClick={onToggleTranscript}
            className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background/70 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            aria-label={transcriptExpanded ? 'Hide transcript' : 'Show transcript'}
          >
            {transcriptExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {transcriptExpanded ? 'Hide transcript' : 'Show transcript'}
          </button>
        )}
      </div>

      {transcriptExpanded && (
        <div className="mt-3 border-t border-border/70 pt-3">
          <TranscriptTimeline
            modelWorkBlocks={modelWorkBlocks}
            active={active}
            isLive={false}
          />
        </div>
      )}
    </section>
  );
}
