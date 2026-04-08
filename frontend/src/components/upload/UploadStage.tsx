import { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronDown, ClipboardList, MessageSquare } from 'lucide-react';

import { useProjectStore } from '@/stores/projectStore';
import { useProjectPlans } from '@/hooks/useProjectPlans';
import { PlanSelector } from '@/components/layout/PlanSelector';
import { extractTocHeadings } from '@/lib/markdown/tocUtils';
import { scrollToRadixElement } from '@/lib/scrollUtils';

import { DataUploadPanel } from './DataUploadPanel';
import { DescriptionInput } from './DescriptionInput';
import { PlanViewerPane } from './PlanViewerPane';
import { PlanViewerToolbar } from './PlanViewerToolbar';
import { PlanChatPane } from './PlanChatPane';

export interface UploadStageProps {
  projectId: string;
  activePlanChatId: string | null;
  onPlanApproved: (plan: string, planName: string) => void;
  onFirstUpload: () => void;
}

export function UploadStage({ projectId, activePlanChatId, onPlanApproved, onFirstUpload }: UploadStageProps) {
  const project = useProjectStore((state) => state.projects.find((p) => p.id === projectId));
  const updateProject = useProjectStore((state) => state.updateProject);

  const { plans, selectedPlanId } = useProjectPlans(projectId);
  const currentPlan = selectedPlanId ? plans.find((p) => p.id === selectedPlanId) : plans[0];
  const hasPlans = plans.length > 0 && currentPlan;

  const rightColumnMode = activePlanChatId ? 'chat' : hasPlans ? 'plan' : 'none';

  // Plan viewer toolbar state (lives here so the toolbar is in the shared header)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const headings = useMemo(
    () => (currentPlan ? extractTocHeadings(currentPlan.content) : []),
    [currentPlan?.content]
  );
  const scrollToHeading = useCallback((slug: string) => {
    scrollToRadixElement(scrollAreaRef.current, slug);
  }, []);

  const handleDescriptionChange = (description: string) => {
    void updateProject(projectId, { description });
  };

  return (
    <div className="flex h-full overflow-hidden" data-testid="upload-stage">
      {/* Left column */}
      <div className={`flex flex-col min-w-0 ${rightColumnMode !== 'none' ? 'flex-1' : 'flex-1 w-full'}`}>
        <div className="flex h-14 items-center border-b px-3 shrink-0">
          <div className="min-w-0 flex-1">
            <DescriptionInput
              value={project?.description ?? ''}
              onChange={handleDescriptionChange}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
          <DataUploadPanel projectId={projectId} onFirstUpload={onFirstUpload} />
        </div>
      </div>

      {/* Right column */}
      {rightColumnMode !== 'none' && (
        <div className="flex flex-col min-w-0 w-full lg:w-[55%] lg:min-w-[360px] border-t lg:border-t-0 lg:border-l border-border">
          {/* Shared right ribbon — never remounts when switching chat↔plan */}
          <div className="flex h-14 items-center justify-between border-b px-3 shrink-0">
            <PlanSelector
              className="h-7 gap-1.5 border-0 bg-transparent shadow-none hover:bg-accent text-sm px-2 shrink-0 group/plan"
              nameMaxWidthClass="max-w-[240px]"
              iconSlot={
                <span className="relative h-4 w-4 shrink-0">
                  {activePlanChatId
                    ? <MessageSquare className="h-4 w-4 text-muted-foreground absolute inset-0 transition-opacity group-hover/plan:opacity-0" />
                    : <ClipboardList className="h-4 w-4 text-muted-foreground absolute inset-0 transition-opacity group-hover/plan:opacity-0" />
                  }
                  <ChevronDown className="h-4 w-4 text-muted-foreground absolute inset-0 transition-opacity opacity-0 group-hover/plan:opacity-100" />
                </span>
              }
            />
            {rightColumnMode === 'plan' && currentPlan && (
              <PlanViewerToolbar
                planContent={currentPlan.content}
                planName={currentPlan.name}
                searchQuery={searchQuery}
                searchExpanded={searchExpanded}
                onSearchQueryChange={setSearchQuery}
                onSearchExpandedChange={setSearchExpanded}
                headings={headings}
                scrollToHeading={scrollToHeading}
              />
            )}
          </div>

          {/* Content */}
          {rightColumnMode === 'chat' && (
            <PlanChatPane
              projectId={projectId}
              planChatId={activePlanChatId}
              onPlanApproved={onPlanApproved}
            />
          )}
          {rightColumnMode === 'plan' && currentPlan && (
            <PlanViewerPane
              ref={scrollAreaRef}
              plan={currentPlan}
              searchQuery={searchQuery}
            />
          )}
        </div>
      )}
    </div>
  );
}
