import { ArrowRight, Plus } from 'lucide-react';

import { fetchNlSuggestions } from '@/lib/api/query';
import { Button } from '@/components/ui/button';
import { useDataStore } from '@/stores/dataStore';
import { useProjectStore } from '@/stores/projectStore';
import { useProjectPlans } from '@/hooks/useProjectPlans';
import type { UploadedFile } from '@/types/file';

import { DataUploadPanel } from './DataUploadPanel';
import { DescriptionInput } from './DescriptionInput';
import { PlanViewerPane } from './PlanViewerPane';

interface UploadStageProps {
  projectId: string;
  onNext: () => void;
}

export function UploadStage({ projectId, onNext }: UploadStageProps) {
  const files = useDataStore((state) => state.files);
  const project = useProjectStore((state) => state.projects.find((p) => p.id === projectId));
  const updateProject = useProjectStore((state) => state.updateProject);
  const projectFiles = files.filter((file) => file.projectId === projectId);
  const hasFiles = projectFiles.length > 0;

  const { plans, selectedPlanId, handleCreateNewPlan } = useProjectPlans(projectId);

  const isFileReady = (file: UploadedFile): boolean => {
    if (file.type === 'csv' || file.type === 'json' || file.type === 'excel') {
      return Boolean(file.metadata?.datasetId);
    }

    if (file.type === 'pdf' || file.type === 'markdown' || file.type === 'word' || file.type === 'text') {
      return Boolean(file.metadata?.documentId);
    }

    return true;
  };

  const allFilesReady = hasFiles && projectFiles.every(isFileReady);
  const currentPlan = selectedPlanId ? plans.find((p) => p.id === selectedPlanId) : plans[0];
  const hasPlans = plans.length > 0 && currentPlan;

  const handleNext = () => {
    void fetchNlSuggestions(projectId, 8).catch((error) => {
      console.warn('[UploadStage] Failed to prewarm NL suggestions on upload completion:', error);
    });
    onNext();
  };

  const handleDescriptionChange = (description: string) => {
    void updateProject(projectId, { description });
  };

  return (
    <div className="flex h-full overflow-hidden" data-testid="upload-stage">
      {/* Left column */}
      <div className={`flex flex-col min-w-0 ${hasPlans ? 'flex-1' : 'flex-1 w-full'}`}>
        {/* Left ribbon */}
        <div className="flex h-14 items-center border-b px-3 shrink-0">
          <div className="min-w-0 flex-1">
            <DescriptionInput
              value={project?.description ?? ''}
              onChange={handleDescriptionChange}
            />
          </div>
          {!hasPlans && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCreateNewPlan}
              className="ml-2 shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              New Plan
            </Button>
          )}
        </div>

        {/* Upload panel body */}
        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          <DataUploadPanel projectId={projectId} />
        </div>

        {/* Next button row (only when no plans and files ready) */}
        {!hasPlans && (
          <div className="flex items-center justify-end border-t border-border px-4 py-3 sm:px-6">
            {hasFiles && !allFilesReady ? (
              <p className="mr-3 text-xs text-muted-foreground">Finish processing uploads before continuing.</p>
            ) : null}
            <Button onClick={handleNext} disabled={!allFilesReady} className="gap-2" data-testid="upload-next-button">
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Right column: Plan viewer (only when plans exist) */}
      {hasPlans && (
        <div className="flex flex-col min-w-0 w-full lg:w-[55%] lg:min-w-[360px] border-t lg:border-t-0 lg:border-l border-border">
          <PlanViewerPane plan={currentPlan} />
        </div>
      )}
    </div>
  );
}
