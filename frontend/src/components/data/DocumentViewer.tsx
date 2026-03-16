/**
 * DocumentViewer - Displays PDF, Markdown, and text documents
 *
 * Features:
 * - PDF rendering via react-pdf with custom toolbar
 * - Markdown rendering with Source/Preview toggle
 * - Plain text display with monospace font
 */

import { memo, useEffect, useState } from 'react';

import { downloadDocument } from '@/lib/api/documents';
import type { UploadedFile } from '@/types/file';
import { DocumentSearch, type MarkdownViewMode } from './DocumentSearch';
import { DocumentContent } from './DocumentContent';

type ViewerStatus = 'loading' | 'ready' | 'error';

interface DocumentViewerProps {
  file: UploadedFile;
  controlsPortalTarget?: HTMLElement | null;
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
      {!isPdf && (
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
