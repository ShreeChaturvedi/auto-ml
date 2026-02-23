/**
 * DocumentViewer - Displays PDF, Markdown, and text documents
 *
 * Features:
 * - PDF rendering via react-pdf-viewer with custom toolbar
 * - Markdown rendering with Source/Preview toggle
 * - Plain text display with monospace font
 */

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Code,
  Download,
  Eye,
  FileCode,
  FileText,
  Loader2,
  Minus,
  Plus,
  RotateCw,
} from 'lucide-react';
import { Worker, Viewer, SpecialZoomLevel, RotateDirection } from '@react-pdf-viewer/core';
import { toolbarPlugin } from '@react-pdf-viewer/toolbar';
import type { ToolbarSlot } from '@react-pdf-viewer/toolbar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Import required styles
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/toolbar/lib/styles/index.css';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { downloadDocument } from '@/lib/api/documents';
import type { UploadedFile } from '@/types/file';
import { formatFileSize } from '@/types/file';

type ViewerStatus = 'loading' | 'ready' | 'error';
type MarkdownViewMode = 'source' | 'preview';

interface DocumentViewerProps {
  file: UploadedFile;
}

// PDF.js worker URL - must match installed pdfjs-dist version
const PDFJS_WORKER_URL = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;

// Custom toolbar component for PDF
function PdfToolbar({
  slots,
  fileName,
  fileSize,
}: {
  slots: ToolbarSlot;
  fileName: string;
  fileSize: number;
}) {
  const {
    CurrentPageLabel,
    Download: DownloadSlot,
    GoToNextPage,
    GoToPreviousPage,
    NumberOfPages,
    Rotate,
    CurrentScale,
    ZoomIn,
    ZoomOut,
  } = slots;

  return (
    <div className="flex items-center justify-between w-full px-4 py-2 border-b bg-card">
      {/* Left section: File info */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="rounded-md bg-muted p-1.5">
          <FileText className="h-4 w-4 text-red-500" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(fileSize)} · PDF
          </p>
        </div>
      </div>

      {/* Center section: Page navigation */}
      <div className="flex items-center gap-1">
        <GoToPreviousPage>
          {(props) => (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={props.isDisabled}
              onClick={props.onClick}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </GoToPreviousPage>

        {/* Page display - simple text, no input */}
        <div className="flex items-center gap-1.5 text-sm px-2">
          <CurrentPageLabel>
            {(props) => (
              <span className="text-foreground tabular-nums">{props.currentPage + 1}</span>
            )}
          </CurrentPageLabel>
          <span className="text-muted-foreground">/</span>
          <NumberOfPages>
            {(props) => (
              <span className="text-muted-foreground tabular-nums">{props.numberOfPages}</span>
            )}
          </NumberOfPages>
        </div>

        <GoToNextPage>
          {(props) => (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={props.isDisabled}
              onClick={props.onClick}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </GoToNextPage>

        <Separator orientation="vertical" className="mx-2 h-6" />

        {/* Zoom controls */}
        <ZoomOut>
          {(props) => (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={props.onClick}
            >
              <Minus className="h-4 w-4" />
            </Button>
          )}
        </ZoomOut>

        <CurrentScale>
          {(props) => (
            <span className="text-sm text-muted-foreground min-w-[52px] text-center tabular-nums">
              {Math.round(props.scale * 100)}%
            </span>
          )}
        </CurrentScale>

        <ZoomIn>
          {(props) => (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={props.onClick}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </ZoomIn>
      </div>

      {/* Right section: Actions - matches DataTable Export button */}
      <div className="flex items-center gap-2">
        <Rotate direction={RotateDirection.Forward}>
          {(props) => (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={props.onClick}
            >
              <RotateCw className="h-4 w-4" />
            </Button>
          )}
        </Rotate>

        <DownloadSlot>
          {(props) => (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={props.onClick}
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          )}
        </DownloadSlot>
      </div>
    </div>
  );
}

export function DocumentViewer({ file }: DocumentViewerProps) {
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

  // Initialize toolbar plugin
  const toolbarPluginInstance = toolbarPlugin();
  const { Toolbar } = toolbarPluginInstance;

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
        if (!isMounted) return;
        const url = URL.createObjectURL(blob);
        setBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });

        if (isTextBased) {
          const text = await blob.text();
          if (!isMounted) return;
          setTextContent(text);
        }

        setStatus('ready');
      })
      .catch((error) => {
        if (!isMounted) return;
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load document.');
      });

    return () => {
      isMounted = false;
    };
  }, [documentId, isPdf, isTextBased]);

  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  return (
    <div className="flex h-full flex-col">
      {/* Header for non-PDF files */}
      {!isPdf && (
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-md bg-muted p-1.5">
              {isMarkdown ? (
                <FileCode className="h-4 w-4 text-purple-500" />
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(file.size)} · {file.type.toUpperCase()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Source/Preview toggle for Markdown files */}
            {isMarkdown && status === 'ready' && (
              <ToggleGroup
                type="single"
                value={markdownViewMode}
                onValueChange={(value) => value && setMarkdownViewMode(value as MarkdownViewMode)}
                className="bg-muted/50 p-0.5 rounded-md h-8"
              >
                <ToggleGroupItem
                  value="preview"
                  aria-label="Preview mode"
                  className="h-7 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm px-2.5 gap-1.5"
                >
                  <Eye className="h-3 w-3" />
                  Preview
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="source"
                  aria-label="Source mode"
                  className="h-7 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm px-2.5 gap-1.5 font-mono"
                >
                  <Code className="h-3 w-3" />
                  Source
                </ToggleGroupItem>
              </ToggleGroup>
            )}

            {documentId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => blobUrl && window.open(blobUrl, '_blank')}
                disabled={!blobUrl}
                className="h-8"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            )}
          </div>
        </div>
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
            <div className="max-w-md text-center space-y-3">
              <AlertTriangle className="mx-auto h-10 w-10 text-destructive/80" />
              <p className="text-sm font-medium">Unable to load document</p>
              <p className="text-xs text-muted-foreground">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* PDF Viewer with custom toolbar */}
        {status === 'ready' && isPdf && blobUrl && (
          <Worker workerUrl={PDFJS_WORKER_URL}>
            <div className="h-full flex flex-col pdf-viewer-container">
              <Toolbar>
                {(slots: ToolbarSlot) => (
                  <PdfToolbar slots={slots} fileName={file.name} fileSize={file.size} />
                )}
              </Toolbar>
              <div className="flex-1 overflow-hidden">
                <Viewer
                  fileUrl={blobUrl}
                  plugins={[toolbarPluginInstance]}
                  defaultScale={SpecialZoomLevel.PageWidth}
                  theme={{
                    theme: 'dark',
                  }}
                />
              </div>
            </div>
          </Worker>
        )}

        {/* Markdown Viewer with Source/Preview toggle */}
        {status === 'ready' && isMarkdown && (
          <ScrollArea className="h-full">
            {markdownViewMode === 'preview' ? (
              <div className="p-6 markdown-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {textContent}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="p-6 text-sm leading-relaxed text-foreground whitespace-pre-wrap font-mono">
                {textContent}
              </div>
            )}
          </ScrollArea>
        )}

        {/* Plain text viewer */}
        {status === 'ready' && isText && (
          <ScrollArea className="h-full">
            <div className="p-6 text-sm leading-relaxed text-foreground whitespace-pre-wrap font-mono">
              {textContent}
            </div>
          </ScrollArea>
        )}

        {status === 'ready' && isBinary && (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-md text-center space-y-3">
              <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">Preview not available for this file type.</p>
              <p className="text-xs text-muted-foreground">
                Download the file to view it in your preferred application.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => blobUrl && window.open(blobUrl, '_blank')}
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
}
