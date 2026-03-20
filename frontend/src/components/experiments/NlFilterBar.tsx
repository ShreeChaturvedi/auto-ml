import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { readNdjsonStream } from '@/lib/api/streamReader';
import { fetchInsights } from '@/lib/api/experiments';
import type { FilterPredicate } from '@/types/experiments';

const AVAILABLE_FIELDS = [
  'accuracy', 'precision', 'recall', 'f1',
  'rmse', 'mae', 'r2', 'silhouette',
  'algorithm', 'name', 'status', 'taskType'
];

function formatOperator(op: FilterPredicate['operator']): string {
  switch (op) {
    case 'gt': return '>';
    case 'lt': return '<';
    case 'gte': return '>=';
    case 'lte': return '<=';
    case 'eq': return '=';
    case 'contains': return 'contains';
  }
}

export function NlFilterBar() {
  const { projectId } = useParams<{ projectId: string }>();
  const activePredicates = useExperimentsStore((s) => s.activePredicates);
  const setNlFilter = useExperimentsStore((s) => s.setNlFilter);
  const clearFilter = useExperimentsStore((s) => s.clearFilter);

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

      // Parse the accumulated JSON to extract predicates
      const parsed = JSON.parse(accumulated) as { predicates?: FilterPredicate[] };
      if (parsed.predicates && Array.isArray(parsed.predicates) && parsed.predicates.length > 0) {
        setNlFilter(query, parsed.predicates);
        setError(null);
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

  const removePredicate = useCallback(
    (index: number) => {
      const next = activePredicates.filter((_, i) => i !== index);
      if (next.length === 0) {
        clearFilter();
        setInputText('');
      } else {
        setNlFilter(inputText, next);
      }
    },
    [activePredicates, clearFilter, inputText, setNlFilter]
  );

  const handleClearAll = useCallback(() => {
    clearFilter();
    setInputText('');
    setError(null);
  }, [clearFilter]);

  return (
    <div className="px-4 py-2 border-b space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Filter models... (e.g., accuracy > 0.8)'
          className="h-8 pl-8 text-xs"
          disabled={isLoading}
        />
        {isLoading && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <div className="h-3.5 w-3.5 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {activePredicates.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activePredicates.map((pred, i) => (
            <Badge
              key={`${pred.field}-${pred.operator}-${pred.value}-${i}`}
              variant="secondary"
              className="text-[10px] gap-1 pl-2 pr-1 py-0.5"
            >
              <span>{pred.field} {formatOperator(pred.operator)} {pred.value}</span>
              <button
                type="button"
                className="rounded-sm hover:bg-muted-foreground/20 p-0.5 transition-colors"
                onClick={() => removePredicate(i)}
                aria-label={`Remove filter: ${pred.field} ${formatOperator(pred.operator)} ${pred.value}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
          <button
            type="button"
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            onClick={handleClearAll}
          >
            Clear All
          </button>
        </div>
      )}
    </div>
  );
}
