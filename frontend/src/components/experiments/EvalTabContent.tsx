import { AlertEmptyIllustration, ChartEmptyIllustration } from '@/components/ui/illustrations';
import type { EvaluationResult } from '@/types/experiments';
import { SkeletonBlock } from './shared/Skeleton';

interface EvalTabContentProps {
  isComputing: boolean;
  isFailed: boolean;
  evaluationError?: string;
  evaluation: EvaluationResult | null | undefined;
  failedLabel: string;
  loadingTitle?: string;
  loadingLabel?: string;
  children: (evaluation: EvaluationResult) => React.ReactNode;
}

function SkeletonGrid() {
  const heights = [200, 250, 200];
  return (
    <div className="p-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {heights.map((h, i) => (
          <SkeletonBlock
            key={i}
            height={h}
            delay={i * 100}
            className="rounded-lg bg-muted/30"
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
  loadingTitle = 'Evaluation is still being prepared',
  loadingLabel = 'This model was just trained. Experiments is generating plots and analysis now.',
  children,
}: EvalTabContentProps) {
  if (isComputing) {
    return (
      <div className="space-y-5 p-5">
        <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
          <p className="text-sm font-medium text-foreground">{loadingTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{loadingLabel}</p>
        </div>
        <SkeletonGrid />
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6">
          <AlertEmptyIllustration className="text-destructive/60" />
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
    return (
      <div className="space-y-5 p-5">
        <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
          <p className="text-sm font-medium text-foreground">Loading evaluation results</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The model is registered. Experiments is fetching the latest plots and metrics now.
          </p>
        </div>
        <SkeletonGrid />
      </div>
    );
  }

  if (evaluation === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center space-y-2 py-16">
          <ChartEmptyIllustration className="mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{failedLabel}</p>
        </div>
      </div>
    );
  }

  return <>{children(evaluation)}</>;
}
