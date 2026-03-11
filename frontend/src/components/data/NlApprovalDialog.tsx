/**
 * NlApprovalDialog
 *
 * Suggestion autocomplete dropdown that appears beneath the NL query textarea.
 * Extracted from NlQueryWorkflow to isolate the suggestion overlay UI.
 */

import { cn } from '@/lib/utils';
import type { NlSuggestion } from '@/lib/api/query';

interface NlApprovalDialogProps {
  suggestions: NlSuggestion[];
  activeSuggestionIndex: number;
  onApplySuggestion: (suggestion: NlSuggestion) => void;
}

export function NlApprovalDialog({
  suggestions,
  activeSuggestionIndex,
  onApplySuggestion,
}: NlApprovalDialogProps) {
  return (
    <div className="absolute inset-x-0 top-full z-20 mt-2 rounded-xl border border-border/70 bg-background/95 p-2 shadow-xl backdrop-blur-sm">
      <div className="mb-1 px-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        Suggested analyses
      </div>
      <div className="space-y-1">
        {suggestions.map((suggestion, index) => (
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
            onClick={() => onApplySuggestion(suggestion)}
          >
            <span className="text-[11px] font-medium text-foreground/95">{suggestion.label}</span>
            <span className="mt-1 text-xs leading-relaxed text-muted-foreground">{suggestion.prompt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
