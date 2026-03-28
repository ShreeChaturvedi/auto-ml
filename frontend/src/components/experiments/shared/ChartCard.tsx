import { cn } from '@/lib/utils';

interface ChartCardProps {
  label?: string;
  delay: number;
  children: React.ReactNode;
  className?: string;
}

export function ChartCard({ label, delay, children, className }: ChartCardProps) {
  return (
    <div
      className={cn(
        'card-enter rounded-xl border border-border bg-card/50 p-4 shadow-sm dark:shadow-none hover:border-border/80 transition-colors',
        className,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {label && <p className="text-xs font-medium text-foreground/60 mb-3">{label}</p>}
      {children}
    </div>
  );
}
