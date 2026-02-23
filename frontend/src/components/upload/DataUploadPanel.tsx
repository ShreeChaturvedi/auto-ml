/**
 * DataUploadPanel - Clean, minimal file upload interface
 *
 * Features:
 * - Large drop zone when empty (matches custom instructions height)
 * - Compact drop zone when files exist
 * - Simple file rows without card borders
 * - Horizontal separators between files
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileStack, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useDataStore } from '@/stores/dataStore';
import type { UploadedFile } from '@/types/file';
import { getFileType } from '@/types/file';
import { FileRow } from './FileRow';
import { uploadDatasetFile } from '@/lib/api/datasets';
import { uploadDocument } from '@/lib/api/documents';

// Accepted file types (data files and context documents only - NO images)
const acceptedFileTypes = {
  // Data files
  'text/csv': ['.csv'],
  'application/json': ['.json'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  // Context/documentation files (for RAG and business context)
  'application/pdf': ['.pdf'],
  'text/markdown': ['.md'],
  'text/plain': ['.txt']
};

interface DataUploadPanelProps {
  projectId: string;
}

export function DataUploadPanel({ projectId }: DataUploadPanelProps) {
  const [uploadStatus, setUploadStatus] = useState<Record<string, 'uploading' | 'uploaded' | 'error'>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});

  const addFile = useDataStore((state) => state.addFile);
  const addPreview = useDataStore((state) => state.addPreview);
  const setFileMetadata = useDataStore((state) => state.setFileMetadata);
  const hydrateFromBackend = useDataStore((state) => state.hydrateFromBackend);
  const allFiles = useDataStore((state) => state.files);

  // Filter files for this project using useMemo to avoid infinite loops
  const projectFiles = useMemo(
    () => allFiles.filter((file) => file.projectId === projectId),
    [allFiles, projectId]
  );

  const hasFiles = projectFiles.length > 0;

  // Hydrate files from backend on mount
  useEffect(() => {
    if (projectId) {
      void hydrateFromBackend(projectId);
    }
  }, [projectId, hydrateFromBackend]);

  // Upload dataset files to backend
  const uploadDatasetToBackend = useCallback(
    async (file: UploadedFile) => {
      setUploadStatus((prev) => ({ ...prev, [file.id]: 'uploading' }));

      try {
        const response = await uploadDatasetFile(file.file!, projectId);
        const dataset = response.dataset;

        // Update file metadata with backend info
        setFileMetadata(file.id, {
          datasetId: dataset.datasetId,
          tableName: dataset.tableName,
          rowCount: dataset.n_rows,
          columnCount: dataset.n_cols,
          columns: dataset.columns,
          datasetProfile: {
            nRows: dataset.n_rows,
            nCols: dataset.n_cols,
            dtypes: dataset.dtypes,
            nullCounts: dataset.null_counts
          }
        });

        addPreview({
          fileId: file.id,
          headers: dataset.columns,
          rows: dataset.sample,
          totalRows: dataset.n_rows,
          previewRows: dataset.sample.length
        });

        setUploadStatus((prev) => ({ ...prev, [file.id]: 'uploaded' }));
        console.log(`[DataUploadPanel] ✅ Uploaded ${file.name} to backend`);
      } catch (error) {
        console.error(`[DataUploadPanel] Failed to upload ${file.name}:`, error);
        setUploadStatus((prev) => ({ ...prev, [file.id]: 'error' }));
        setUploadErrors((prev) => ({
          ...prev,
          [file.id]: error instanceof Error ? error.message : 'Upload failed'
        }));
      }
    },
    [projectId, setFileMetadata, addPreview]
  );

  const uploadDocumentToBackend = useCallback(
    async (file: UploadedFile) => {
      setUploadStatus((prev) => ({ ...prev, [file.id]: 'uploading' }));

      try {
        const response = await uploadDocument(projectId, file.file!);
        const document = response.document;

        setFileMetadata(file.id, {
          documentId: document.documentId,
          chunkCount: document.chunkCount,
          embeddingDimension: document.embeddingDimension,
          mimeType: document.mimeType,
          parseWarning: document.parseWarning
        });

        setUploadStatus((prev) => ({ ...prev, [file.id]: 'uploaded' }));
        console.log(`[DataUploadPanel] ✅ Ingested ${file.name} for RAG`);
      } catch (error) {
        console.error(`[DataUploadPanel] Failed to ingest ${file.name}:`, error);
        setUploadStatus((prev) => ({ ...prev, [file.id]: 'error' }));
        setUploadErrors((prev) => ({
          ...prev,
          [file.id]: error instanceof Error ? error.message : 'Upload failed'
        }));
      }
    },
    [projectId, setFileMetadata]
  );

  // Handle file drop
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newFiles: UploadedFile[] = acceptedFiles.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        type: getFileType(file),
        size: file.size,
        uploadedAt: new Date(),
        projectId: projectId,
        file
      }));

      // Add to store
      newFiles.forEach((file) => {
        addFile(file);
        // Auto-upload dataset files
        if (['csv', 'json', 'excel'].includes(file.type)) {
          void uploadDatasetToBackend(file);
        } else if (['pdf', 'markdown', 'word', 'text'].includes(file.type)) {
          void uploadDocumentToBackend(file);
        }
      });
    },
    [projectId, addFile, uploadDatasetToBackend, uploadDocumentToBackend]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedFileTypes,
    multiple: true
  });

  const handleRemoveFile = async (fileId: string) => {
    try {
      await useDataStore.getState().deleteFile(fileId);
      setUploadStatus((prev) => {
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
      setUploadErrors((prev) => {
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
    } catch (error) {
      console.error('[DataUploadPanel] Failed to delete file:', error);
      setUploadErrors((prev) => ({
        ...prev,
        [fileId]: 'Failed to delete file from server'
      }));
    }
  };

  // Count file types
  const dataFiles = projectFiles.filter(f => ['csv', 'json', 'excel'].includes(f.type));
  const contextFiles = projectFiles.filter(f => ['pdf', 'markdown', 'word', 'text', 'other'].includes(f.type));
  const isUploading = Object.values(uploadStatus).some(status => status === 'uploading');

  return (
    <div className="h-full flex flex-col" data-testid="data-upload-panel">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-2">
            <FileStack className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Data Upload</h2>
            <p className="text-xs text-muted-foreground">
              Datasets and documentation for your project
            </p>
          </div>
        </div>
        {isUploading && (
          <Badge variant="secondary" className="text-xs gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Uploading...
          </Badge>
        )}
      </div>

      {/* Drop Zone + File List Container */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Drop Zone - Full height when empty, compact when has files */}
        <div
          {...getRootProps()}
          className={cn(
            'flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer',
            hasFiles ? 'py-6 mb-4' : 'flex-1 min-h-[300px]',
            isDragActive
              ? 'border-primary bg-primary/5 scale-[1.01]'
              : 'border-border hover:border-primary/50 hover:bg-accent/20'
          )}
        >
          <input {...getInputProps()} />

          <div className={cn(
            'rounded-2xl p-3 mb-3 transition-transform',
            isDragActive ? 'bg-primary/20 scale-110' : 'bg-primary/10'
          )}>
            {isDragActive ? (
              <Upload className="h-8 w-8 text-primary animate-bounce" />
            ) : (
              <FileStack className="h-8 w-8 text-primary" />
            )}
          </div>

          <h3 className="text-sm font-medium text-foreground mb-1">
            {isDragActive ? 'Drop your files here' : 'Upload your files'}
          </h3>
          <p className="text-xs text-muted-foreground text-center max-w-sm px-4">
            {hasFiles
              ? 'Drop more files or click to browse'
              : 'Drag and drop files here, or click anywhere. Supports CSV, JSON, Excel for data and PDF/Markdown/TXT for context.'}
          </p>
        </div>

        {/* File List - Simple rows with separators */}
        {hasFiles && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Header with counts */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Uploaded Files</span>
              <div className="flex items-center gap-2">
                {dataFiles.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {dataFiles.length} data
                  </Badge>
                )}
                {contextFiles.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {contextFiles.length} context
                  </Badge>
                )}
              </div>
            </div>

            {/* Scrollable file list */}
            <div className="flex-1 overflow-y-auto -mx-1 px-1">
              {projectFiles.map((file, index) => (
                <div key={file.id}>
                  <FileRow
                    file={file}
                    onRemove={handleRemoveFile}
                    status={uploadStatus[file.id]}
                    errorMessage={uploadErrors[file.id]}
                  />
                  {index < projectFiles.length - 1 && (
                    <hr className="border-border my-2" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
