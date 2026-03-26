export function ProgressBar({ ratio }: { ratio: number }) {
  return (
    <div className="h-[3px] w-full bg-muted/20 rounded-full overflow-hidden">
      <div
        className="h-full bg-primary/45 rounded-full transition-all duration-700"
        style={{ width: `${Math.min(Math.max(ratio, 0), 1) * 100}%` }}
      />
    </div>
  );
}
