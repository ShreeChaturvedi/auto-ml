import { cn } from '@/lib/utils';
import { ChartEmptyIllustration } from '@/components/ui/illustrations';

interface PlotEmptyStateProps {
  message: string;
  className?: string;
}

export function PlotEmptyState({ message, className }: PlotEmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-muted-foreground empty-state-enter', className)}>
      <ChartEmptyIllustration className="mb-2" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
