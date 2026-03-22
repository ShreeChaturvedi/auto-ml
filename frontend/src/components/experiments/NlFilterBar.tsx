import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { AnimatedPlaceholderInput } from '@/components/ui/animated-placeholder-input';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { readNdjsonStream } from '@/lib/api/streamReader';
import { fetchInsights } from '@/lib/api/experiments';
import type { FilterPredicate } from '@/types/experiments';

const AVAILABLE_FIELDS = [
  'accuracy', 'precision', 'recall', 'f1',
  'rmse', 'mae', 'r2', 'silhouette',
  'algorithm', 'name', 'status', 'taskType'
];

const FILTER_PLACEHOLDERS = [
  'Show models with accuracy above 0.9',
  'Filter by random forest algorithm',
  'Find models trained today',
  'Compare regression models by R\u00B2',
  'Show top classification models',
];

export function NlFilterBar() {
  const { projectId } = useParams<{ projectId: string }>();
  const setNlFilter = useExperimentsStore((s) => s.setNlFilter);

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    const query = inputText.trim();
    if (!query || !projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchInsights(projectId, {
        type: 'filter',
        context: { query, availableFields: AVAILABLE_FIELDS }
      });

      let accumulated = '';
      for await (const event of readNdjsonStream<{ type: string; content?: string }>(response)) {
        if (event.type === 'token' && event.content) {
          accumulated += event.content;
        }
      }

      const parsed = JSON.parse(accumulated) as { predicates?: FilterPredicate[] };
      if (parsed.predicates && Array.isArray(parsed.predicates) && parsed.predicates.length > 0) {
        setNlFilter(query, parsed.predicates);
      } else {
        setError('Could not parse filter');
        setNlFilter('', []);
      }
    } catch {
      setError('Could not parse filter');
      setNlFilter('', []);
    } finally {
      setIsLoading(false);
    }
  }, [inputText, projectId, setNlFilter]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="relative flex-1 min-w-0">
      <Search className="absolute left-2 top-1/2 z-10 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <AnimatedPlaceholderInput
        placeholders={FILTER_PLACEHOLDERS}
        interval={4000}
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
        leftPadding={2}
        className="h-9 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0 focus-visible:border-transparent"
      />
      {isLoading && (
        <div className="absolute right-2 top-1/2 z-10 -translate-y-1/2">
          <div className="h-3.5 w-3.5 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
        </div>
      )}
      {error && (
        <p className="absolute left-2 top-full text-[10px] text-destructive mt-0.5">{error}</p>
      )}
    </div>
  );
}
