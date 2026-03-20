import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ErrorTreeNode } from '@/types/experiments';

function errorRateColor(rate: number): string {
  if (rate >= 0.6) return 'bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-400';
  if (rate >= 0.4) return 'bg-orange-500/15 border-orange-500/40 text-orange-700 dark:text-orange-400';
  if (rate >= 0.2) return 'bg-yellow-500/15 border-yellow-500/40 text-yellow-700 dark:text-yellow-400';
  return 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400';
}

export function ErrorTreeNodeCard({ node, depth = 0 }: { node: ErrorTreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = !!(node.left || node.right);
  const isLeaf = !hasChildren;

  return (
    <div className={cn('ml-0', depth > 0 && 'ml-4 mt-2')}>
      <button
        type="button"
        onClick={() => hasChildren && setExpanded(!expanded)}
        disabled={isLeaf}
        className={cn(
          'w-full text-left rounded-lg border p-3 transition-colors',
          errorRateColor(node.error_rate),
          hasChildren && 'cursor-pointer hover:opacity-80',
          isLeaf && 'cursor-default',
        )}
      >
        <div className="flex items-center gap-2">
          {hasChildren ? (
            expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />
          ) : (
            <div className="w-4" />
          )}
          <div className="flex-1 min-w-0">
            {node.feature ? (
              <span className="text-sm font-medium">{node.feature} &le; {node.threshold}</span>
            ) : (
              <span className="text-sm font-medium italic">Leaf</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs tabular-nums shrink-0">
            <span>
              <span className="text-muted-foreground">errors:</span>{' '}
              <span className="font-semibold">{node.error_count}</span>
              <span className="text-muted-foreground">/{node.sample_count}</span>
            </span>
            <span className="font-bold">{(node.error_rate * 100).toFixed(1)}%</span>
          </div>
        </div>
      </button>
      {expanded && hasChildren && (
        <div className="border-l-2 border-muted-foreground/20 ml-4">
          {node.left && (
            <div>
              <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">True (left)</span>
              <ErrorTreeNodeCard node={node.left} depth={depth + 1} />
            </div>
          )}
          {node.right && (
            <div>
              <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">False (right)</span>
              <ErrorTreeNodeCard node={node.right} depth={depth + 1} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
