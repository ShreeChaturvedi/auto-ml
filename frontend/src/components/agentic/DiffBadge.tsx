import type { SavepointDiff } from '@/types/savepoint';

interface DiffBadgeProps {
  diff: SavepointDiff;
  onHover?: (hovering: boolean) => void;
  onClick?: () => void;
}

export function DiffBadge({ diff, onHover, onClick }: DiffBadgeProps) {
  const { linesAdded, linesRemoved } = diff;
  if (linesAdded + linesRemoved === 0) return null;

  return (
    <button
      type="button"
      aria-label={`${linesAdded} lines added, ${linesRemoved} lines removed`}
      className="inline-flex items-center gap-1.5 rounded-full bg-muted/50 px-2 py-0.5 text-xs font-mono opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:opacity-100"
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onClick={onClick}
    >
      {linesAdded > 0 && <span className="text-emerald-600">+{linesAdded}</span>}
      {linesRemoved > 0 && <span className="text-red-500">-{linesRemoved}</span>}
    </button>
  );
}
