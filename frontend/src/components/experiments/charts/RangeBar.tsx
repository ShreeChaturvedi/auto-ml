export function RangeBar({ min, max, total }: { min: number; max: number; total: number }) {
  const rng = total || 1;
  const left = (min / rng) * 100;
  const width = ((max - min) / rng) * 100;
  return (
    <div className="h-[4px] w-full bg-muted/15 rounded-full relative overflow-hidden">
      <div
        className="absolute h-full bg-primary/40 rounded-full transition-[left,width] duration-700"
        style={{ left: `${left}%`, width: `${Math.max(width, 3)}%` }}
      />
    </div>
  );
}
