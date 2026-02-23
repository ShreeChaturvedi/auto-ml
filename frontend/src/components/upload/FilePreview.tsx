/**
 * FilePreview - Modal for previewing uploaded files
 *
 * Supports:
 * - PDF preview (using react-pdf-viewer)
 * - Image preview (full-size with zoom)
 * - CSV preview (first few rows in table)
 * - JSON preview (formatted JSON)
 */

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import type { UploadedFile } from '@/types/file';
import { formatFileSize } from '@/types/file';
import Papa from 'papaparse';
import { Badge } from '@/components/ui/badge';
import { Eye } from 'lucide-react';
import { getDatasetSample } from '@/lib/api/datasets';
import { downloadDocument } from '@/lib/api/documents';
import { Worker, Viewer, SpecialZoomLevel } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
    if (!open) return;

    // For hydrated files from backend (no file object), fetch sample from API
    if (!file.file && file.metadata?.datasetId && (file.type === 'csv' || file.type === 'json' || file.type === 'excel')) {
      setIsLoading(true);
      setRowInfo(null);
      void getDatasetSample(file.metadata.datasetId)
        .then((data) => {
          setRowInfo({ shown: data.sample.length, total: data.rowCount });
          setPreviewContent(
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
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
          setPreviewContent(
            <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
              <div className="h-[600px] rounded-lg border overflow-hidden">
                <Viewer
                  fileUrl={url}
                  defaultScale={SpecialZoomLevel.PageWidth}
                  theme={{ theme: 'dark' }}
                />
              </div>
            </Worker>
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
              <div className="p-4 markdown-content rounded-lg border max-h-[600px] overflow-auto">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {text}
                </ReactMarkdown>
              </div>
            );
          } else {
            setPreviewContent(
              <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-[600px] font-mono">
                {text}
              </pre>
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
        setPreviewContent(
          <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
            <div className="h-[600px] rounded-lg border overflow-hidden">
              <Viewer
                fileUrl={pdfUrl}
                defaultScale={SpecialZoomLevel.PageWidth}
                theme={{ theme: 'dark' }}
              />
            </div>
          </Worker>
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
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
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
              <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-[600px]">
                {JSON.stringify(json, null, 2)}
              </pre>
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
            <div className="p-4 markdown-content rounded-lg border max-h-[600px] overflow-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {text}
              </ReactMarkdown>
            </div>
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
            <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-[600px] font-mono">
              {text}
            </pre>
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
      setPreviewContent(null);
      setRowInfo(null);
    };
  }, [file, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{file.name}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Badge variant="outline" className="bg-muted/50">{file.type.charAt(0).toUpperCase() + file.type.slice(1)}</Badge>
            <Badge variant="outline" className="bg-muted/50">{formatFileSize(file.size)}</Badge>
            {rowInfo && (
              <Badge variant="outline" className="gap-1 bg-muted/50">
                <Eye className="h-3 w-3" />
                <span>
                  {rowInfo.shown.toLocaleString()}
                  {rowInfo.total > rowInfo.shown && (
                    <span className="text-muted-foreground"> of {rowInfo.total.toLocaleString()}</span>
                  )}
                  {' '}rows
                </span>
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
            </div>
          ) : (
            <div className="pr-4">{previewContent}</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
