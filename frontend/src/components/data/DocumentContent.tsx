/**
 * DocumentContent - Renders the main content area of the DocumentViewer
 * based on file type and loading status.
 */

import { AlertTriangle, Download, FileText, Loader2 } from 'lucide-react';
import { Markdown } from '@/components/ui/Markdown';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

type ViewerStatus = 'loading' | 'ready' | 'error';

interface DocumentContentProps {
  status: ViewerStatus;
  errorMessage: string | null;
  isPdf: boolean;
  isMarkdown: boolean;
  isText: boolean;
  isBinary: boolean;
  blobUrl: string | null;
  textContent: string;
  markdownViewMode: 'source' | 'preview';
  fileName: string;
  onDownload: (blobUrl: string | null, fileName: string) => void;
}

const PDF_VIEWER_HASH = '#toolbar=1&navpanes=0&view=FitH';

export function DocumentContent({
  status,
  errorMessage,
  isPdf,
  isMarkdown,
  isText,
  isBinary,
  blobUrl,
  textContent,
  markdownViewMode,
  fileName,
  onDownload,
}: DocumentContentProps) {
  return (
    <div className="flex-1 overflow-hidden">
      {status === 'loading' && (
        <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading document...
        </div>
      )}

      {status === 'error' && (
        <div className="flex h-full items-center justify-center p-6">
          <div className="max-w-md space-y-3 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive/80" />
            <p className="text-sm font-medium">Unable to load document</p>
            <p className="text-xs text-muted-foreground">{errorMessage}</p>
          </div>
        </div>
      )}

      {status === 'ready' && isPdf && blobUrl && (
        <div className="h-full bg-black">
          <iframe
            src={`${blobUrl}${PDF_VIEWER_HASH}`}
            title={`PDF preview for ${fileName}`}
            className="h-full w-full border-0 bg-black"
          />
        </div>
      )}

      {status === 'ready' && isMarkdown && (
        <ScrollArea className="h-full">
          {markdownViewMode === 'preview' ? (
            <Markdown className="markdown-content p-6">
              {textContent}
            </Markdown>
          ) : (
            <div className="whitespace-pre-wrap p-6 font-mono text-sm leading-relaxed text-foreground">
              {textContent}
            </div>
          )}
        </ScrollArea>
      )}

      {status === 'ready' && isText && (
        <ScrollArea className="h-full">
          <div className="whitespace-pre-wrap p-6 font-mono text-sm leading-relaxed text-foreground">
            {textContent}
          </div>
        </ScrollArea>
      )}

      {status === 'ready' && isBinary && (
        <div className="flex h-full items-center justify-center p-6">
          <div className="max-w-md space-y-3 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">Preview not available for this file type.</p>
            <p className="text-xs text-muted-foreground">
              Download the file to view it in your preferred application.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDownload(blobUrl, fileName)}
              disabled={!blobUrl}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Download file
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
