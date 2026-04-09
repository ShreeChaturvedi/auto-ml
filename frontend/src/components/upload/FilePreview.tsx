/**
 * FilePreview - Modal for previewing uploaded files
 *
 * Supports:
 * - PDF preview (react-pdf with custom toolbar)
 * - Image preview (full-size with zoom)
 * - CSV preview (first few rows in table)
 * - JSON preview (formatted JSON)
 */

import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import type { UploadedFile } from '@/types/file';
import { formatFileSize, resolveFileIcon } from '@/lib/fileUtils';
import Papa from 'papaparse';
import { Badge } from '@/components/ui/badge';
import { Eye, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDatasetSample } from '@/lib/api/datasets';
import { downloadDocument } from '@/lib/api/documents';
import { Markdown } from '@/components/ui/Markdown';
import { ScrollArea } from '@/components/ui/scroll-area';

const LazyPdfViewer = lazy(() => import('@/components/data/PdfViewer'));

interface FilePreviewProps {
  file: UploadedFile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RowInfo {
  shown: number;
  total: number;
}

export function FilePreview({ file, open, onOpenChange }: FilePreviewProps) {
  const [previewContent, setPreviewContent] = useState<React.ReactNode>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [rowInfo, setRowInfo] = useState<RowInfo | null>(null);

  useEffect(() => {
    const objectUrls: string[] = [];

    if (!open) return;

    // For hydrated files from backend (no file object), fetch sample from API
    if (!file.file && file.metadata?.datasetId && (file.type === 'csv' || file.type === 'json' || file.type === 'excel')) {
      setIsLoading(true);
      setRowInfo(null);
      void getDatasetSample(file.metadata.datasetId)
        .then((data) => {
          setRowInfo({ shown: data.sample.length, total: data.rowCount });
          setPreviewContent(
            <ScrollArea className="min-h-0 flex-1 rounded-lg border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0 z-10">
                    <tr>
                      {data.columns.map((header, i) => (
                        <th key={i} className="px-3 py-2 text-left font-medium text-muted-foreground">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.sample.map((row, i) => (
                      <tr key={i} className="border-t">
                        {data.columns.map((header, j) => (
                          <td key={j} className="px-3 py-2 font-mono text-xs">
                            {String(row[header] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          );
          setIsLoading(false);
        })
        .catch((error) => {
          console.error('Failed to fetch dataset sample:', error);
          setPreviewContent(
            <div className="p-6 text-center space-y-2">
              <p className="text-sm text-destructive">Failed to load dataset preview</p>
              <p className="text-xs text-muted-foreground">
                Use the Data Viewer tab to explore this dataset.
              </p>
            </div>
          );
          setIsLoading(false);
        });
      return;
    }

    // For hydrated PDFs (no file object but has documentId), fetch from API
    if (!file.file && file.type === 'pdf' && file.metadata?.documentId) {
      setIsLoading(true);
      void downloadDocument(file.metadata.documentId)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          objectUrls.push(url);
          setPreviewContent(
            <div className="h-[600px] rounded-lg border overflow-hidden">
              <Suspense fallback={<div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading PDF...</div>}>
                <LazyPdfViewer url={url} fileName={file.name} className="h-full" />
              </Suspense>
            </div>
          );
          setIsLoading(false);
        })
        .catch((error) => {
          console.error('Failed to load PDF:', error);
          setPreviewContent(
            <div className="p-6 text-center space-y-2">
              <p className="text-sm text-destructive">Failed to load PDF preview</p>
            </div>
          );
          setIsLoading(false);
        });
      return;
    }

    // For hydrated markdown/text files (no file object but has documentId), fetch from API
    if (!file.file && (file.type === 'markdown' || file.type === 'text') && file.metadata?.documentId) {
      setIsLoading(true);
      void downloadDocument(file.metadata.documentId)
        .then(async (blob) => {
          const text = await blob.text();
          if (file.type === 'markdown') {
            setPreviewContent(
              <ScrollArea className="max-h-[70vh] rounded-lg border">
                <Markdown className="p-4 markdown-content">
                  {text}
                </Markdown>
              </ScrollArea>
            );
          } else {
            setPreviewContent(
              <ScrollArea className="max-h-[70vh] rounded-lg bg-muted">
                <pre className="text-xs p-4 font-mono">
                  {text}
                </pre>
              </ScrollArea>
            );
          }
          setIsLoading(false);
        })
        .catch((error) => {
          console.error('Failed to load document:', error);
          setPreviewContent(
            <div className="p-6 text-center space-y-2">
              <p className="text-sm text-destructive">Failed to load document preview</p>
            </div>
          );
          setIsLoading(false);
        });
      return;
    }

    // For non-tabular hydrated files, show message
    if (!file.file) {
      setPreviewContent(
        <div className="p-6 text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Preview not available for this file type.
          </p>
        </div>
      );
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Generate preview based on file type
    switch (file.type) {
      case 'pdf': {
        const pdfUrl = URL.createObjectURL(file.file);
        objectUrls.push(pdfUrl);
        setPreviewContent(
          <div className="h-[600px] rounded-lg border overflow-hidden">
            <Suspense fallback={<div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading PDF...</div>}>
              <LazyPdfViewer url={pdfUrl} fileName={file.name} className="h-full" />
            </Suspense>
          </div>
        );
        setIsLoading(false);
        break;
      }

      case 'csv':
        setRowInfo(null);
        Papa.parse(file.file, {
          header: true,
          preview: 10, // Only show first 10 rows
          complete: (results) => {
            const headers = results.meta.fields || [];
            const rows = results.data as Record<string, unknown>[];

            // For fresh uploads, we only know the sample size (no total count available)
            setRowInfo({ shown: rows.length, total: rows.length });

            setPreviewContent(
              <ScrollArea className="min-h-0 flex-1 rounded-lg border">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0 z-10">
                      <tr>
                        {headers.map((header, i) => (
                          <th key={i} className="px-4 py-2 text-left font-medium">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i} className="border-t">
                          {headers.map((header, j) => (
                            <td key={j} className="px-4 py-2">
                              {String(row[header] || '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
            );
            setIsLoading(false);
          },
          error: () => {
            setPreviewContent(
              <p className="text-sm text-destructive">Error loading CSV preview</p>
            );
            setIsLoading(false);
          }
        });
        break;

      case 'json':
        file.file.text().then((text) => {
          try {
            const json = JSON.parse(text);
            setPreviewContent(
              <ScrollArea className="max-h-[70vh] rounded-lg bg-muted">
                <pre className="text-xs p-4">
                  {JSON.stringify(json, null, 2)}
                </pre>
              </ScrollArea>
            );
          } catch {
            setPreviewContent(
              <p className="text-sm text-destructive">Error parsing JSON</p>
            );
          }
          setIsLoading(false);
        });
        break;

      case 'markdown':
        file.file.text().then((text) => {
          setPreviewContent(
            <ScrollArea className="max-h-[70vh] rounded-lg border">
              <Markdown className="p-4 markdown-content">
                {text}
              </Markdown>
            </ScrollArea>
          );
          setIsLoading(false);
        }).catch(() => {
          setPreviewContent(
            <p className="text-sm text-destructive">Error loading markdown preview</p>
          );
          setIsLoading(false);
        });
        break;

      case 'text':
        file.file.text().then((text) => {
          setPreviewContent(
            <ScrollArea className="max-h-[70vh] rounded-lg bg-muted">
              <pre className="text-xs p-4 font-mono">
                {text}
              </pre>
            </ScrollArea>
          );
          setIsLoading(false);
        }).catch(() => {
          setPreviewContent(
            <p className="text-sm text-destructive">Error loading text preview</p>
          );
          setIsLoading(false);
        });
        break;

      default:
        setPreviewContent(
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">
              Preview not available for this file type
            </p>
          </div>
        );
        setIsLoading(false);
    }

    // Cleanup
    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      setPreviewContent(null);
      setRowInfo(null);
    };
  }, [file, open]);

  const { Icon, colorClass } = resolveFileIcon(file.type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 min-w-0">
            <div className={cn('flex-shrink-0', colorClass)}>
              <Icon className="h-5 w-5" />
            </div>
            <span className="truncate">{file.name}</span>
            <Badge variant="outline" className="bg-muted/50 font-normal text-xs flex-shrink-0">
              {formatFileSize(file.size)}
            </Badge>
            {rowInfo && (
              <Badge variant="outline" className="gap-1 bg-muted/50 font-normal text-xs flex-shrink-0">
                <Eye className="h-3 w-3" />
                {rowInfo.shown.toLocaleString()}
                {rowInfo.total > rowInfo.shown && ` of ${rowInfo.total.toLocaleString()}`}
                {' '}rows
              </Badge>
            )}
            {typeof file.metadata?.chunkCount === 'number' && (
              <Badge variant="outline" className="bg-muted/50 font-normal text-xs flex-shrink-0">
                {file.metadata.chunkCount} chunks
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Preview of {file.name}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          </div>
        ) : (
          previewContent
        )}
      </DialogContent>
    </Dialog>
  );
}
