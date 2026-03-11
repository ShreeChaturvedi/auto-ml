/**
 * DataViewerContent - Renders the active tab's content (data table, document, or plan).
 *
 * Extracted from DataViewerTab to isolate the content rendering logic.
 */

import { toast } from 'sonner';
import { Markdown } from '@/components/ui/Markdown';
import { DataTable } from './DataTable';
import { DocumentViewer } from './DocumentViewer';
import type { ColumnDataType, DataPreview, QueryMode } from '@/types/file';
import type { NlQueryExplanation } from '@/lib/api/query';

interface QueryArtifact {
  id: string;
  query: string;
  mode: QueryMode;
  timestamp: number;
  result: DataPreview;
  eda?: unknown;
  cached?: boolean;
  executionMs?: number;
  cacheTimestamp?: string;
  generatedSql?: string;
  rationale?: string;
  explanation?: NlQueryExplanation;
  projectId: string;
}

interface FileEntry {
  id: string;
  type: string;
  metadata?: {
    tableName?: string;
    datasetId?: string;
    datasetProfile?: {
      dtypes?: Record<string, ColumnDataType>;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface ProjectEntry {
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DataViewerContentProps {
  activeFileTabId: string | null;
  fileTabType: 'file' | 'artifact' | 'plan' | null;
  files: FileEntry[];
  previews: DataPreview[];
  queryArtifacts: QueryArtifact[];
  activeProject?: ProjectEntry;
  projectTypeColorClassName?: string;
  controlsPortalTarget: HTMLElement | null;
  updateColumnType: (datasetId: string, columnName: string, nextType: ColumnDataType) => Promise<void>;
  extractApiErrorMessage: (error: unknown) => string;
}

export function DataViewerContent({
  activeFileTabId,
  fileTabType,
  files,
  previews,
  queryArtifacts,
  activeProject,
  projectTypeColorClassName,
  controlsPortalTarget,
  updateColumnType,
  extractApiErrorMessage
}: DataViewerContentProps) {
  if (!activeFileTabId) return null;

  if (fileTabType === 'file') {
    const file = files.find((f) => f.id === activeFileTabId);
    if (!file) return null;

    if (['csv', 'json', 'excel'].includes(file.type)) {
      const preview = previews.find((p) => p.fileId === activeFileTabId);
      if (preview) {
        const columnTypes = file.metadata?.datasetProfile?.dtypes;
        const datasetId = file.metadata?.datasetId;
        return (
          <DataTable
            preview={preview}
            columnTypes={columnTypes}
            typeColorClassName={projectTypeColorClassName}
            controlsPortalTarget={controlsPortalTarget}
            onColumnTypeChange={
              datasetId
                ? async (columnName: string, nextType: ColumnDataType) => {
                    try {
                      await updateColumnType(datasetId, columnName, nextType);
                      toast.success(`Updated ${columnName} to ${nextType}`);
                    } catch (error) {
                      const message = extractApiErrorMessage(error);
                      toast.error('Failed to update column type', {
                        description: message
                      });
                    }
                  }
                : undefined
            }
          />
        );
      }
      return (
        <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
          No preview available for this dataset yet.
        </div>
      );
    }

    return <DocumentViewer file={file} controlsPortalTarget={controlsPortalTarget} />;
  } else if (fileTabType === 'artifact') {
    const artifact = queryArtifacts.find((a) => a.id === activeFileTabId);
    if (artifact) {
      const columnTypes = artifact.result.columnTypes;
      return (
        <DataTable
          preview={artifact.result}
          columnTypes={columnTypes}
          typeColorClassName={projectTypeColorClassName}
          controlsPortalTarget={controlsPortalTarget}
          queryInfo={{
            query: artifact.query,
            mode: artifact.mode,
            timestamp: artifact.timestamp,
            eda: artifact.eda,
            cached: artifact.cached,
            executionMs: artifact.executionMs,
            cacheTimestamp: artifact.cacheTimestamp,
            generatedSql: artifact.generatedSql,
            rationale: artifact.rationale,
            explanation: artifact.explanation
          }}
        />
      );
    }
  } else if (fileTabType === 'plan') {
    const planContent = (activeProject?.metadata as Record<string, unknown> | undefined)
      ?.projectPlan as string | undefined;
    if (planContent) {
      return (
        <div className="h-full overflow-auto p-6">
          <Markdown className="mx-auto max-w-3xl prose prose-sm dark:prose-invert">
            {planContent}
          </Markdown>
        </div>
      );
    }
  }

  return null;
}
