import type { ModelTemplateParam } from '@/types/model';

interface SearchSpaceEditorProps {
  params: ModelTemplateParam[];
}

function formatRange(p: ModelTemplateParam): string {
  if (p.type === 'boolean') return 'true / false';
  if (p.type === 'select' && p.options?.length) {
    return p.options.map((o) => o.label).join(', ');
  }
  if (p.type === 'number') {
    const parts: string[] = [];
    if (p.min != null && p.max != null) parts.push(`${p.min} \u2013 ${p.max}`);
    else if (p.min != null) parts.push(`\u2265 ${p.min}`);
    else if (p.max != null) parts.push(`\u2264 ${p.max}`);
    if (p.step != null) parts.push(`step ${p.step}`);
    return parts.length ? parts.join(', ') : '\u2014';
  }
  return '\u2014';
}

export function SearchSpaceEditor({ params }: SearchSpaceEditorProps) {
  if (params.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No tunable parameters.</p>;
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Search Space</p>
      <div className="overflow-x-auto rounded-md border border-border/30">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Parameter</th>
              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Type</th>
              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Range</th>
            </tr>
          </thead>
          <tbody>
            {params.map((p) => (
              <tr key={p.key} className="border-b last:border-0">
                <td className="px-3 py-1.5 font-mono text-foreground">{p.key}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{p.type}</td>
                <td className="px-3 py-1.5 font-mono tabular-nums text-muted-foreground">{formatRange(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
