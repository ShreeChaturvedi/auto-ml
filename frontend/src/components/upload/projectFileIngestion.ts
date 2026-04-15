import { uploadDatasetFile } from '@/lib/api/datasets';
import { uploadDocument } from '@/lib/api/documents';
import { DATA_FILE_TYPES, DOC_FILE_TYPES, getFileType } from '@/lib/fileUtils';
import type { DataPreview, FileMetadata, UploadedFile } from '@/types/file';

export interface ProjectFileIngestionDeps {
  addFile: (file: UploadedFile) => void;
  addPreview: (preview: DataPreview) => void;
  setFileMetadata: (fileId: string, metadata: Partial<FileMetadata>) => void;
  hydrateFromBackend?: (projectId: string, options?: { force?: boolean }) => Promise<unknown>;
  refreshProjectSuggestions?: (projectId: string, options?: { force?: boolean }) => Promise<unknown>;
}

export interface IngestProjectFileOptions extends ProjectFileIngestionDeps {
  projectId: string;
  file: File;
  fileId?: string;
  addFileWhen?: 'before-upload' | 'after-upload';
  syncProjectState?: boolean;
}

export interface IngestedProjectFile {
  uploadedFile: UploadedFile;
  summary: {
    kind: 'dataset' | 'document';
    fileType?: string;
    size: number;
    nRows?: number;
    nCols?: number;
    chunkCount?: number;
    sample?: Record<string, unknown>[];
  };
}

export function createUploadedProjectFile(projectId: string, file: File, fileId: string = crypto.randomUUID()): UploadedFile {
  return {
    id: fileId,
    name: file.name,
    type: getFileType(file),
    size: file.size,
    uploadedAt: new Date(),
    projectId,
    file,
  };
}

export function isProjectFileReady(file: Pick<UploadedFile, 'type' | 'metadata'>): boolean {
  if (DATA_FILE_TYPES.has(file.type)) {
    return Boolean(file.metadata?.datasetId);
  }

  if (DOC_FILE_TYPES.has(file.type)) {
    return Boolean(file.metadata?.documentId);
  }

  return true;
}

function applyDatasetUpload(
  uploadedFile: UploadedFile,
  response: Awaited<ReturnType<typeof uploadDatasetFile>>,
  deps: Pick<ProjectFileIngestionDeps, 'addPreview' | 'setFileMetadata'>,
): IngestedProjectFile['summary'] {
  const dataset = response.dataset;

  deps.setFileMetadata(uploadedFile.id, {
    datasetId: dataset.datasetId,
    tableName: dataset.tableName,
    queryable: dataset.queryable ?? (!response.warning && Boolean(dataset.tableName)),
    queryError: dataset.queryError ?? response.warning,
    rowCount: dataset.n_rows,
    columnCount: dataset.n_cols,
    columns: dataset.columns,
    datasetProfile: {
      nRows: dataset.n_rows,
      nCols: dataset.n_cols,
      dtypes: dataset.dtypes,
      nullCounts: dataset.null_counts,
    },
  });

  deps.addPreview({
    fileId: uploadedFile.id,
    headers: dataset.columns,
    rows: dataset.sample,
    totalRows: dataset.n_rows,
    previewRows: dataset.sample.length,
    eda: dataset.eda,
  });

  return {
    kind: 'dataset',
    fileType: uploadedFile.type,
    size: uploadedFile.size,
    nRows: dataset.n_rows,
    nCols: dataset.n_cols,
    sample: dataset.sample.slice(0, 2),
  };
}

function applyDocumentUpload(
  uploadedFile: UploadedFile,
  response: Awaited<ReturnType<typeof uploadDocument>>,
  deps: Pick<ProjectFileIngestionDeps, 'setFileMetadata'>,
): IngestedProjectFile['summary'] {
  const { document } = response;

  deps.setFileMetadata(uploadedFile.id, {
    documentId: document.documentId,
    chunkCount: document.chunkCount,
    embeddingDimension: document.embeddingDimension,
    mimeType: document.mimeType,
    parseWarning: document.parseWarning,
  });

  return {
    kind: 'document',
    fileType: document.mimeType,
    size: uploadedFile.size,
    chunkCount: document.chunkCount,
  };
}

export async function ingestProjectFile({
  projectId,
  file,
  fileId,
  addFileWhen = 'after-upload',
  syncProjectState = true,
  addFile,
  addPreview,
  setFileMetadata,
  hydrateFromBackend,
  refreshProjectSuggestions,
}: IngestProjectFileOptions): Promise<IngestedProjectFile> {
  const uploadedFile = createUploadedProjectFile(projectId, file, fileId);
  const shouldAddBeforeUpload = addFileWhen === 'before-upload';
  if (shouldAddBeforeUpload) {
    addFile(uploadedFile);
  }

  let summary: IngestedProjectFile['summary'];
  if (DATA_FILE_TYPES.has(uploadedFile.type)) {
    const response = await uploadDatasetFile(file, projectId);
    if (!shouldAddBeforeUpload) {
      addFile(uploadedFile);
    }
    summary = applyDatasetUpload(uploadedFile, response, { addPreview, setFileMetadata });

    if (syncProjectState) {
      await Promise.all([
        hydrateFromBackend?.(projectId, { force: true }),
        refreshProjectSuggestions?.(projectId, { force: true }),
      ]);
    }
  } else {
    const response = await uploadDocument(projectId, file);
    if (!shouldAddBeforeUpload) {
      addFile(uploadedFile);
    }
    summary = applyDocumentUpload(uploadedFile, response, { setFileMetadata });
    if (syncProjectState) {
      await Promise.all([
        hydrateFromBackend?.(projectId, { force: true }),
        refreshProjectSuggestions?.(projectId, { force: true }),
      ]);
    }
  }

  return { uploadedFile, summary };
}
