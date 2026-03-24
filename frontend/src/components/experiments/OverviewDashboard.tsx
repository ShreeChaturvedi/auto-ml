import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useModelStore } from '@/stores/modelStore';
import { useExperimentsStore } from '@/stores/experimentsStore';
import type { CrossPhaseRecommendation } from '@/types/experiments';
import { cn } from '@/lib/utils';
import { generateRecommendations } from './utils';
import { InsightGrid } from './InsightGrid';
import { ModelComparisonChart } from './ModelComparisonChart';

const SEVERITY_STYLES: Record<string, string> = {
  high: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  low: 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400',
};

function RecommendationCard({ rec, onNavigate }: { rec: CrossPhaseRecommendation; onNavigate: (p: string) => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
      <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn('text-[10px] capitalize', SEVERITY_STYLES[rec.severity])}>
            {rec.severity}
          </Badge>
          <span className="text-sm font-medium text-foreground">{rec.title}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{rec.detail}</p>
      </div>
      <Button variant="ghost" size="sm" className="shrink-0 text-xs gap-1" onClick={() => onNavigate(rec.target_phase)}>
        Go to Phase
        <ArrowRight className="h-3 w-3" />
      </Button>
    </div>
  );
}

interface OverviewDashboardProps {
  onCardClick?: (sectionSlug: string) => void;
}

export function OverviewDashboard({ onCardClick }: OverviewDashboardProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const models = useModelStore((s) => s.models);
  const evaluations = useExperimentsStore((s) => s.evaluations);
  const fetchEvaluation = useExperimentsStore((s) => s.fetchEvaluation);

  // Pre-fetch evaluation for the best model (for Overfit Risk card)
  const bestModelId = useMemo(() => {
    if (models.length === 0) return null;
    let bestId: string | null = null;
    let bestMax = -Infinity;
    for (const m of models) {
      const vals = Object.values(m.metrics);
      if (vals.length === 0) continue;
      let mx = -Infinity;
      for (const v of vals) {
        if (Number.isFinite(v) && v > mx) mx = v;
      }
      if (mx > bestMax) { bestMax = mx; bestId = m.modelId; }
    }
    return bestId;
  }, [models]);

  useEffect(() => {
    if (bestModelId) void fetchEvaluation(bestModelId);
  }, [bestModelId, fetchEvaluation]);

  const recommendations = useMemo(() => generateRecommendations(models, evaluations), [models, evaluations]);

  const handleNavigateToPhase = (targetPhase: string) => {
    if (projectId) navigate(`/project/${projectId}/${targetPhase}`);
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-5">
        <InsightGrid
          models={models}
          evaluations={evaluations}
          onCardClick={onCardClick}
        />

        <ModelComparisonChart models={models} />

        {recommendations.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground px-1">Cross-Phase Recommendations</h3>
            {recommendations.map((rec, i) => (
              <RecommendationCard key={`${rec.title}-${i}`} rec={rec} onNavigate={handleNavigateToPhase} />
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
