import { ArrowRight, ClipboardList } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useDataStore } from '@/stores/dataStore';
import { useProjectStore } from '@/stores/projectStore';
import type { UploadedFile } from '@/types/file';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { DataUploadPanel } from './DataUploadPanel';

interface UploadStageProps {
  projectId: string;
  onNext: () => void;
}

export function UploadStage({ projectId, onNext }: UploadStageProps) {
  const files = useDataStore((state) => state.files);
  const project = useProjectStore((state) => state.projects.find((p) => p.id === projectId));
  const projectFiles = files.filter((file) => file.projectId === projectId);
  const hasFiles = projectFiles.length > 0;

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

  const metadata = (project?.metadata ?? {}) as Record<string, unknown>;
  const activePlanId = metadata.activePlanId as string | undefined;
  
  const plans = Array.isArray(metadata.plans) ? metadata.plans as { id: string, name: string, content: string }[] : [];
  
  // Legacy support
  const legacyPlanName = metadata.projectPlanName as string | undefined;
  const legacyPlanContent = metadata.projectPlan as string | undefined;
  
  let currentPlan = null;
  if (activePlanId) {
    currentPlan = plans.find((p) => p.id === activePlanId);
  }
  if (!currentPlan && plans.length === 0 && legacyPlanName && legacyPlanContent) {
    currentPlan = { id: `plan-${legacyPlanName}`, name: legacyPlanName, content: legacyPlanContent };
  } else if (!currentPlan && plans.length > 0) {
    currentPlan = plans[plans.length - 1]; // Fallback to most recent
  }
  const hasAnyPlan = plans.length > 0 || Boolean(legacyPlanName && legacyPlanContent);

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-4 p-4 sm:gap-6 sm:p-6" data-testid="upload-stage">
      <div className="min-h-0 flex-1 flex flex-col lg:flex-row gap-6">
        {/* Left side: Upload area */}
        <div className="flex-1 flex flex-col min-w-0">
          <DataUploadPanel projectId={projectId} />
        </div>

        {/* Right side: Active plan (if exists) */}
        {currentPlan && (
          <div className="flex-1 flex flex-col min-w-0 border-t lg:border-t-0 lg:border-l border-border pt-6 lg:pt-0 lg:pl-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{currentPlan.name}</h2>
                <p className="text-xs text-muted-foreground">
                  Active Project Plan
                </p>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto rounded-xl border border-border bg-card/50">
              <div className="p-6 prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {currentPlan.content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}
      </div>

      {!hasAnyPlan ? (
        <div className="flex items-center justify-end border-t border-border pt-4">
          {hasFiles && !allFilesReady ? (
            <p className="mr-3 text-xs text-muted-foreground">Finish processing uploads before continuing.</p>
          ) : null}
          <Button onClick={onNext} disabled={!allFilesReady} className="gap-2" data-testid="upload-next-button">
            Next
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
