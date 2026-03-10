import { Button } from '@/components/ui/button';
import type { SuggestionPill } from './planningUtils';

interface CenteredSuggestionPillsProps {
  suggestions: SuggestionPill[];
  isStreaming: boolean;
  onSuggestionClick: (prompt: string) => void;
}

export function CenteredSuggestionPills({ suggestions, isStreaming, onSuggestionClick }: CenteredSuggestionPillsProps) {
  return (
    <div className="mx-auto flex min-h-[55vh] w-full max-w-5xl flex-col items-center justify-center gap-5 px-6 py-10 text-center">
      <p className="text-base font-medium text-foreground">What are you trying to do today?</p>
      <div className="flex max-w-[40rem] flex-wrap items-center justify-center gap-2">
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion.id}
            type="button"
            variant="outline"
            size="sm"
            className="h-8 max-w-full whitespace-nowrap rounded-full px-3 text-xs"
            disabled={isStreaming}
            onClick={() => onSuggestionClick(suggestion.prompt)}
          >
            {suggestion.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

interface FollowUpSuggestionPillsProps {
  suggestions: SuggestionPill[];
  isStreaming: boolean;
  onSuggestionClick: (prompt: string) => void;
}

export function FollowUpSuggestionPills({ suggestions, isStreaming, onSuggestionClick }: FollowUpSuggestionPillsProps) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="px-4 pt-2 pb-1">
      <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion.id}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 whitespace-nowrap rounded-full px-3 text-xs"
            disabled={isStreaming}
            onClick={() => onSuggestionClick(suggestion.prompt)}
          >
            {suggestion.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
