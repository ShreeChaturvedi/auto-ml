import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useModelStore } from '@/stores/modelStore';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { Leaderboard } from './Leaderboard';
import { ModelDetailPanel } from './ModelDetailPanel';
import { ComparisonView } from './ComparisonView';
import { InsightBanner } from './InsightBanner';
import { formatMetric, PRIMARY_METRIC } from './utils';
import './experiments.css';

export function ExperimentsDashboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const refreshModels = useModelStore((s) => s.refreshModels);
  const models = useModelStore((s) => s.models);
  const selectedModelId = useExperimentsStore((s) => s.selectedModelId);
  const comparisonModelIds = useExperimentsStore((s) => s.comparisonModelIds);
  const selectModel = useExperimentsStore((s) => s.selectModel);
  const fetchInsightBanner = useExperimentsStore((s) => s.fetchInsightBanner);

  // Track previous model count for post-training toast
  const prevModelCount = useRef(models.length);

  // Fetch models on mount
  useEffect(() => {
    if (projectId) {
      void refreshModels(projectId);
    }
  }, [projectId, refreshModels]);

  // Post-training toast: fires when a new model appears in the list
  useEffect(() => {
    if (models.length > prevModelCount.current && prevModelCount.current > 0) {
      const newest = models[models.length - 1];
      if (newest) {
        const primaryKey = PRIMARY_METRIC[newest.taskType];
        const metricVal = newest.metrics[primaryKey];
        const formatted = formatMetric(metricVal);
        const metricStr =
          formatted !== '\u2014'
            ? ` \u2014 ${primaryKey} ${formatted}`
            : '';
        toast.success(`Model ${newest.name} trained${metricStr}`, {
          action: {
            label: 'View',
            onClick: () => selectModel(newest.modelId),
          },
        });
      }
    }
    prevModelCount.current = models.length;
  }, [models.length, models, selectModel]);

  // Trigger insight banner when models change
  useEffect(() => {
    if (models.length > 0 && projectId) {
      void fetchInsightBanner(projectId, models);
    }
  }, [models.length, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      <InsightBanner />
      <div className="flex-1 min-h-0 flex flex-col">
        {comparisonModelIds.length >= 2
          ? <ComparisonView />
          : <Leaderboard />
        }
      </div>
      <ModelDetailPanel
        modelId={selectedModelId}
        open={selectedModelId !== null}
        onClose={() => selectModel(null)}
      />
    </div>
  );
}
