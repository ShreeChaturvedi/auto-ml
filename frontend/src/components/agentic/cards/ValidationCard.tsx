/**
 * ValidationCard - Displays validation results with before/after metrics.
 *
 * Shows a pass/fail badge, a table of metrics with green/red change indicators,
 * and optional notes.
 */

import { CheckCircle2, XCircle, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { formatMetric } from '@/components/experiments/utils';

export interface ValidationMetric {
  name: string;
  before?: number;
  after?: number;
}

export interface ValidationCardProps {
  passed: boolean;
  metrics?: ValidationMetric[];
  notes?: string;
}

function MetricChangeIndicator({ before, after }: { before?: number; after?: number }) {
  if (before == null || after == null) return null;

  const diff = after - before;
  if (Math.abs(diff) < 1e-6) {
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  }
  if (diff > 0) {
    return <ArrowUp className="h-3 w-3 text-emerald-500" />;
  }
  return <ArrowDown className="h-3 w-3 text-destructive" />;
}

export function ValidationCard({ passed, metrics, notes }: ValidationCardProps) {
  return (
    <div
      className={cn(
        'rounded-md border bg-card shadow-sm overflow-hidden',
        passed ? 'border-emerald-200 dark:border-emerald-800/40' : 'border-destructive/30',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {passed ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-destructive" />
        )}
        <span className="flex-1 text-sm font-medium text-foreground">
          Validation {passed ? 'passed' : 'failed'}
        </span>
        <Badge
          variant={passed ? 'secondary' : 'destructive'}
          className="text-[10px]"
        >
          {passed ? 'PASS' : 'FAIL'}
        </Badge>
      </div>

      {/* Metrics table */}
      {metrics && metrics.length > 0 && (
        <div className="border-t">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30 text-muted-foreground">
                <th className="px-3 py-1.5 text-left font-medium">Metric</th>
                <th className="px-3 py-1.5 text-right font-medium">Before</th>
                <th className="px-3 py-1.5 text-right font-medium">After</th>
                <th className="w-8 px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => (
                <tr key={metric.name} className="border-b last:border-b-0">
                  <td className="px-3 py-1.5 font-medium text-foreground">{metric.name}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-muted-foreground tabular-nums">
                    {formatMetric(metric.before)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-foreground tabular-nums">
                    {formatMetric(metric.after)}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <MetricChangeIndicator before={metric.before} after={metric.after} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes */}
      {notes && (
        <div className="border-t px-3 py-2">
          <p className="text-xs text-muted-foreground leading-relaxed">{notes}</p>
        </div>
      )}
    </div>
  );
}
