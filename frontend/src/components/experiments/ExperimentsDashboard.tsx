import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PanelLeft } from 'lucide-react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { useModelStore } from '@/stores/modelStore';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { Leaderboard } from './Leaderboard';
import { ModelDetailPanel } from './ModelDetailPanel';
import { OverviewDashboard } from './OverviewDashboard';
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

  const rightPanelRef = useRef<PanelImperativeHandle>(null);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);

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

  const handlePanelResize = useCallback((size: { asPercentage: number }) => {
    const collapsed = size.asPercentage < 1;
    setIsRightCollapsed(prev => prev === collapsed ? prev : collapsed);
  }, []);

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
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      <InsightBanner />
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={40} minSize={25}>
          <div className="flex h-full flex-col overflow-hidden">
            <Leaderboard />
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          defaultSize={60}
          minSize={40}
          collapsible
          collapsedSize={0}
          panelRef={rightPanelRef}
          onResize={handlePanelResize}
        >
          <div
            key={comparisonModelIds.length >= 2 ? 'compare' : selectedModelId ?? 'overview'}
            className="flex h-full flex-col overflow-hidden animate-in fade-in-0 duration-150"
          >
            {rightPanel()}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      {isRightCollapsed && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 bg-background/80 backdrop-blur-sm"
            onClick={() => {
              rightPanelRef.current?.expand();
              setTimeout(() => rightPanelRef.current?.resize("60%"), 0);
            }}
            aria-label="Expand detail panel"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
