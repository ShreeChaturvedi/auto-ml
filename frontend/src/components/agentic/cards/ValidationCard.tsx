/**
 * ValidationCard — pass/fail display with before/after metric deltas.
 *
 * Neutral shell chrome (no emerald/destructive conditional border), a
 * `StatusPill` for pass/fail, and metric change arrows tinted with the
 * `metric-positive` / `metric-negative` tokens. Numeric cells use the
 * default UI font (not mono) per the "numbers outside pills use
 * font-sans" rule; `tabular-nums` is kept on the numeric cells for
 * column alignment.
 */

import { CheckCircle2, XCircle, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { formatMetric } from '@/components/experiments/utils';
import { ToolCardShell } from '@/components/llm/shared/ToolCardShell';

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
    return <Minus className="h-3 w-3 text-muted-foreground" aria-label="unchanged" />;
  }
  if (diff > 0) {
    return <ArrowUp className="h-3 w-3 text-metric-positive" aria-label="up" />;
  }
  return <ArrowDown className="h-3 w-3 text-metric-negative" aria-label="down" />;
}

export function ValidationCard({ passed, metrics, notes }: ValidationCardProps) {
  const hasBody = (metrics && metrics.length > 0) || !!notes;

  return (
    <ToolCardShell
      icon={passed ? CheckCircle2 : XCircle}
      iconClassName={passed ? 'text-metric-positive' : 'text-metric-negative'}
      title={`Validation ${passed ? 'passed' : 'failed'}`}
      status={passed ? 'success' : 'failed'}
      statusLabel={passed ? 'pass' : 'fail'}
    >
      {hasBody && (
        <>
          {metrics && metrics.length > 0 && (
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
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {formatMetric(metric.before)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                      {formatMetric(metric.after)}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <MetricChangeIndicator before={metric.before} after={metric.after} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {notes && (
            <div className="border-t px-3 py-2">
              <p className="text-xs leading-relaxed text-muted-foreground">{notes}</p>
            </div>
          )}
        </>
      )}
    </ToolCardShell>
  );
}
