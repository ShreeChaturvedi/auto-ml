export function TwoBars({ a, b, labelA, labelB }: { a: number; b: number; labelA: string; labelB: string }) {
  const maxVal = Math.max(a, b, 0.01);
  return (
    <div className="flex items-end gap-2 h-8 overflow-hidden">
      {[{ v: a, l: labelA }, { v: b, l: labelB }].map((bar) => (
        <div key={bar.l} className="flex-1 flex flex-col items-center min-w-0">
          <div
            className="w-full max-w-[16px] rounded-t-[1px] bg-primary/35"
            style={{ height: `${Math.max((bar.v / maxVal) * 20, 2)}px` }}
          />
          <span className="text-[7px] text-muted-foreground/50 mt-px leading-none">{bar.l}</span>
        </div>
      ))}
    </div>
  );
}
