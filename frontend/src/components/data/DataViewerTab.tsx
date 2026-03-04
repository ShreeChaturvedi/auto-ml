/**
 * DataViewerTab - Tableau-style data exploration interface
 *
 * Now includes FileTabBar for switching between file previews and query results
 * Uses backend Postgres for queries with EDA support
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { QueryPanel } from './QueryPanel';
import { withSqlIdentifierHint } from './sqlIdentifiers';
import { FileTabBar } from './FileTabBar';
import { DataTable } from './DataTable';
import { DocumentViewer } from './DocumentViewer';
import { useDataStore } from '@/stores/dataStore';
import { useProjectStore } from '@/stores/projectStore';
import { ApiError } from '@/lib/api/client';
import { executeNlQuery, executeSqlQuery, streamNlQuery } from '@/lib/api/query';
import type { QueryResultPayload } from '@/lib/api/query';
import type { ColumnDataType, QueryMode, DataPreview } from '@/types/file';
import type { NlGenerationResult, NlQueryStreamEvent } from '@/types/nlQuery';
import { projectColorClasses } from '@/types/project';
import { extractColumnTypesFromQuery } from './sqlColumnTypes';
import { cn } from '@/lib/utils';

function extractApiErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  if (!(error instanceof ApiError)) {
    return error.message;
  }

  if (error.payload && typeof error.payload === 'object') {
    const payload = error.payload as Record<string, unknown>;

    if (typeof payload.details === 'string' && payload.details.trim()) {
      return payload.details;
    }

    if (payload.errors && typeof payload.errors === 'object') {
      const errors = payload.errors as {
        fieldErrors?: Record<string, string[]>;
        formErrors?: string[];
      };

      const fieldErrors = errors.fieldErrors
        ? Object.entries(errors.fieldErrors)
            .map(([key, values]) => `${key}: ${values.join(', ')}`)
            .join('; ')
        : '';
      const formErrors = errors.formErrors?.join('; ') ?? '';
      const combined = [fieldErrors, formErrors].filter(Boolean).join(' | ');
      if (combined) {
        return combined;
      }
    }

    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error;
    }
  }

  return error.message;
}

function buildDataPreviewFromQuery(query: QueryResultPayload): DataPreview {
  return {
    fileId: 'query-result',
    headers: query.columns.map((col) => col.name),
    rows: query.rows,
    totalRows: query.rowCount,
    previewRows: query.rowCount,
    eda: query.eda,
    columnTypes: extractColumnTypesFromQuery(query.columns, query.rows)
  };
}

function buildQueryArtifactMeta(query: QueryResultPayload) {
  return {
    eda: query.eda,
    cached: query.cached,
    executionMs: query.executionMs,
    cacheTimestamp: query.cacheTimestamp
  };
}

function toNlGenerationResult(nl: Awaited<ReturnType<typeof executeNlQuery>>['nl']): NlGenerationResult {
  return {
    sql: nl.sql,
    rationale: nl.rationale,
    explanation: nl.explanation,
    queryId: nl.queryId,
    cached: nl.cached,
    queryExecutionError: nl.queryExecutionError ?? null,
    queryResult: nl.query
  };
}

export function DataViewerTab() {
  const [isExecuting, setIsExecuting] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryPanelCollapsed, setQueryPanelCollapsed] = useState(false);
  const [queryPanelIsExpanding, setQueryPanelIsExpanding] = useState(false);
  const [queryPanelIsTransitioning, setQueryPanelIsTransitioning] = useState(false);
  const [queryMode, setQueryMode] = useState<QueryMode>('sql');
  const [controlsPortalTarget, setControlsPortalTarget] = useState<HTMLElement | null>(null);
  const { projectId } = useParams();
  const projects = useProjectStore((state) => state.projects);
  const activeProject = projects.find((p) => p.id === projectId);
  const projectTypeColorClassName = activeProject
    ? projectColorClasses[activeProject.color].text
    : undefined;

  const allPreviews = useDataStore((state) => state.previews);
  const allFiles = useDataStore((state) => state.files);
  const allArtifacts = useDataStore((state) => state.queryArtifacts);
  const createArtifact = useDataStore((state) => state.createArtifact);
  const activeFileTabId = useDataStore((state) => state.activeFileTabId);
  const fileTabType = useDataStore((state) => state.fileTabType);
  const openFileTabs = useDataStore((state) => state.openFileTabs);
  const setActiveFileTab = useDataStore((state) => state.setActiveFileTab);
  const hydrateFromBackend = useDataStore((state) => state.hydrateFromBackend);
  const updateColumnType = useDataStore((state) => state.updateColumnType);

  const files = useMemo(
    () => allFiles.filter((file) => file.projectId === projectId),
    [allFiles, projectId]
  );

  const previews = useMemo(
    () => allPreviews.filter((preview) => files.some((file) => file.id === preview.fileId)),
    [allPreviews, files]
  );

  const queryArtifacts = useMemo(
    () => allArtifacts.filter((artifact) => artifact.projectId === projectId),
    [allArtifacts, projectId]
  );

  // Hydrate data from backend on mount
  useEffect(() => {
    if (projectId) {
      void hydrateFromBackend(projectId);
    }
  }, [projectId, hydrateFromBackend]);

  // Auto-select first tab if none selected
  const openFileTabsForProject = useMemo(
    () => openFileTabs.filter((tabId) => files.some((file) => file.id === tabId)),
    [openFileTabs, files]
  );

  useEffect(() => {
    if (activeFileTabId) return;
    if (openFileTabsForProject.length > 0) {
      setActiveFileTab(openFileTabsForProject[0], 'file');
      return;
    }
    if (queryArtifacts.length > 0) {
      setActiveFileTab(queryArtifacts[0].id, 'artifact');
    }
  }, [activeFileTabId, openFileTabsForProject, queryArtifacts, setActiveFileTab]);

  // Derive table names and columns for SQL autocomplete
  const tableNames = useMemo(() => {
    return files
      .filter((f) => f.metadata?.tableName)
      .map((f) => f.metadata!.tableName!);
  }, [files]);

  const columnsByTable = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const file of files) {
      if (!file.metadata?.tableName) continue;
      const preview = previews.find((p) => p.fileId === file.id);
      if (preview) {
        result[file.metadata.tableName] = preview.headers;
      }
    }
    return result;
  }, [files, previews]);

  // Handle query execution — SQL only.
  // Natural-language queries are now handled by handleNlGenerate + handleNlApprove.
  const handleExecuteQuery = useCallback(
    async (query: string, mode: QueryMode) => {
      if (!activeProject) return;

      setIsExecuting(true);
      setQueryError(null);

      try {
        // Execute SQL using backend Postgres
        const result = await executeSqlQuery({ projectId: activeProject.id, sql: query });
        const dataPreview = buildDataPreviewFromQuery(result.query);

        // Create artifact with result, including EDA metadata
        const artifactId = createArtifact(
          query,
          mode,
          dataPreview,
          activeProject.id,
          buildQueryArtifactMeta(result.query)
        );

        setActiveFileTab(artifactId, 'artifact');
      } catch (error) {
        console.error('Query execution failed:', error);
        const errorMessage = extractApiErrorMessage(error) || 'Unknown error occurred';

        setQueryError(withSqlIdentifierHint(errorMessage, mode, tableNames[0]));
      } finally {
        setIsExecuting(false);
      }
    },
    [activeProject, createArtifact, setActiveFileTab, tableNames]
  );

  /**
   * Phase 1 of the NL workflow: generate SQL from a natural-language query.
   * Returns the generation result to NlQueryWorkflow WITHOUT creating an
   * artifact — that only happens once the user approves in phase 2.
   */
  const handleNlGenerate = useCallback(
    async (
      query: string,
      onStreamEvent?: (event: NlQueryStreamEvent) => void,
      signal?: AbortSignal
    ): Promise<NlGenerationResult> => {
      if (!activeProject) throw new Error('No active project');

      const requestPayload = {
        projectId: activeProject.id,
        query,
        tableName: tableNames[0]
      };

      let nl: Awaited<ReturnType<typeof executeNlQuery>>['nl'];
      if (onStreamEvent) {
        let streamedNl: Awaited<ReturnType<typeof executeNlQuery>>['nl'] | null = null;
        let streamFailure: string | null = null;
        await streamNlQuery(
          requestPayload,
          (event) => {
            onStreamEvent(event);
            if (event.type === 'result') {
              streamedNl = event.nl;
            } else if (event.type === 'phase_failed' && event.phaseId === 'done') {
              streamFailure = event.summary;
            }
          },
          signal
        );

        if (!streamedNl) {
          throw new Error(streamFailure ?? 'NL stream completed without a final result payload.');
        }
        nl = streamedNl;
      } else {
        const response = await executeNlQuery(requestPayload);
        nl = response.nl;
      }

      if (nl.queryExecutionError) {
        toast.warning('Generated SQL needs review', {
          description: `Initial execution hit a database error: ${nl.queryExecutionError}`
        });
      }

      return toNlGenerationResult(nl);
    },
    [activeProject, tableNames]
  );

  /**
   * Phase 2 of the NL workflow: the user has reviewed (and optionally edited)
   * the generated SQL and clicked "Approve & Run".
   *
   * - If the SQL is unchanged, we reuse the cached query result from the
   *   generation response — no second round-trip needed.
   * - If the SQL was edited, we execute the new SQL and use the fresh result.
   */
  const handleNlApprove = useCallback(
    async (result: NlGenerationResult, approvedSql: string) => {
      if (!activeProject) return;

      setIsExecuting(true);
      setQueryError(null);

      try {
        let queryResult = result.queryResult;

        // Re-execute when SQL was edited OR no initial query payload exists.
        if (!queryResult || approvedSql.trim() !== result.sql.trim()) {
          const freshResult = await executeSqlQuery({
            projectId: activeProject.id,
            sql: approvedSql
          });
          queryResult = freshResult.query;
        }

        if (!queryResult) {
          throw new Error('Generated SQL has no executable result payload. Please retry.');
        }

        const dataPreview = buildDataPreviewFromQuery(queryResult);
        const artifactId = createArtifact(approvedSql, 'english', dataPreview, activeProject.id, {
          ...buildQueryArtifactMeta(queryResult),
          generatedSql: result.sql,
          rationale: result.rationale,
          explanation: result.explanation
        });

        setActiveFileTab(artifactId, 'artifact');
      } catch (error) {
        console.error('NL query approval failed:', error);
        const errorMessage = extractApiErrorMessage(error) || 'Unknown error occurred';

        setQueryError(withSqlIdentifierHint(errorMessage, 'english', tableNames[0]));
        toast.error(`Query failed: ${errorMessage}`);
      } finally {
        setIsExecuting(false);
      }
    },
    [activeProject, createArtifact, setActiveFileTab, tableNames]
  );

  const handleQueryPanelCollapsedChange = useCallback(
    (nextCollapsed: boolean) => {
      if (queryPanelIsTransitioning || nextCollapsed === queryPanelCollapsed) {
        return;
      }

      setQueryPanelIsTransitioning(true);
      setQueryPanelIsExpanding(!nextCollapsed);
      setQueryPanelCollapsed(nextCollapsed);
    },
    [queryPanelCollapsed, queryPanelIsTransitioning]
  );

  const activeControlsPortalTarget = controlsPortalTarget;

  useEffect(() => {
    if (!queryPanelIsTransitioning) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setQueryPanelIsTransitioning(false);
      setQueryPanelIsExpanding(false);
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [queryPanelIsTransitioning]);

  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-md">
          <FileText className="h-16 w-16 text-muted-foreground/50 mx-auto" />
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">No data loaded</h3>
            <p className="text-sm text-muted-foreground">
              Upload a dataset from the Upload phase to start exploring your data with queries.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Get active tab content
  const getActiveTabContent = () => {
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
              controlsPortalTarget={activeControlsPortalTarget}
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

      return <DocumentViewer file={file} controlsPortalTarget={activeControlsPortalTarget} />;
    } else if (fileTabType === 'artifact') {
      const artifact = queryArtifacts.find((a) => a.id === activeFileTabId);
      if (artifact) {
        // Extract column types from the query result metadata
        const columnTypes = artifact.result.columnTypes;
        return (
            <DataTable
              preview={artifact.result}
              columnTypes={columnTypes}
              typeColorClassName={projectTypeColorClassName}
              controlsPortalTarget={activeControlsPortalTarget}
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
      // Render plan markdown from project metadata
      const planContent = (activeProject?.metadata as Record<string, unknown> | undefined)?.projectPlan as string | undefined;
      if (planContent) {
        return (
          <div className="h-full overflow-auto p-6">
            <div className="mx-auto max-w-3xl prose prose-sm dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {planContent}
              </ReactMarkdown>
            </div>
          </div>
        );
      }
    }

    return null;
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main Content Area (left side) */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* File Tab Bar */}
        {projectId && <FileTabBar projectId={projectId} />}

        {/* Error Banner */}
        {queryError && (
          <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-3 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-destructive">Query Error</p>
              <p className="text-sm text-destructive/90 mt-1 whitespace-pre-wrap">{queryError}</p>
            </div>
            <button
              onClick={() => setQueryError(null)}
              className="text-destructive/70 hover:text-destructive transition-colors"
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {/* Data Display */}
        <div className="flex-1 min-w-0 overflow-auto bg-background">
          {getActiveTabContent() ?? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a file from the sidebar to open it here.
            </div>
          )}
        </div>
      </div>

      {/* Query Panel (right side) */}
      <div
        className={cn(
          'min-w-0 shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out [will-change:width]',
          queryPanelCollapsed ? 'w-12' : 'w-[400px]'
        )}
        style={{ willChange: queryPanelIsTransitioning ? 'width' : 'auto' }}
        onTransitionEnd={(event) => {
          if (event.target !== event.currentTarget || event.propertyName !== 'width') {
            return;
          }

          setQueryPanelIsExpanding(false);
          setQueryPanelIsTransitioning(false);
        }}
      >
        <QueryPanel
          onExecute={handleExecuteQuery}
          isExecuting={isExecuting}
          className="w-full"
          tableNames={tableNames}
          columnsByTable={columnsByTable}
          collapsed={queryPanelCollapsed}
          onCollapsedChange={handleQueryPanelCollapsedChange}
          isExpanding={queryPanelIsExpanding}
          mode={queryMode}
          onModeChange={setQueryMode}
          controlsPortalTarget={controlsPortalTarget}
          onMountPortalTarget={setControlsPortalTarget}
          onNlGenerate={handleNlGenerate}
          onNlApprove={handleNlApprove}
        />
      </div>
    </div>
  );
}
