import { Sparkles, X } from 'lucide-react';
import { useExperimentsStore } from '@/stores/experimentsStore';

export function InsightBanner() {
  const insightBanner = useExperimentsStore((s) => s.insightBanner);

  if (!insightBanner) return null;

  // Loading skeleton
  if (insightBanner.isLoading && !insightBanner.text) {
    return (
      <div className="shrink-0 border-b border-t bg-muted/50 px-4 py-3">
        <div className="timeline-skeleton h-5 w-full rounded" />
      </div>
    );
  }

  // No text produced (LLM returned nothing useful)
  if (!insightBanner.text) return null;

  return (
    <div className="shrink-0 border-b border-t bg-muted/50 px-4 py-2.5 flex items-start gap-2.5">
      <Sparkles className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <p className="text-sm text-foreground leading-relaxed flex-1 min-w-0">
        {insightBanner.text}
      </p>
      <button
        type="button"
        className="shrink-0 mt-0.5 rounded-sm p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        onClick={() => useExperimentsStore.setState({ insightBanner: null })}
        aria-label="Dismiss insight"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
