import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { useModelStore } from '@/stores/modelStore';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { Leaderboard } from './Leaderboard';
import { ModelDetailPanel } from './ModelDetailPanel';
import { OverviewDashboard } from './OverviewDashboard';
import { ComparisonView } from './ComparisonView';
import { InsightBanner } from './InsightBanner';
import { formatMetric } from './utils';
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
        const primaryKey =
          newest.taskType === 'classification' ? 'accuracy'
          : newest.taskType === 'regression' ? 'r2'
          : 'silhouette';
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

  // Determine right panel content
  const rightPanel = () => {
    if (comparisonModelIds.length >= 2) {
      return <ComparisonView />;
    }
    if (selectedModelId) {
      return <ModelDetailPanel modelId={selectedModelId} />;
    }
    // Overview dashboard (no selection)
    return <OverviewDashboard />;
  };

  return (
    <div className="flex flex-col h-full">
      <InsightBanner />
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel defaultSize={40} minSize={30}>
          <Leaderboard />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={60} minSize={30}>
          {rightPanel()}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
