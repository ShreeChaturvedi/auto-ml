import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FileText } from 'lucide-react';
import { scorePercent, scoreColor } from './shared';

export interface SearchHit {
  chunkId?: string;
  documentId?: string;
  filename?: string;
  score?: number;
  snippet?: string;
  span?: { start: number; end: number };
}

/** Badge border/text classes themed to project color, with opacity tiers by score */
function scoreBadgeClasses(pct: number, projectText?: string, projectBorder?: string): string {
  if (projectText && projectBorder) {
    const opacity = pct >= 70 ? '' : pct >= 40 ? 'opacity-70' : 'opacity-45';
    return cn(projectBorder, projectText, opacity);
  }
  if (pct >= 70) return 'border-emerald-500/40 text-emerald-600';
  if (pct >= 40) return 'border-amber-500/40 text-amber-600';
  return 'border-rose-400/40 text-rose-500';
}

export function SearchDocumentsResult({ items, projectFill, projectText, projectBorder }: {
  items: SearchHit[];
  projectFill?: string;
  projectText?: string;
  projectBorder?: string;
}) {
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
        return (
          <div
            key={hit.chunkId ?? i}
            className="rounded-md border border-border/60 bg-card/50 p-2.5 space-y-1.5"
          >
            {/* Header row: filename + score */}
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground truncate">
                <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                {hit.filename ?? 'unknown'}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] font-mono tabular-nums px-1.5 py-0',
                  scoreBadgeClasses(pct, projectText, projectBorder)
                )}
              >
                {pct}%
              </Badge>
            </div>

            {/* Score bar */}
            <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-[width] duration-300', scoreColor(hit.score ?? 0, projectFill))}
                style={{ width: `${pct}%` }}
              />
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
