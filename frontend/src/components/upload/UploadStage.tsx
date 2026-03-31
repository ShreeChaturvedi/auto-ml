import { Plus } from 'lucide-react';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useDataStore } from '@/stores/dataStore';
import { useProjectStore } from '@/stores/projectStore';
import { useProjectPlans } from '@/hooks/useProjectPlans';

import { DataUploadPanel } from './DataUploadPanel';
import { DescriptionInput } from './DescriptionInput';
import { PlanViewerPane } from './PlanViewerPane';
import { isProjectFileReady } from './projectFileIngestion';

interface UploadStageProps {
  projectId: string;
  /** @deprecated No longer used — kept for caller compatibility. */
  onNext?: () => void;
}

export function UploadStage({ projectId }: UploadStageProps) {
  const files = useDataStore((state) => state.files);
  const project = useProjectStore((state) => state.projects.find((p) => p.id === projectId));
  const updateProject = useProjectStore((state) => state.updateProject);
  const projectFiles = useMemo(
    () => files.filter((file) => file.projectId === projectId),
    [files, projectId],
  );
  const hasFiles = projectFiles.length > 0;

  const { plans, selectedPlanId, handleCreateNewPlan } = useProjectPlans(projectId);

  const allFilesReady = hasFiles && projectFiles.every(isProjectFileReady);
  const currentPlan = selectedPlanId ? plans.find((p) => p.id === selectedPlanId) : plans[0];
  const hasPlans = plans.length > 0 && currentPlan;

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
          {!hasPlans && hasFiles && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCreateNewPlan}
              disabled={!allFilesReady}
              className="ml-2 shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              New Plan
            </Button>
          )}
        </div>

        {/* Upload panel body — fills the entire remaining area */}
        <div className="min-h-0 flex-1 overflow-auto">
          <DataUploadPanel projectId={projectId} />
        </div>

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
