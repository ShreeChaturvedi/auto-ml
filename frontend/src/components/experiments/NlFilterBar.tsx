import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { AnimatedPlaceholderInput } from '@/components/ui/animated-placeholder-input';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { parseNlFilter } from '@/lib/api/experiments';

const FILTER_PLACEHOLDERS = [
  'Show me all completed classification models with accuracy above 0.92 and F1 over 0.85',
  'Filter for random forest and gradient boosting models where precision exceeds 90%',
  'Find regression experiments with RMSE below 0.3 and R\u00B2 above 0.95',
  'Which logistic regression models have both recall over 0.8 and precision over 0.75?',
  'Show only the top-performing clustering models with silhouette scores above 0.7',
  'Find all failed experiments so I can investigate what went wrong',
  'Models where accuracy is above 88% but F1 is still under 0.8 \u2014 possible class imbalance',
  'Show me SVM and decision tree classifiers with recall over 85% on this dataset',
  'Regression models with low MAE \u2014 under 0.15 \u2014 sorted by R\u00B2',
  'Which completed models have the best precision-recall tradeoff above 0.9?',
  'Filter for ensemble methods with accuracy over 0.95 and strong F1 scores',
  'Find all models where any metric dropped below 0.6 \u2014 likely underfitting',
];

export function NlFilterBar() {
  const { projectId } = useParams<{ projectId: string }>();
  const setNlFilter = useExperimentsStore((s) => s.setNlFilter);

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const handleSubmit = useCallback(async () => {
    const query = inputText.trim();
    if (!query || !projectId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);

    try {
      const { predicates } = await parseNlFilter(projectId, query, controller.signal);
      if (controller.signal.aborted) return;

      if (predicates.length > 0) {
        setNlFilter(query, predicates);
      } else {
        toast.warning('No filters could be extracted from that query');
        setNlFilter('', []);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      toast.error('Could not parse filter');
      setNlFilter('', []);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
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
        className="pl-8 h-9 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
      />
      {isLoading && (
        <div className="absolute right-2 top-1/2 z-10 -translate-y-1/2">
          <div className="h-3.5 w-3.5 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
