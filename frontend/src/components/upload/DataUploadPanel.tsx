/**
 * DataUploadPanel - Clean, minimal file upload interface
 *
 * Features:
 * - Large drop zone when empty (matches custom instructions height)
 * - Compact drop zone when files exist
 * - Simple file rows without card borders
 * - Horizontal separators between files
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileStack } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useDataStore } from '@/stores/dataStore';
import type { UploadedFile } from '@/types/file';
import { getFileType, DATA_FILE_TYPES } from '@/lib/fileUtils';
import { FileRow } from './FileRow';
import { uploadDatasetFile } from '@/lib/api/datasets';
import { uploadDocument } from '@/lib/api/documents';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useNlSuggestionStore } from '@/stores/nlSuggestionStore';

/** Static style for the shimmer band at rest (hoisted to avoid allocation per render). */
const SHIMMER_RESTING_STYLE: React.CSSProperties = {
  opacity: 0,
  transform: 'translateX(-120%) skewX(-15deg)',
  background:
    'linear-gradient(90deg, transparent 0%, hsl(var(--muted-foreground) / 0.06) 20%, hsl(var(--muted-foreground) / 0.14) 50%, hsl(var(--muted-foreground) / 0.06) 80%, transparent 100%)',
};

// Accepted file types (data files and context documents only - NO images)
const acceptedFileTypes = {
  // Data files
  'text/csv': ['.csv'],
  'application/json': ['.json'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  // Context/documentation files (for RAG and business context)
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/markdown': ['.md'],
  'text/plain': ['.txt', '.log'],
  'text/html': ['.html', '.htm'],
  'application/xml': ['.xml'],
  'text/xml': ['.xml'],
  'application/yaml': ['.yml', '.yaml'],
  'text/yaml': ['.yml', '.yaml'],
  'application/rtf': ['.rtf']
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
  const fetchProjectSuggestions = useNlSuggestionStore((state) => state.fetchProjectSuggestions);

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
          previewRows: dataset.sample.length,
          eda: dataset.eda
        });

        setUploadStatus((prev) => ({ ...prev, [file.id]: 'uploaded' }));

        // Re-hydrate from backend to reconcile client-side UUIDs with
        // backend datasetIds — ensures preview lookups and tab IDs are
        // consistent without requiring a manual page refresh.
        await hydrateFromBackend(projectId, { force: true });
      } catch (error) {
        console.error(`[DataUploadPanel] Failed to upload ${file.name}:`, error);
        setUploadStatus((prev) => ({ ...prev, [file.id]: 'error' }));
        setUploadErrors((prev) => ({
          ...prev,
          [file.id]: error instanceof Error ? error.message : 'Upload failed'
        }));
      }
    },
    [projectId, setFileMetadata, addPreview, hydrateFromBackend]
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

      const datasetUploads: Promise<unknown>[] = [];

      // Add to store
      newFiles.forEach((file) => {
        addFile(file);
        // Auto-upload dataset files
        if (DATA_FILE_TYPES.has(file.type)) {
          datasetUploads.push(uploadDatasetToBackend(file));
        } else {
          void uploadDocumentToBackend(file);
        }
      });

      if (datasetUploads.length > 0) {
        void Promise.allSettled(datasetUploads).then(async () => {
          // Single hydration after all uploads complete (not per-file)
          await hydrateFromBackend(projectId, { force: true });
          fetchProjectSuggestions(projectId, { force: true });
        });
      }
    },
    [projectId, addFile, fetchProjectSuggestions, hydrateFromBackend, uploadDatasetToBackend, uploadDocumentToBackend]
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

  // Count file types (single pass)
  const [dataFiles, contextFiles] = useMemo(() => {
    const data: UploadedFile[] = [];
    const context: UploadedFile[] = [];
    for (const f of projectFiles) {
      (DATA_FILE_TYPES.has(f.type) ? data : context).push(f);
    }
    return [data, context] as const;
  }, [projectFiles]);
  const shimmerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  /** Fire-and-forget: one sweep across the surface, then hidden again. */
  const triggerShimmer = useCallback(() => {
    if (reducedMotion || isDragActive) return;
    const el = shimmerRef.current;
    if (!el || el.getAnimations().length > 0) return;
    el.animate(
      [
        { transform: 'translateX(-120%) skewX(-15deg)', opacity: 1 },
        { transform: 'translateX(220%) skewX(-15deg)', opacity: 1 },
      ],
      { duration: 1200, easing: 'ease-in-out', fill: 'none' },
    );
  }, [reducedMotion, isDragActive]);

  return (
    <div className="h-full flex flex-col" data-testid="data-upload-panel">
      {/* Drop Zone + File List Container */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Drop Zone - Fills entire area when empty, compact when has files */}
        <div
          {...getRootProps()}
          onMouseEnter={triggerShimmer}
          className={cn(
            'relative flex flex-col items-center justify-center transition-colors duration-300 cursor-pointer overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            hasFiles ? 'py-6 mx-4 mt-4 mb-4 rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/50' : 'flex-1 border-2 border-dashed border-muted-foreground/30',
            isDragActive && 'border-accent-fill bg-accent-bg'
          )}
        >
          <input {...getInputProps()} />

          {/* Metallic shimmer band — hidden at rest, sweeps once on hover via WAAPI */}
          <div
            ref={shimmerRef}
            className="pointer-events-none absolute inset-y-0 w-[60%]"
            style={SHIMMER_RESTING_STYLE}
          />

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
              : 'Drag and drop files here, or click anywhere. Supports CSV, JSON, and XLSX for data and PDF/Markdown/TXT for context.'}
          </p>
        </div>

        {/* File List - Simple rows with separators */}
        {hasFiles && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-4 pb-4">
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
              {projectFiles.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  onRemove={handleRemoveFile}
                  status={uploadStatus[file.id]}
                  errorMessage={uploadErrors[file.id]}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
