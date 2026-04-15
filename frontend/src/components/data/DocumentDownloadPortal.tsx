import { createPortal } from 'react-dom';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DocumentDownloadPortalProps {
  blobUrl: string | null;
  fileName: string;
  portalTarget: HTMLElement;
  onDownload: (blobUrl: string | null, fileName: string) => void;
}

export function DocumentDownloadPortal({ blobUrl, fileName, portalTarget, onDownload }: DocumentDownloadPortalProps) {
  return createPortal(
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDownload(blobUrl, fileName)}
            disabled={!blobUrl}
            className="h-7 w-7"
            aria-label="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Download</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
    portalTarget
  );
}
