import { PercentRing } from '@/components/llm/shared/Ring';
import { resolveFileIconByFilename } from '@/lib/fileUtils';
import { scorePercent } from './shared';

export interface SearchHit {
  chunkId?: string;
  documentId?: string;
  filename?: string;
  score?: number;
  snippet?: string;
  span?: { start: number; end: number };
}

export function SearchDocumentsResult({ items }: { items: SearchHit[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No matching documents found.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground font-medium">
        {items.length} result{items.length !== 1 ? 's' : ''}
      </p>
      {items.map((hit, i) => {
        const pct = scorePercent(hit.score ?? 0);
        const { Icon, colorClass } = resolveFileIconByFilename(hit.filename);
        return (
          <div key={hit.chunkId ?? i} className="space-y-1.5">
            {/* Header row: filename + score */}
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground truncate">
                <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${colorClass}`} />
                {hit.filename ?? 'unknown'}
              </span>
              <span className="inline-flex items-center gap-1">
                <PercentRing value={hit.score ?? 0} size={18} />
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                  {pct}%
                </span>
              </span>
            </div>

            {/* Snippet */}
            {hit.snippet && (
              <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
                {hit.snippet}
              </p>
            )}

            {/* Span info */}
            {hit.span && (hit.span.start !== 0 || hit.span.end !== 0) && (
              <p className="text-[10px] font-mono text-muted-foreground/60">
                chars {hit.span.start}–{hit.span.end}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
