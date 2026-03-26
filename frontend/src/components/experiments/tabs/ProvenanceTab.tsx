import { useMemo } from 'react';
import {
  Upload,
  SlidersHorizontal,
  Sparkles,
  GraduationCap,
  BarChart3,
  Info,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useModelStore } from '@/stores/modelStore';
import { cn } from '@/lib/utils';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { ChartCard } from '../shared/ChartCard';

/* ------------------------------------------------------------------ */
/*  Phase pipeline data                                                */
/* ------------------------------------------------------------------ */

const PHASES = [
  { key: 'upload', label: 'Upload', icon: Upload },
  { key: 'preprocess', label: 'Preprocess', icon: SlidersHorizontal },
  { key: 'features', label: 'Features', icon: Sparkles },
  { key: 'training', label: 'Training', icon: GraduationCap },
  { key: 'evaluation', label: 'Evaluation', icon: BarChart3 },
] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export interface ProvenanceTabProps {
  modelId: string;
}

export function ProvenanceTab({ modelId }: ProvenanceTabProps) {
  const model = useModelStore((s) => s.models.find((m) => m.modelId === modelId));
  const { colorClasses } = useProjectThemeColor();

  const hasProvenanceMetadata = useMemo(() => {
    if (!model?.metadata) return false;
    return Object.keys(model.metadata).length > 0;
  }, [model?.metadata]);

  if (!model) return null;

  const trainingDate = model.createdAt
    ? new Date(model.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div className="space-y-5 p-5">
      {/* -- Pipeline Timeline -- */}
      <ChartCard delay={0} className="p-6">
        <h3 className="text-sm font-semibold text-foreground mb-5">
          <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-2', colorClasses?.fill ?? 'bg-primary/50')} />
          Pipeline Timeline
        </h3>

        <div className="flex items-center justify-between gap-0">
          {PHASES.map((phase, i) => {
            const Icon = phase.icon;
            const isTraining = phase.key === 'training';

            return (
              <div key={phase.key} className="flex items-center flex-1 last:flex-none">
                {/* Node */}
                <div
                  className="card-enter flex flex-col items-center gap-1.5 min-w-[80px]"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div
                    className={cn(
                      'flex items-center justify-center',
                      isTraining
                        ? 'h-11 w-11 rounded-xl border border-primary/30 bg-primary/10 text-primary shadow-[0_0_12px_-3px] shadow-primary/20'
                        : 'h-11 w-11 rounded-xl border border-border/20 bg-muted/30 text-muted-foreground',
                    )}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <span
                    className={cn(
                      'text-[11px] font-medium tracking-wide',
                      isTraining ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {phase.label}
                  </span>
                  {isTraining && trainingDate && (
                    <span className="text-[10px] text-muted-foreground">
                      {trainingDate}
                    </span>
                  )}
                  {isTraining && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {model.algorithm}
                    </Badge>
                  )}
                </div>

                {/* Connector line (not after last node) */}
                {i < PHASES.length - 1 && (
                  <div className="flex-1 h-px bg-gradient-to-r from-border/40 via-border/20 to-border/40 mx-1 min-w-[12px]" />
                )}
              </div>
            );
          })}
        </div>
      </ChartCard>

      {/* -- Info Banner -- */}
      <div className={cn('flex gap-3 rounded-xl border p-4', colorClasses?.border ?? 'border-primary/15', colorClasses?.fillMuted ?? 'bg-primary/[0.03]')}>
        <Info className={cn('h-4 w-4 shrink-0 mt-0.5', colorClasses?.text ?? 'text-primary/60')} />
        <p className="text-sm text-muted-foreground leading-relaxed">
          Provenance tracking captures how preprocessing decisions affect model
          performance. Models trained after provenance tracking is enabled will
          show detailed preprocessing attribution here.
        </p>
      </div>

      {/* -- Preprocessing Metadata (if available) -- */}
      {hasProvenanceMetadata && model.metadata && (
        <ChartCard label="Preprocessing Metadata" delay={160} className="p-6">
          <div className="rounded-lg bg-background/80 border border-border/10 p-4 overflow-x-auto">
            <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap break-words">
              {JSON.stringify(model.metadata, null, 2)}
            </pre>
          </div>
        </ChartCard>
      )}
    </div>
  );
}
