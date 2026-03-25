export function MiniBars({ items }: { items: { label: string; value: number }[] }) {
  const maxVal = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="flex items-end gap-[2px] h-8 overflow-hidden">
      {items.slice(0, 6).map((item) => (
        <div key={item.label} className="flex-1 flex flex-col items-center min-w-0">
          <div
            className="w-full max-w-[10px] rounded-t-[1px] bg-primary/35"
            style={{ height: `${Math.max((item.value / maxVal) * 22, 2)}px` }}
          />
          <span className="text-[7px] text-muted-foreground/50 truncate w-full text-center mt-px leading-none">
            {item.label.slice(0, 5)}
          </span>
        </div>
      ))}
    </div>
  );
}
