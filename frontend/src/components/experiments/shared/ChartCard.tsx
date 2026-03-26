interface ChartCardProps {
  label: string;
  delay: number;
  children: React.ReactNode;
  className?: string;
}

export function ChartCard({ label, delay, children, className }: ChartCardProps) {
  return (
    <div
      className={`card-enter rounded-xl border border-border/20 bg-card/50 p-4 hover:border-border/30 transition-colors${className ? ` ${className}` : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-xs font-medium text-foreground/60 mb-3">{label}</p>
      {children}
    </div>
  );
}
