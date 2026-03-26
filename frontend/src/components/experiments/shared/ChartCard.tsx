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
        'card-enter rounded-xl border border-border/20 bg-card/50 p-4 hover:border-border/30 transition-colors',
        className,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {label && <p className="text-xs font-medium text-foreground/60 mb-3">{label}</p>}
      {children}
    </div>
  );
}
