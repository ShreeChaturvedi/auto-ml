import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
import { useExperimentsStore } from '@/stores/experimentsStore';
import type { EvaluationResult } from '@/types/experiments';

interface EvalTabContentProps {
  modelId: string;
  isComputing: boolean;
  isFailed: boolean;
  evaluationError?: string;
  evaluation: EvaluationResult | undefined;
  failedLabel: string;
  children: (evaluation: EvaluationResult) => React.ReactNode;
}

export function EvalTabContent({
  modelId,
  isComputing,
  isFailed,
  evaluationError,
  evaluation,
  failedLabel,
  children,
}: EvalTabContentProps) {
  const fetchEvaluation = useExperimentsStore((s) => s.fetchEvaluation);

  const retry = () => {
    useExperimentsStore.setState((s) => {
      const next = { ...s.evaluations };
      delete next[modelId];
      return { evaluations: next };
    });
    fetchEvaluation(modelId);
  };

  if (isComputing) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Evaluation computing...</p>
        </div>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center max-w-sm">
          <p className="text-sm text-destructive">
            Evaluation failed{evaluationError ? `: ${evaluationError}` : ''}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{failedLabel}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
            <RefreshCcw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading evaluation data...</p>
      </div>
    );
  }

  return <>{children(evaluation)}</>;
}
