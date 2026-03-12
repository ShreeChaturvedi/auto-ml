/**
 * DocumentSearch - Header bar with controls for non-PDF documents
 * (markdown, text, binary). Renders download button, view-mode toggle,
 * and optionally portals controls into a parent-provided target.
 */

import { createPortal } from 'react-dom';
import { Code, Download, Eye, FileCode, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatFileSize } from '@/lib/fileUtils';
import type { UploadedFile } from '@/types/file';

type MarkdownViewMode = 'source' | 'preview';

interface DocumentSearchProps {
  file: UploadedFile;
  blobUrl: string | null;
  documentId: string | undefined;
  isMarkdown: boolean;
  status: 'loading' | 'ready' | 'error';
  markdownViewMode: MarkdownViewMode;
  onMarkdownViewModeChange: (mode: MarkdownViewMode) => void;
  controlsPortalTarget?: HTMLElement | null;
  onDownload: (blobUrl: string | null, fileName: string) => void;
}

export function DocumentSearch({
  file,
  blobUrl,
  documentId,
  isMarkdown,
  status,
  markdownViewMode,
  onMarkdownViewModeChange,
  controlsPortalTarget,
  onDownload,
}: DocumentSearchProps) {
  const controlsContent = (
    <div className="flex items-center gap-1">
      {documentId && (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDownload(blobUrl, file.name)}
                disabled={!blobUrl}
                className="h-7 w-7"
                aria-label="Download"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Download</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );

  return (
    <>
      {controlsPortalTarget && createPortal(controlsContent, controlsPortalTarget)}
      <div className="flex h-12 shrink-0 items-center justify-between border-b bg-card px-4 py-1.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-md bg-muted p-1.5">
            {isMarkdown ? (
              <FileCode className="h-4 w-4 text-purple-500" />
            ) : (
              <FileText className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(file.size)} · {file.type.toUpperCase()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isMarkdown && status === 'ready' && (
            <ToggleGroup
              type="single"
              value={markdownViewMode}
              onValueChange={(value) => value && onMarkdownViewModeChange(value as MarkdownViewMode)}
              className="h-8 rounded-md bg-muted/50 p-0.5"
            >
              <ToggleGroupItem
                value="preview"
                aria-label="Preview mode"
                className="h-7 gap-1.5 px-2.5 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm"
              >
                <Eye className="h-3 w-3" />
                Preview
              </ToggleGroupItem>
              <ToggleGroupItem
                value="source"
                aria-label="Source mode"
                className="h-7 gap-1.5 px-2.5 font-mono text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm"
              >
                <Code className="h-3 w-3" />
                Source
              </ToggleGroupItem>
            </ToggleGroup>
          )}

          {!controlsPortalTarget && documentId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDownload(blobUrl, file.name)}
              disabled={!blobUrl}
              className="h-8"
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Download
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

export type { MarkdownViewMode };
