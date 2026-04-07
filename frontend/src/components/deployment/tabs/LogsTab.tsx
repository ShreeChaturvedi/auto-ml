import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Check, X, ThumbsUp, ThumbsDown, ChevronDown, ChevronRight, RotateCcw, Loader2 } from 'lucide-react';
import type { DeploymentRecord, PredictionLog } from '@/types/deployment';
import { getPredictionLogs, submitFeedback } from '@/lib/api/deployments';
import { cn } from '@/lib/utils';

function timeAgo(date: string): string {
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h ago`;
  return `${Math.floor(ms / 86400_000)}d ago`;
}

function formatAbsolute(date: string): string {
  return new Date(date).toLocaleString();
}

function truncateFeatures(features: Record<string, unknown>, max = 3): string {
  const entries = Object.entries(features).slice(0, max);
  const parts = entries.map(([k, v]) => `${k}: ${String(v)}`);
  const suffix = Object.keys(features).length > max ? ', …' : '';
  return parts.join(', ') + suffix;
}

function formatPrediction(prediction: Record<string, unknown>): string {
  const val = prediction['prediction'] ?? prediction['label'] ?? prediction['value'];
  if (val !== undefined) return String(val);
  const entries = Object.entries(prediction);
  if (entries.length === 1) return String(entries[0][1]);
  return JSON.stringify(prediction);
}

const TIME_RANGE_OPTIONS = [
  { label: '1h', hours: 1 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
] as const;

const PAGE_SIZE = 25;

interface Props {
  deployment: DeploymentRecord;
}

export function LogsTab({ deployment }: Props) {
  const [, setSearchParams] = useSearchParams();
  const [logs, setLogs] = useState<PredictionLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all');
  const [timeRange, setTimeRange] = useState<1 | 24 | 168>(24);
  const [feedbackState, setFeedbackState] = useState<Record<number, 'positive' | 'negative'>>({});

  const fetchLogs = useCallback(async (offset = 0, replace = true) => {
    const isFirst = offset === 0;
    if (isFirst) setLoading(true); else setLoadingMore(true);
    try {
      const startTime = new Date(Date.now() - timeRange * 3600_000).toISOString();
      const res = await getPredictionLogs(deployment.deploymentId, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        startTime,
        limit: PAGE_SIZE,
        offset,
      });
      if (res.logs !== undefined) {
        setLogs(prev => replace ? res.logs : [...prev, ...res.logs]);
        setTotal(res.total);
      }
    } finally {
      if (isFirst) setLoading(false); else setLoadingMore(false);
    }
  }, [deployment.deploymentId, statusFilter, timeRange]);

  useEffect(() => { void fetchLogs(0, true); }, [fetchLogs]);

  const handleFeedback = async (log: PredictionLog, value: 'positive' | 'negative') => {
    const current = feedbackState[log.id] ?? log.feedback;
    if (current === value) return;
    const previous = feedbackState[log.id];
    setFeedbackState(prev => ({ ...prev, [log.id]: value }));
    try {
      await submitFeedback(deployment.deploymentId, log.id, value);
    } catch {
      // Rollback optimistic update on failure
      setFeedbackState(prev => {
        const next = { ...prev };
        if (previous !== undefined) next[log.id] = previous;
        else delete next[log.id];
        return next;
      });
    }
  };

  const handleReplay = (log: PredictionLog) => {
    setSearchParams({ section: 'playground', replay: JSON.stringify(log.inputFeatures) });
  };

  const hasMore = logs.length < total;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center rounded-md border border-border overflow-hidden text-xs">
          {(['all', 'success', 'error'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 capitalize transition-colors',
                statusFilter === s
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted/50'
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center rounded-md border border-border overflow-hidden text-xs">
          {TIME_RANGE_OPTIONS.map(({ label, hours }) => (
            <button
              key={label}
              onClick={() => setTimeRange(hours)}
              className={cn(
                'px-3 py-1.5 transition-colors',
                timeRange === hours
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted/50'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{total} total</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading logs…</span>
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
          <p className="text-sm font-medium text-foreground">No prediction logs yet</p>
          <p className="text-xs text-muted-foreground">Make your first prediction in the Playground to see it here.</p>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-8" />
                <TableHead className="text-xs">Timestamp</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Latency</TableHead>
                <TableHead className="text-xs">Input</TableHead>
                <TableHead className="text-xs">Prediction</TableHead>
                <TableHead className="text-xs">Feedback</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map(log => {
                const isExpanded = expandedId === log.id;
                const fb = feedbackState[log.id] ?? log.feedback;
                return (
                  <React.Fragment key={log.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      <TableCell className="text-muted-foreground w-8">
                        {isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5" />
                          : <ChevronRight className="h-3.5 w-3.5" />}
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs text-muted-foreground cursor-default">{timeAgo(log.createdAt)}</span>
                          </TooltipTrigger>
                          <TooltipContent>{formatAbsolute(log.createdAt)}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {log.status === 'success' ? (
                          <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 text-xs px-1.5 py-0">
                            <Check className="h-3 w-3" /> Success
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-red-600 border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 text-xs px-1.5 py-0">
                            <X className="h-3 w-3" /> Error
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {log.latencyMs != null ? `${log.latencyMs}ms` : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {truncateFeatures(log.inputFeatures)}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {log.status === 'success' ? formatPrediction(log.prediction) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleFeedback(log, 'positive')}
                            className={cn('p-1 rounded transition-colors hover:bg-muted', fb === 'positive' ? 'text-emerald-500' : 'text-muted-foreground/50 hover:text-muted-foreground')}
                            aria-label="Thumbs up"
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleFeedback(log, 'negative')}
                            className={cn('p-1 rounded transition-colors hover:bg-muted', fb === 'negative' ? 'text-red-500' : 'text-muted-foreground/50 hover:text-muted-foreground')}
                            aria-label="Thumbs down"
                          >
                            <ThumbsDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-foreground"
                              onClick={() => handleReplay(log)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Replay in Playground</TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${log.id}-expanded`} className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={8} className="py-3 px-4">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <p className="text-muted-foreground font-medium mb-1.5">Input</p>
                              <pre className="bg-background rounded border border-border p-2.5 overflow-auto max-h-48 text-[11px] leading-relaxed font-mono">
                                {JSON.stringify(log.inputFeatures, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <p className="text-muted-foreground font-medium mb-1.5">
                                {log.status === 'error' ? 'Error' : 'Output'}
                              </p>
                              <pre className="bg-background rounded border border-border p-2.5 overflow-auto max-h-48 text-[11px] leading-relaxed font-mono">
                                {log.status === 'error'
                                  ? (log.errorMessage ?? 'Unknown error')
                                  : JSON.stringify(log.prediction, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {hasMore && !loading && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchLogs(logs.length, false)}
            disabled={loadingMore}
            className="text-xs gap-2"
          >
            {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
