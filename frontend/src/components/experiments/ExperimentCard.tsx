import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { getModelArtifactUrl } from '@/lib/api/models';
import type { ModelRecord } from '@/types/model';
import { cn } from '@/lib/utils';

const formatMetric = (value: number) => {
  if (!Number.isFinite(value)) return '—';
  return value >= 1 ? value.toFixed(2) : value.toFixed(4);
};

export interface ExperimentCardProps {
  model: ModelRecord;
  datasetName: string | undefined;
}

export function ExperimentCard({ model, datasetName }: ExperimentCardProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{model.name}</p>
          <p className="text-xs text-muted-foreground">
            {model.algorithm} · {model.taskType}
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            model.status === 'completed'
              ? 'border-emerald-500/40 text-emerald-600'
              : 'border-destructive/40 text-destructive'
          )}
        >
          {model.status}
        </Badge>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {Object.entries(model.metrics).length === 0 ? (
          <span className="text-xs text-muted-foreground">No metrics</span>
        ) : (
          Object.entries(model.metrics).map(([key, value]) => (
            <Badge key={key} variant="secondary" className="text-[10px]">
              {key}: {formatMetric(value)}
            </Badge>
          ))
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>Dataset: {datasetName ?? model.datasetId}</span>
        {model.trainingMs && <span>• {model.trainingMs}ms</span>}
        {model.sampleCount && <span>• {model.sampleCount} rows</span>}
      </div>

      {model.error && (
        <p className="mt-2 text-xs text-destructive">{model.error}</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        {model.artifact?.path && (
          <Button variant="ghost" size="icon-sm" asChild>
            <a href={getModelArtifactUrl(model.modelId)} title="Download model">
              <Download className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
        {model.featureColumns && (
          <span className="text-[11px] text-muted-foreground">
            {model.featureColumns.length} features
          </span>
        )}
      </div>
    </div>
  );
}
