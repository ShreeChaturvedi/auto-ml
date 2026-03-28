import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FlaskConical, Cpu, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModelParam {
  key: string;
  label: string;
  type: string;
  default: unknown;
  min?: number;
  max?: number;
}

interface TemplateInfo {
  name: string;
  taskType: string;
  library: string;
  importPath: string;
  modelClass: string;
  parameters: ModelParam[];
  metrics: string[];
}

interface ModelRecommendationCardProps {
  id: string;
  template: TemplateInfo;
  parameters: Record<string, unknown>;
  rationale: string;
}

const TASK_COLORS: Record<string, string> = {
  classification: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  regression: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  clustering: 'bg-violet-500/10 text-violet-600 border-violet-500/30',
};

export function ModelRecommendationCard({
  template,
  parameters,
  rationale,
}: ModelRecommendationCardProps) {
  const taskColor = TASK_COLORS[template.taskType] ?? 'bg-muted text-muted-foreground';
  const paramEntries = Object.entries(parameters).filter(
    ([, v]) => v !== undefined && v !== null
  );

  return (
    <Card className="border border-primary/20 bg-primary/[0.02] dark:shadow-none">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FlaskConical className="h-4 w-4 shrink-0 text-primary" />
            <CardTitle className="text-sm truncate">{template.name}</CardTitle>
          </div>
          <Badge variant="outline" className={cn('shrink-0 text-[10px] capitalize', taskColor)}>
            {template.taskType}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <p className="text-muted-foreground leading-relaxed">{rationale}</p>

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Cpu className="h-3 w-3" />
          <code className="font-mono">{template.importPath}.{template.modelClass}</code>
        </div>

        {paramEntries.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Settings2 className="h-3 w-3" />
              Parameters
            </div>
            <div className="flex flex-wrap gap-1.5">
              {paramEntries.map(([key, value]) => (
                <Badge key={key} variant="secondary" className="text-[10px] font-mono gap-1">
                  {key}={String(value)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {template.metrics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {template.metrics.map((metric) => (
              <Badge key={metric} variant="outline" className="text-[10px]">
                {metric}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
