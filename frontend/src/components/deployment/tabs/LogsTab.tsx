import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SortHeader } from '@/components/ui/SortHeader';
import { Check, X, ThumbsUp, ThumbsDown, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import type { DeploymentRecord, PredictionLog } from '@/types/deployment';
import { getPredictionLogs, submitFeedback } from '@/lib/api/deployments';
import { timeAgo } from '../deploymentUtils';
import { cn } from '@/lib/utils';

/* ── Helpers ────────────────────────────────────────────────── */

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
const TD = 'py-2.5 px-4';
const TH_PLAIN = 'px-4 text-left align-middle text-xs font-medium text-muted-foreground';

type SortField = 'createdAt' | 'latencyMs';

/* ── Skeleton rows ──────────────────────────────────────────── */

function LogGhostRows() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <tr key={i} className="border-b border-border/10">
          <td className={TD}><div className="h-3.5 w-3.5 rounded skeleton-shimmer" /></td>
          <td className={TD}><div className="h-3 w-14 rounded skeleton-shimmer" /></td>
          <td className={TD}><div className="h-4 w-16 rounded skeleton-shimmer" /></td>
          <td className={TD}><div className="h-3 w-10 rounded skeleton-shimmer" /></td>
          <td className={TD}><div className="h-3 w-32 rounded skeleton-shimmer" /></td>
          <td className={TD}><div className="h-3 w-12 rounded skeleton-shimmer" /></td>
          <td className={TD}><div className="h-3 w-14 rounded skeleton-shimmer" /></td>
          <td className={TD}><div className="h-3 w-6 rounded skeleton-shimmer" /></td>
        </tr>
      ))}
    </>
  );
}

/* ── Component ──────────────────────────────────────────────── */

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
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

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

  /* ---- sorting (client-side on loaded page) ---- */
  const sortedLogs = React.useMemo(() => {
    const sorted = [...logs];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'createdAt') {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else {
        cmp = (a.latencyMs ?? 0) - (b.latencyMs ?? 0);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [logs, sortField, sortDir]);

  const handleToggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const handleFeedback = async (log: PredictionLog, value: 'positive' | 'negative') => {
    const current = feedbackState[log.id] ?? log.feedback;
    if (current === value) return;
    const previous = feedbackState[log.id];
    setFeedbackState(prev => ({ ...prev, [log.id]: value }));
    try {
      await submitFeedback(deployment.deploymentId, log.id, value);
    } catch {
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
      {!loading && logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
          <p className="text-sm font-medium text-foreground">No prediction logs yet</p>
          <p className="text-xs text-muted-foreground">Make your first prediction in the Playground to see it here.</p>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <ScrollArea className="max-h-[600px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card/80 backdrop-blur-md z-20 border-b border-border/20">
                <tr>
                  <th scope="col" className={cn(TH_PLAIN, 'w-8')} />
                  <SortHeader<SortField>
                    field="createdAt"
                    label="Timestamp"
                    sortField={sortField}
                    sortDir={sortDir}
                    onToggle={handleToggleSort}
                    headerClassName=""
                  />
                  <th scope="col" className={TH_PLAIN}>Status</th>
                  <SortHeader<SortField>
                    field="latencyMs"
                    label="Latency"
                    sortField={sortField}
                    sortDir={sortDir}
                    onToggle={handleToggleSort}
                    headerClassName=""
                  />
                  <th scope="col" className={TH_PLAIN}>Input</th>
                  <th scope="col" className={TH_PLAIN}>Prediction</th>
                  <th scope="col" className={TH_PLAIN}>Feedback</th>
                  <th scope="col" className={cn(TH_PLAIN, 'w-12')} />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <LogGhostRows />
                ) : (
                  sortedLogs.map(log => {
                    const isExpanded = expandedId === log.id;
                    const fb = feedbackState[log.id] ?? log.feedback;
                    return (
                      <React.Fragment key={log.id}>
                        <tr
                          tabIndex={0}
                          className={cn(
                            'group cursor-pointer transition-colors hover:bg-muted/30 border-b border-border/10',
                            isExpanded && 'border-b-0',
                          )}
                          onClick={() => setExpandedId(isExpanded ? null : log.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setExpandedId(isExpanded ? null : log.id);
                            }
                          }}
                        >
                          <td className={cn(TD, 'text-muted-foreground w-8')}>
                            {isExpanded
                              ? <ChevronDown className="h-3.5 w-3.5" />
                              : <ChevronRight className="h-3.5 w-3.5" />}
                          </td>
                          <td className={TD}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-xs text-muted-foreground cursor-default">{timeAgo(log.createdAt)}</span>
                              </TooltipTrigger>
                              <TooltipContent>{formatAbsolute(log.createdAt)}</TooltipContent>
                            </Tooltip>
                          </td>
                          <td className={TD}>
                            {log.status === 'success' ? (
                              <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 text-xs px-1.5 py-0">
                                <Check className="h-3 w-3" /> Success
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1 text-red-600 border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 text-xs px-1.5 py-0">
                                <X className="h-3 w-3" /> Error
                              </Badge>
                            )}
                          </td>
                          <td className={cn(TD, 'text-xs tabular-nums')}>
                            {log.latencyMs != null ? `${log.latencyMs}ms` : '—'}
                          </td>
                          <td className={cn(TD, 'text-xs text-muted-foreground max-w-[200px]')}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="block truncate cursor-default">{truncateFeatures(log.inputFeatures)}</span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs break-all text-xs">
                                {truncateFeatures(log.inputFeatures, 8)}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                          <td className={cn(TD, 'text-xs font-mono')}>
                            {log.status === 'success' ? formatPrediction(log.prediction) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className={TD} onClick={e => e.stopPropagation()}>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleFeedback(log, 'positive')}
                                className={cn(
                                  'p-1 rounded transition-colors hover:bg-muted',
                                  fb === 'positive' ? 'text-emerald-500' : 'text-muted-foreground/40 hover:text-muted-foreground',
                                )}
                                aria-label="Thumbs up"
                              >
                                <ThumbsUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleFeedback(log, 'negative')}
                                className={cn(
                                  'p-1 rounded transition-colors hover:bg-muted',
                                  fb === 'negative' ? 'text-red-500' : 'text-muted-foreground/40 hover:text-muted-foreground',
                                )}
                                aria-label="Thumbs down"
                              >
                                <ThumbsDown className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className={TD} onClick={e => e.stopPropagation()}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleReplay(log)}
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Replay in Playground</TooltipContent>
                            </Tooltip>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${log.id}-expanded`} className="bg-muted/20">
                            <td colSpan={8} className="py-3 px-4">
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
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </ScrollArea>
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
            {loadingMore && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
