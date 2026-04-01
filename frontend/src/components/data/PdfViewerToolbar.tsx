import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import {
  PDF_ZOOM_PRESETS,
  resolvePdfPageInputCommit,
} from './pdfViewerState';

interface PdfViewerToolbarProps {
  currentPage: number;
  numPages: number;
  scale: number;
  fitWidth: boolean;
  url: string;
  fileName?: string;
  onPageChange: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleFitWidth: () => void;
}

export function PdfViewerToolbar({
  currentPage,
  numPages,
  scale,
  fitWidth,
  url,
  fileName,
  onPageChange,
  onZoomIn,
  onZoomOut,
  onToggleFitWidth,
}: PdfViewerToolbarProps) {
  const [pageInput, setPageInput] = useState(String(currentPage));

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const commitPage = () => {
    const { nextInput, nextPage } = resolvePdfPageInputCommit({
      pageInput,
      currentPage,
      numPages,
    });

    setPageInput(nextInput);
    if (nextPage !== null) {
      onPageChange(nextPage);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-3">
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={currentPage <= 1}
                onClick={() => onPageChange(currentPage - 1)}
                aria-label="Previous page"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Previous page</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={currentPage >= numPages}
                onClick={() => onPageChange(currentPage + 1)}
                aria-label="Next page"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Next page</TooltipContent>
          </Tooltip>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Input
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={commitPage}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commitPage();
                }
              }}
              className="h-7 w-12 border-input px-1 text-center text-xs"
              aria-label="Current page"
            />
            <span>of {numPages}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Separator orientation="vertical" className="mx-1.5 h-5" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onZoomOut}
                disabled={scale <= PDF_ZOOM_PRESETS[0]}
                aria-label="Zoom out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Zoom out</TooltipContent>
          </Tooltip>

          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onZoomIn}
                disabled={scale >= PDF_ZOOM_PRESETS[PDF_ZOOM_PRESETS.length - 1]}
                aria-label="Zoom in"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Zoom in</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1">
          <Separator orientation="vertical" className="mx-1.5 h-5" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={fitWidth ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={onToggleFitWidth}
                aria-label="Fit to width"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Fit to width</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = fileName ?? 'document.pdf';
                  link.rel = 'noopener';
                  link.click();
                }}
                aria-label="Download"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Download</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                aria-label="Open in new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Open in new tab</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
