import { useEffect } from 'react';
import { useExperimentsStore } from '@/stores/experimentsStore';
import type { EvaluationResult } from '@/types/experiments';
import { ChartCard } from '../shared/ChartCard';
import { SkeletonBlock } from '../shared/Skeleton';
import { ShapBarChart } from '../charts/ShapBarChart';
import { ShapBeeswarmChart } from '../charts/ShapBeeswarmChart';
import { ShapDependenceChart } from '../charts/ShapDependenceChart';
import { AlertTriangle } from 'lucide-react';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';

interface InterpretabilityTabProps {
  modelId: string;
  evaluation: EvaluationResult;
}

export function InterpretabilityTab({ modelId, evaluation }: InterpretabilityTabProps) {
  const fetchShap = useExperimentsStore((s) => s.fetchShap);
  const shapData = useExperimentsStore((s) => s.shapData[modelId]);
  const { colorClasses } = useProjectThemeColor();

  useEffect(() => {
    fetchShap(modelId);
  }, [modelId, fetchShap]);

  // Determine fallback feature importance data
  const fallbackImportance = evaluation.feature_importance.model_based
    ?? evaluation.feature_importance.permutation;

  // Loading state: fetchShap was called but data not yet in cache
  // We treat undefined as "still loading" and null-ish as "not available"
  const isLoading = shapData === undefined;

  // If SHAP data is loaded and present
  if (shapData) {
    return (
      <div className="space-y-8 p-5">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 px-1">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${colorClasses?.fill ?? 'bg-primary/60'} mr-2`} />
            SHAP Analysis
          </h3>
          <div className="space-y-6">
            <ChartCard label="Global Feature Importance (SHAP)" delay={0}>
              <ShapBarChart
                featureNames={shapData.feature_names}
                importances={shapData.mean_abs_values}
                topN={15}
              />
            </ChartCard>

            <ChartCard label="SHAP Beeswarm" delay={80}>
              <ShapBeeswarmChart shapResult={shapData} topN={15} height={500} />
            </ChartCard>

            <ChartCard label="SHAP Dependence" delay={160}>
              <ShapDependenceChart shapResult={shapData} />
            </ChartCard>
          </div>
        </section>
      </div>
    );
  }

  // Still loading
  if (isLoading) {
    return (
      <div className="space-y-8 p-5">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 px-1">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${colorClasses?.fill ?? 'bg-primary/60'} mr-2`} />
            SHAP Analysis
          </h3>
          <div className="space-y-6">
            <ChartCard label="Global Feature Importance (SHAP)" delay={0}>
              <SkeletonBlock height={400} />
            </ChartCard>

            <ChartCard label="SHAP Beeswarm" delay={80}>
              <SkeletonBlock height={500} />
            </ChartCard>

            <ChartCard label="SHAP Dependence" delay={160}>
              <SkeletonBlock height={400} />
            </ChartCard>
          </div>
        </section>
      </div>
    );
  }

  // SHAP unavailable — show fallback with model-based or permutation importance
  return (
    <div className="space-y-8 p-5">
      <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
        <p className="text-sm text-yellow-700 dark:text-yellow-300">
          SHAP computation timed out or model type is unsupported. Feature
          importance from model shown instead.
        </p>
      </div>

      {fallbackImportance && (
        <ChartCard label="Feature Importance" delay={0}>
          <ShapBarChart
            featureNames={fallbackImportance.features}
            importances={
              'importances' in fallbackImportance
                ? fallbackImportance.importances
                : fallbackImportance.importances_mean
            }
            topN={15}
            xLabel="Feature Importance"
          />
        </ChartCard>
      )}
    </div>
  );
}
