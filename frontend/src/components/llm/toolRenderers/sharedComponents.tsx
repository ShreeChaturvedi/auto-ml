import { Badge } from '@/components/ui/badge';

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

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={`text-[10px] capitalize ${className ?? ''}`}>
      {status.replaceAll('_', ' ')}
    </Badge>
  );
}
