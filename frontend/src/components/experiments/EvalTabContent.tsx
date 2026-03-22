import type { EvaluationResult } from '@/types/experiments';

interface EvalTabContentProps {
  isComputing: boolean;
  isFailed: boolean;
  evaluationError?: string;
  evaluation: EvaluationResult | null | undefined;
  failedLabel: string;
  children: (evaluation: EvaluationResult) => React.ReactNode;
}

export function EvalTabContent({
  isComputing,
  isFailed,
  evaluationError,
  evaluation,
  failedLabel,
  children,
}: EvalTabContentProps) {
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
        </div>
      </div>
    );
  }

  if (evaluation === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading evaluation data...</p>
      </div>
    );
  }

  if (evaluation === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center max-w-sm">
          <p className="text-sm text-muted-foreground">{failedLabel}</p>
        </div>
      </div>
    );
  }

  return <>{children(evaluation)}</>;
}
