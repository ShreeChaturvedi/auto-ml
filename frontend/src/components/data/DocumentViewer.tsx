/**
 * DocumentViewer - Displays PDF, Markdown, and text documents
 *
 * Features:
 * - PDF rendering via the browser's native PDF viewer
 * - Markdown rendering with Source/Preview toggle
 * - Plain text display with monospace font
 */

import { memo, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Code,
  Download,
  ExternalLink,
  Eye,
  FileCode,
  FileText,
  Loader2
} from 'lucide-react';
import { Markdown } from '@/components/ui/Markdown';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { downloadDocument } from '@/lib/api/documents';
import type { UploadedFile } from '@/types/file';
import { formatFileSize } from '@/types/file';

type ViewerStatus = 'loading' | 'ready' | 'error';
type MarkdownViewMode = 'source' | 'preview';

interface DocumentViewerProps {
  file: UploadedFile;
  controlsPortalTarget?: HTMLElement | null;
}

const PDF_VIEWER_HASH = '#toolbar=1&navpanes=0&view=FitH';

function openBlobUrl(blobUrl: string | null, isPdf = false) {
  if (!blobUrl) {
    return;
  }
  const targetUrl = isPdf ? `${blobUrl}${PDF_VIEWER_HASH}` : blobUrl;
  window.open(targetUrl, '_blank', 'noopener,noreferrer');
}

function downloadBlobUrl(blobUrl: string | null, fileName: string) {
  if (!blobUrl) {
    return;
  }
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = fileName;
  link.rel = 'noopener';
  link.click();
}

function PdfHeader({
  blobUrl,
  controlsPortalTarget,
  fileName,
  fileSize
}: {
  blobUrl: string | null;
  controlsPortalTarget?: HTMLElement | null;
  fileName: string;
  fileSize: number;
}) {
  const controls = (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openBlobUrl(blobUrl, true)}
              disabled={!blobUrl}
              className="h-7 w-7"
              aria-label="Open PDF in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Open in new tab</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => downloadBlobUrl(blobUrl, fileName)}
              disabled={!blobUrl}
              className="h-7 w-7"
              aria-label="Download PDF"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Download</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );

  return (
    <>
      {controlsPortalTarget && createPortal(controls, controlsPortalTarget)}
      <div className="flex h-12 shrink-0 items-center justify-between border-b bg-card px-4 py-1.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-md bg-muted p-1.5">
            <FileText className="h-4 w-4 text-red-500" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(fileSize)} · PDF
            </p>
          </div>
        </div>

        {!controlsPortalTarget && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openBlobUrl(blobUrl, true)}
              disabled={!blobUrl}
              className="h-8 gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadBlobUrl(blobUrl, fileName)}
              disabled={!blobUrl}
              className="h-8 gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

export const DocumentViewer = memo(function DocumentViewer({
  file,
  controlsPortalTarget
}: DocumentViewerProps) {
  const [status, setStatus] = useState<ViewerStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string>('');
  const [markdownViewMode, setMarkdownViewMode] = useState<MarkdownViewMode>('preview');

  const documentId = file.metadata?.documentId;
  const mimeType = file.metadata?.mimeType ?? '';
  const isPdf = file.type === 'pdf' || mimeType.includes('pdf');
  const isMarkdown = file.type === 'markdown';
  const isText = file.type === 'text';
  const isTextBased = isMarkdown || isText;
  const isBinary = !isPdf && !isTextBased;

  useEffect(() => {
    let isMounted = true;

    if (!documentId) {
      setStatus('error');
      setErrorMessage('Document metadata is missing. Re-upload the file to ingest it.');
      return undefined;
    }

    setStatus('loading');
    setErrorMessage(null);

    downloadDocument(documentId)
      .then(async (blob) => {
        if (!isMounted) {
          return;
        }

        const url = URL.createObjectURL(blob);
        setBlobUrl((previousUrl) => {
          if (previousUrl) {
            URL.revokeObjectURL(previousUrl);
          }
          return url;
        });

        if (isTextBased) {
          const text = await blob.text();
          if (!isMounted) {
            return;
          }
          setTextContent(text);
        }

        setStatus('ready');
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load document.');
      });

    return () => {
      isMounted = false;
    };
  }, [documentId, isTextBased]);

  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  const renderNonPdfControls = () => {
    if (isPdf) {
      return null;
    }

    const controlsContent = (
      <div className="flex items-center gap-1">
        {documentId && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => downloadBlobUrl(blobUrl, file.name)}
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
                onValueChange={(value) => value && setMarkdownViewMode(value as MarkdownViewMode)}
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
                onClick={() => downloadBlobUrl(blobUrl, file.name)}
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
  };

  return (
    <div className="flex h-full flex-col">
      {isPdf ? (
        <PdfHeader
          blobUrl={blobUrl}
          controlsPortalTarget={controlsPortalTarget}
          fileName={file.name}
          fileSize={file.size}
        />
      ) : (
        renderNonPdfControls()
      )}

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
              title={`PDF preview for ${file.name}`}
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
                onClick={() => downloadBlobUrl(blobUrl, file.name)}
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
    </div>
  );
});
