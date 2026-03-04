/**
 * DocumentViewer - Displays PDF, Markdown, and text documents
 *
 * Features:
 * - PDF rendering via react-pdf-viewer with custom toolbar
 * - Markdown rendering with Source/Preview toggle
 * - Plain text display with monospace font
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  Search,
  X,
} from 'lucide-react';
import { Worker, Viewer, SpecialZoomLevel, RotateDirection } from '@react-pdf-viewer/core';
import { toolbarPlugin } from '@react-pdf-viewer/toolbar';
import type { ToolbarSlot } from '@react-pdf-viewer/toolbar';
import { searchPlugin } from '@react-pdf-viewer/search';
import type { SearchPlugin } from '@react-pdf-viewer/search';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Import required styles
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/toolbar/lib/styles/index.css';
import '@react-pdf-viewer/search/lib/styles/index.css';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { downloadDocument } from '@/lib/api/documents';
import { cn } from '@/lib/utils';
import type { UploadedFile } from '@/types/file';
import { formatFileSize } from '@/types/file';

type ViewerStatus = 'loading' | 'ready' | 'error';
type MarkdownViewMode = 'source' | 'preview';

interface DocumentViewerProps {
  file: UploadedFile;
  controlsPortalTarget?: HTMLElement | null;
}

// PDF.js worker URL - must match installed pdfjs-dist version
const PDFJS_WORKER_URL = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;

// Custom toolbar component for PDF
function PdfToolbar({
  slots,
  fileName,
  fileSize,
  controlsPortalTarget,
  PdfSearch
}: {
  slots: ToolbarSlot;
  fileName: string;
  fileSize: number;
  controlsPortalTarget?: HTMLElement | null;
  PdfSearch: SearchPlugin['Search'];
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
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchExpanded) {
      searchInputRef.current?.focus();
    }
  }, [searchExpanded]);

  const controlsContent = (
    <TooltipProvider delayDuration={300}>
      <PdfSearch>
        {(searchProps) => {
          return (
            <div className="relative flex h-10 flex-1 min-w-0 items-center">
              <div
                className={cn(
                  'flex items-center gap-1 min-w-0 transition-all duration-200 ease-out',
                  searchExpanded ? 'opacity-0 blur-[1px] pointer-events-none' : 'opacity-100'
                )}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSearchExpanded(true)}
                      className="h-7 w-7"
                      aria-label="Search PDF"
                    >
                      <Search className={cn('h-3.5 w-3.5', searchProps.keyword && 'text-primary')} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Search</TooltipContent>
                </Tooltip>

                <DownloadSlot>
                  {(props) => (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={props.onClick}
                          aria-label="Export"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Export</TooltipContent>
                    </Tooltip>
                  )}
                </DownloadSlot>
              </div>

              <div
                className={cn(
                  'absolute inset-0 flex items-center transition-all duration-200 ease-out',
                  searchExpanded
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-1 pointer-events-none'
                )}
              >
                <div
                  className="flex h-10 w-full items-center gap-2 rounded-md bg-background/85 px-2 backdrop-blur-sm"
                  onBlur={(event) => {
                    const relatedTarget = event.relatedTarget as Node | null;
                    if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
                      setSearchExpanded(false);
                    }
                  }}
                >
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    ref={searchInputRef}
                    value={searchProps.keyword}
                    placeholder="Search PDF text..."
                    onChange={(e) => {
                      const nextKeyword = e.target.value;
                      searchProps.setKeyword(nextKeyword);

                      if (!nextKeyword.trim()) {
                        searchProps.clearKeyword();
                        return;
                      }

                      void searchProps.search();
                    }}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        await searchProps.search();
                        searchProps.jumpToNextMatch();
                        return;
                      }
                      if (e.key === 'Escape') {
                        setSearchExpanded(false);
                      }
                    }}
                    className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      searchProps.clearKeyword();
                      setSearchExpanded(false);
                    }}
                    className="h-8 w-8 shrink-0"
                    aria-label="Close search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        }}
      </PdfSearch>
    </TooltipProvider>
  );

  return (
    <>
      {controlsPortalTarget && createPortal(controlsContent, controlsPortalTarget)}
      <div className="flex items-center justify-between w-full px-4 py-1.5 border-b bg-card h-12">
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

          {/* Page display */}
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

        <div className="flex items-center gap-2">
          <TooltipProvider delayDuration={300}>
            <Rotate direction={RotateDirection.Forward}>
              {(props) => (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={props.onClick}
                      aria-label="Rotate"
                    >
                      <RotateCw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Rotate</TooltipContent>
                </Tooltip>
              )}
            </Rotate>
          </TooltipProvider>

          {!controlsPortalTarget && (
            <DownloadSlot>
              {(props) => (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={props.onClick}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download
                </Button>
              )}
            </DownloadSlot>
          )}
        </div>
      </div>
    </>
  );
}

export function DocumentViewer({ file, controlsPortalTarget }: DocumentViewerProps) {
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

  // Initialize viewer plugins (only meaningful for PDF files, but must be
  // called unconditionally to satisfy the rules-of-hooks)
  const toolbarPluginInstance = toolbarPlugin();
  const searchPluginInstance = searchPlugin();
  const { Toolbar } = toolbarPluginInstance;
  const PdfSearch = searchPluginInstance.Search;

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

  const renderNonPdfControls = () => {
    if (isPdf) return null;

    const controlsContent = (
      <div className="flex items-center gap-1">
        {documentId && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => blobUrl && window.open(blobUrl, '_blank')}
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
        <div className="flex items-center justify-between border-b px-4 py-1.5 bg-card h-12 shrink-0">
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

            {/* If no controls target, show the download button here too */}
            {!controlsPortalTarget && documentId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => blobUrl && window.open(blobUrl, '_blank')}
                disabled={!blobUrl}
                className="h-8"
              >
                <Download className="h-3.5 w-3.5 mr-1" />
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
      {/* Header/Controls for non-PDF files */}
      {renderNonPdfControls()}

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
                  <PdfToolbar
                    slots={slots}
                    fileName={file.name}
                    fileSize={file.size}
                    controlsPortalTarget={controlsPortalTarget}
                    PdfSearch={PdfSearch}
                  />
                )}
              </Toolbar>
              <div className="flex-1 overflow-hidden">
                <Viewer
                  fileUrl={blobUrl}
                  plugins={[toolbarPluginInstance, searchPluginInstance]}
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
