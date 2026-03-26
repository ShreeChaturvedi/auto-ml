import { AlertTriangle, BarChart3 } from 'lucide-react';
import type { EvaluationResult } from '@/types/experiments';

interface EvalTabContentProps {
  isComputing: boolean;
  isFailed: boolean;
  evaluationError?: string;
  evaluation: EvaluationResult | null | undefined;
  failedLabel: string;
  children: (evaluation: EvaluationResult) => React.ReactNode;
}

function SkeletonGrid() {
  const heights = [200, 250, 200];
  return (
    <div className="p-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {heights.map((h, i) => (
          <div
            key={i}
            className="card-enter timeline-skeleton rounded-lg bg-muted/30"
            style={{ height: `${h}px`, animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    </div>
  );
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
    return <SkeletonGrid />;
  }

  if (isFailed) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6">
          <AlertTriangle className="h-8 w-8 text-destructive/60" />
          <p className="text-sm font-medium text-destructive mt-3">Evaluation failed</p>
          {evaluationError && (
            <p className="text-xs text-muted-foreground mt-1">{evaluationError}</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">{failedLabel}</p>
        </div>
      </div>
    );
  }

  if (evaluation === undefined) {
    return <SkeletonGrid />;
  }

  if (evaluation === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center space-y-2 py-16">
          <BarChart3 className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">{failedLabel}</p>
        </div>
      </div>
    );
  }

  return <>{children(evaluation)}</>;
}
