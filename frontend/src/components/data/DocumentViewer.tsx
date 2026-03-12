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
  Download,
  ExternalLink,
  FileText
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { downloadDocument } from '@/lib/api/documents';
import type { UploadedFile } from '@/types/file';
import { formatFileSize } from '@/lib/fileUtils';
import { DocumentSearch, type MarkdownViewMode } from './DocumentSearch';
import { DocumentContent } from './DocumentContent';

type ViewerStatus = 'loading' | 'ready' | 'error';

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
        <DocumentSearch
          file={file}
          blobUrl={blobUrl}
          documentId={documentId}
          isMarkdown={isMarkdown}
          status={status}
          markdownViewMode={markdownViewMode}
          onMarkdownViewModeChange={setMarkdownViewMode}
          controlsPortalTarget={controlsPortalTarget}
          onDownload={downloadBlobUrl}
        />
      )}

      <DocumentContent
        status={status}
        errorMessage={errorMessage}
        isPdf={isPdf}
        isMarkdown={isMarkdown}
        isText={isText}
        isBinary={isBinary}
        blobUrl={blobUrl}
        textContent={textContent}
        markdownViewMode={markdownViewMode}
        fileName={file.name}
        onDownload={downloadBlobUrl}
      />
    </div>
  );
});
