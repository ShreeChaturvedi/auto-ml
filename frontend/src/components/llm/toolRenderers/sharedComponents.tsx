import { Rows3, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DetailField {
  label: string;
  value: string | undefined;
  mono?: boolean;
}

export function DetailGrid({ fields }: { fields: DetailField[] }) {
  const visible = fields.filter((f) => f.value);
  if (visible.length === 0) return null;
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
      {visible.map((f) => (
        <div key={f.label} className="contents">
          <span>{f.label}</span>
          <span className={f.mono ? 'font-mono' : 'text-foreground'}>{f.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * DimensionPill — "N rows × M cols" capsule matching the reference pattern
 * in `PreprocessingDialogs.tsx:23-36`. Shared by every simple renderer that
 * surfaces dataset dimensions.
 */
export function DimensionPill({
  rows,
  cols,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  if (rows == null && cols == null) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground',
        className,
      )}
    >
      <Rows3 className="h-3 w-3" />
      {rows != null && <span>{rows.toLocaleString()}</span>}
      {rows != null && cols != null && <X className="h-2.5 w-2.5 opacity-70" />}
      {cols != null && <span>{cols}</span>}
    </span>
  );
}
