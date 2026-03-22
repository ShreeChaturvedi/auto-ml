import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useExperimentsStore } from '@/stores/experimentsStore';
import type { EvaluationResult } from '@/types/experiments';
import { ShapBarChart } from '../charts/ShapBarChart';
import { ShapBeeswarmChart } from '../charts/ShapBeeswarmChart';
import { ShapDependenceChart } from '../charts/ShapDependenceChart';
import { AlertTriangle } from 'lucide-react';

interface InterpretabilityTabProps {
  modelId: string;
  evaluation: EvaluationResult;
}

function ChartSkeleton({ height = 400 }: { height?: number }) {
  return (
    <div
      className="timeline-skeleton rounded-md"
      style={{ height }}
    />
  );
}

export function InterpretabilityTab({ modelId, evaluation }: InterpretabilityTabProps) {
  const fetchShap = useExperimentsStore((s) => s.fetchShap);
  const shapData = useExperimentsStore((s) => s.shapData[modelId]);

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
      <div className="grid grid-cols-1 gap-5 p-5">
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold tracking-tight">Global Feature Importance (SHAP)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ShapBarChart
              featureNames={shapData.feature_names}
              importances={shapData.mean_abs_values}
              topN={15}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold tracking-tight">SHAP Beeswarm</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ShapBeeswarmChart shapResult={shapData} topN={15} height={500} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold tracking-tight">SHAP Dependence</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ShapDependenceChart shapResult={shapData} />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Still loading
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-5 p-5">
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold tracking-tight">Global Feature Importance (SHAP)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ChartSkeleton height={400} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold tracking-tight">SHAP Beeswarm</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ChartSkeleton height={500} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold tracking-tight">SHAP Dependence</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ChartSkeleton height={400} />
          </CardContent>
        </Card>
      </div>
    );
  }

  // SHAP unavailable — show fallback with model-based or permutation importance
  return (
    <div className="grid grid-cols-1 gap-5 p-5">
      <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
        <p className="text-sm text-yellow-700 dark:text-yellow-300">
          SHAP computation timed out or model type is unsupported. Feature
          importance from model shown instead.
        </p>
      </div>

      {fallbackImportance && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold tracking-tight">Feature Importance</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
