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
import { DATA_FILE_TYPES } from '@/lib/fileUtils';
import { useNlSuggestionStore } from '@/stores/nlSuggestionStore';
import { FileRow } from './FileRow';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  createUploadedProjectFile,
  ingestProjectFile,
} from './projectFileIngestion';

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
  onFirstUpload?: () => void;
}

export function DataUploadPanel({ projectId, onFirstUpload }: DataUploadPanelProps) {
  const [uploadStatus, setUploadStatus] = useState<Record<string, 'uploading' | 'uploaded' | 'error'>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});

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
      void useDataStore.getState().hydrateFromBackend(projectId);
    }
  }, [projectId]);

  const ingestFile = useCallback(async (file: UploadedFile) => {
    setUploadStatus((prev) => ({ ...prev, [file.id]: 'uploading' }));

    try {
      await ingestProjectFile({
        projectId,
        file: file.file!,
        fileId: file.id,
        addFileWhen: 'after-upload',
        syncProjectState: false,
        addFile: () => undefined,
        addPreview: useDataStore.getState().addPreview,
        setFileMetadata: useDataStore.getState().setFileMetadata,
        hydrateFromBackend: useDataStore.getState().hydrateFromBackend,
        refreshProjectSuggestions: useNlSuggestionStore.getState().fetchProjectSuggestions,
      });
      setUploadStatus((prev) => ({ ...prev, [file.id]: 'uploaded' }));
    } catch (error) {
      console.error(`[DataUploadPanel] Failed to upload ${file.name}:`, error);
      setUploadStatus((prev) => ({ ...prev, [file.id]: 'error' }));
      setUploadErrors((prev) => ({
        ...prev,
        [file.id]: error instanceof Error ? error.message : 'Upload failed',
      }));
    }
  }, [projectId]);

  // Handle file drop
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const isFirstUpload = projectFiles.length === 0;
      const addFile = useDataStore.getState().addFile;
      const newFiles: UploadedFile[] = acceptedFiles.map((file) => createUploadedProjectFile(projectId, file));

      const uploads: Promise<unknown>[] = [];
      newFiles.forEach((file) => {
        addFile(file);
        uploads.push(ingestFile(file));
      });

      void Promise.allSettled(uploads).then(async () => {
        await Promise.all([
          useDataStore.getState().hydrateFromBackend(projectId, { force: true }),
          useNlSuggestionStore.getState().fetchProjectSuggestions(projectId, { force: true }),
        ]);
        if (isFirstUpload) onFirstUpload?.();
      });
    },
    [projectId, projectFiles.length, ingestFile, onFirstUpload]
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
            hasFiles ? 'py-6 mx-4 mt-4 mb-4 rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/50' : 'flex-1',
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
