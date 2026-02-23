import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useDataStore } from '@/stores/dataStore';

import { DataUploadPanel } from './DataUploadPanel';

interface UploadStageProps {
  projectId: string;
  onNext: () => void;
}

export function UploadStage({ projectId, onNext }: UploadStageProps) {
  const files = useDataStore((state) => state.files);
  const hasFiles = files.some((file) => file.projectId === projectId);

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 p-4 sm:gap-6 sm:p-6" data-testid="upload-stage">
      <div className="min-h-0 flex-1">
        <DataUploadPanel projectId={projectId} />
      </div>
      <div className="flex items-center justify-end border-t border-border pt-4">
        <Button onClick={onNext} disabled={!hasFiles} className="gap-2" data-testid="upload-next-button">
          Next
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
