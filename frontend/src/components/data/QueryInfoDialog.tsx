/**
 * QueryInfoDialog - Dialog showing query metadata, SQL, and explanation
 */

import { Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { QueryMode, EdaSummary } from '@/types/file';
import type { NlQueryExplanation } from '@/lib/api/query';

export interface QueryInfo {
  query: string;
  mode: QueryMode;
  timestamp: Date;
  eda?: EdaSummary;
  cached?: boolean;
  cacheTimestamp?: string;
  executionMs?: number;
  generatedSql?: string;
  rationale?: string;
  explanation?: NlQueryExplanation;
}

interface QueryInfoDialogProps {
  queryInfo: QueryInfo;
  hasEda: boolean;
}

export function QueryInfoDialog({ queryInfo, hasEda }: QueryInfoDialogProps) {
  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Query details">
              <Info className="h-3.5 w-3.5" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Query details</TooltipContent>
      </Tooltip>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Query Information</DialogTitle>
          <DialogDescription>
            Metadata and SQL context for the currently displayed query result.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Executed</p>
              <p className="text-sm font-mono">{queryInfo.timestamp.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Mode</p>
              <span
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full font-mono',
                  queryInfo.mode === 'sql'
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                )}
              >
                {queryInfo.mode.toUpperCase()}
              </span>
            </div>
            {typeof queryInfo.executionMs === 'number' && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Execution Time</p>
                <p className="text-sm font-mono">{Math.round(queryInfo.executionMs)} ms</p>
              </div>
            )}
            {queryInfo.cached !== undefined && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Cache</p>
                <p className="text-sm font-mono">
                  {queryInfo.cached ? 'Cache hit' : 'Miss'}
                  {queryInfo.cacheTimestamp ? ` (${queryInfo.cacheTimestamp})` : ''}
                </p>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">User Query</p>
            <pre className="text-xs font-mono p-3 bg-muted rounded-md overflow-x-auto max-h-64">
              {queryInfo.query}
            </pre>
          </div>

          {queryInfo.generatedSql && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Generated SQL</p>
              <pre className="text-xs font-mono p-3 bg-muted rounded-md overflow-x-auto max-h-64">
                {queryInfo.generatedSql}
              </pre>
            </div>
          )}

          {queryInfo.rationale && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Rationale</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{queryInfo.rationale}</p>
            </div>
          )}

          {queryInfo.explanation && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Explanation</p>
              <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Confidence</span>
                  <span className="text-xs font-mono">
                    {Math.round(queryInfo.explanation.confidence * 100)}%
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide',
                      queryInfo.explanation.warningLevel === 'high'
                        ? 'bg-destructive/10 text-destructive'
                        : queryInfo.explanation.warningLevel === 'medium'
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          : queryInfo.explanation.warningLevel === 'low'
                            ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
                            : 'bg-green-500/10 text-green-700 dark:text-green-400'
                    )}
                  >
                    {queryInfo.explanation.warningLevel}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {queryInfo.explanation.intentSummary}
                </p>
                {queryInfo.explanation.assumptions.length > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">Assumptions</p>
                    <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
                      {queryInfo.explanation.assumptions.map((assumption, idx) => (
                        <li key={`${assumption}-${idx}`}>{assumption}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {hasEda && (
            <p className="text-xs text-muted-foreground">
              EDA summary available for this result. Use the Analysis tab to explore visuals.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
