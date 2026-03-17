import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlotEmptyStateProps {
  icon?: LucideIcon;
  message: string;
  className?: string;
}

export function PlotEmptyState({ icon: Icon, message, className }: PlotEmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-muted-foreground', className)}>
      {Icon && <Icon className="h-8 w-8 mb-2 opacity-40" />}
      <p className="text-sm">{message}</p>
    </div>
  );
}
