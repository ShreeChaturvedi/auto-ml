import { useMemo } from 'react';
import {
  Upload,
  SlidersHorizontal,
  Sparkles,
  GraduationCap,
  BarChart3,
  Info,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useModelStore } from '@/stores/modelStore';
import { cn } from '@/lib/utils';

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
    <div className="space-y-6 p-4">
      {/* ── Pipeline Timeline ── */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Pipeline Timeline
          </h3>

          <div className="flex items-center justify-between gap-0">
            {PHASES.map((phase, i) => {
              const Icon = phase.icon;
              const isTraining = phase.key === 'training';

              return (
                <div key={phase.key} className="flex items-center flex-1 last:flex-none">
                  {/* Node */}
                  <div className="flex flex-col items-center gap-1.5 min-w-[80px]">
                    <div
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg border',
                        isTraining
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border bg-muted/50 text-muted-foreground',
                      )}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <span
                      className={cn(
                        'text-[11px] font-medium',
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
                    <div className="flex-1 h-px bg-border mx-1 min-w-[12px]" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Info Banner ── */}
      <div className="flex gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
        <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground leading-relaxed">
          Provenance tracking captures how preprocessing decisions affect model
          performance. Models trained after provenance tracking is enabled will
          show detailed preprocessing attribution here.
        </p>
      </div>

      {/* ── Preprocessing Metadata (if available) ── */}
      {hasProvenanceMetadata && model.metadata && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Preprocessing Metadata
            </h3>
            <div className="rounded-md border bg-muted/30 p-3 overflow-x-auto">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                {JSON.stringify(model.metadata, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
