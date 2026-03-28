/**
 * DataViewerTab - Tableau-style data exploration interface
 *
 * Now includes FileTabBar for switching between file previews and query results
 * Uses backend Postgres for queries with EDA support
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import { QueryPanel } from './QueryPanel';
import { withSqlIdentifierHint } from './sqlIdentifiers';
import { FileTabBar } from './FileTabBar';
import { DataViewerContent } from './DataViewerContent';
import { useDataStore } from '@/stores/dataStore';
import { useProjectStore } from '@/stores/projectStore';
import { executeNlQuery, executeSqlQuery, streamNlQuery } from '@/lib/api/query';
import type { QueryMode } from '@/types/file';
import type { NlGenerationResult, NlQueryStreamEvent } from '@/types/nlQuery';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { cn } from '@/lib/utils';
import {
  extractApiErrorMessage,
  buildDataPreviewFromQuery,
  buildQueryArtifactMeta,
  useColumnOperations
} from './hooks/useColumnOperations';
import { useDatasetPreviewPagination } from './hooks/useDatasetPreviewPagination';
import { useInsightActions } from '@/hooks/useInsightActions';
import { DATA_FILE_TYPES } from '@/lib/fileUtils';

function toNlGenerationResult(nl: Awaited<ReturnType<typeof executeNlQuery>>['nl']): NlGenerationResult {
  return {
    sql: nl.sql,
    rationale: nl.rationale,
    explanation: nl.explanation,
    queryId: nl.queryId,
    provider: nl.provider,
    cached: nl.cached,
    queryExecutionError: nl.queryExecutionError ?? null,
    queryResult: nl.query
  };
}

export function DataViewerTab() {
  const [isExecuting, setIsExecuting] = useState(false);
  const [queryPanelCollapsed, setQueryPanelCollapsed] = useState(false);
  const [queryPanelIsExpanding, setQueryPanelIsExpanding] = useState(false);
  const [queryPanelIsTransitioning, setQueryPanelIsTransitioning] = useState(false);
  const [queryMode, setQueryMode] = useState<QueryMode>('sql');
  const [controlsPortalTarget, setControlsPortalTarget] = useState<HTMLElement | null>(null);
  const { projectId } = useParams();
  const projects = useProjectStore((state) => state.projects);
  const activeProject = projects.find((p) => p.id === projectId);

  // Ensure accent CSS vars are set (side-effect)
  useProjectThemeColor();
  const projectTypeColorClassName = 'text-accent-text';

  const allPreviews = useDataStore((state) => state.previews);
  const allFiles = useDataStore((state) => state.files);
  const allArtifacts = useDataStore((state) => state.queryArtifacts);
  const createArtifact = useDataStore((state) => state.createArtifact);
  const activeFileTabId = useDataStore((state) => state.activeFileTabId);
  const fileTabType = useDataStore((state) => state.fileTabType);
  const openFileTabs = useDataStore((state) => state.openFileTabs);
  const setActiveFileTab = useDataStore((state) => state.setActiveFileTab);
  const openFileTab = useDataStore((state) => state.openFileTab);
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
  const activeFile = useMemo(
    () => (fileTabType === 'file' ? files.find((file) => file.id === activeFileTabId) : undefined),
    [activeFileTabId, fileTabType, files]
  );
  const activePreview = useMemo(
    () => (activeFile ? previews.find((preview) => preview.fileId === activeFile.id) : undefined),
    [activeFile, previews]
  );

  // Hydrate data from backend on mount
  useEffect(() => {
    if (projectId) {
      void hydrateFromBackend(projectId);
    }
  }, [projectId, hydrateFromBackend]);

  // Auto-select a tab when none is active or the active tab doesn't belong to this project
  const openFileTabsForProject = useMemo(
    () => openFileTabs.filter((tabId) => files.some((file) => file.id === tabId)),
    [openFileTabs, files]
  );

  const firstDataFileId = useMemo(
    () => files.find((f) => DATA_FILE_TYPES.has(f.type))?.id ?? null,
    [files]
  );

  useEffect(() => {
    const belongs = !!activeFile || queryArtifacts.some((a) => a.id === activeFileTabId);
    if (belongs) return;

    if (openFileTabsForProject.length > 0) {
      setActiveFileTab(openFileTabsForProject[0], 'file');
      return;
    }
    if (queryArtifacts.length > 0) {
      setActiveFileTab(queryArtifacts[0].id, 'artifact');
      return;
    }
    // Auto-open first data file when no tabs have been opened yet
    if (firstDataFileId) {
      openFileTab(firstDataFileId);
    }
  }, [activeFile, activeFileTabId, openFileTabsForProject, queryArtifacts, firstDataFileId, setActiveFileTab, openFileTab]);

  // Derive table names and columns for SQL autocomplete
  const { tableNames, columnsByTable } = useColumnOperations(files, previews);

  // Handle query execution — SQL only.
  // Natural-language queries are now handled by handleNlGenerate + handleNlApprove.
  const handleExecuteQuery = useCallback(
    async (query: string, mode: QueryMode) => {
      if (!activeProject) return;

      setIsExecuting(true);

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

        toast.error('Query failed', {
          description: withSqlIdentifierHint(errorMessage, mode, tableNames[0])
        });
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

        toast.error('Query failed', {
          description: withSqlIdentifierHint(errorMessage, 'english', tableNames[0])
        });
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

  // Suggested SQL state — set by insight "query" action, consumed by QueryPanel.
  // Wrapped with a monotonic token so re-clicking the same insight re-triggers.
  const suggestedSqlTokenRef = useRef(0);
  const [suggestedSql, setSuggestedSql] = useState<{ sql: string; token: number } | null>(null);

  const handleSuggestSql = useCallback((sql: string) => {
    setQueryMode('sql');
    setSuggestedSql({ sql, token: ++suggestedSqlTokenRef.current });
    if (queryPanelCollapsed) {
      handleQueryPanelCollapsedChange(false);
    }
  }, [queryPanelCollapsed, handleQueryPanelCollapsedChange]);

  // Build dataset schema for notebook code generation context
  const datasetSchema = useMemo(() => {
    const firstFile = files[0];
    const dtypes = firstFile?.metadata?.datasetProfile?.dtypes;
    if (!dtypes) return undefined;
    return Object.entries(dtypes).map(([column, dtype]) => ({ column, dtype }));
  }, [files]);

  const { handleInsightAction } = useInsightActions({
    projectId,
    tableName: tableNames[0],
    onExecuteQuery: handleExecuteQuery,
    onSuggestSql: handleSuggestSql,
    datasetSchema,
  });
  const datasetIncrementalLoad = useDatasetPreviewPagination({
    file: activeFile,
    preview: activePreview,
    extractApiErrorMessage
  });

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

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main Content Area (left side) */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {projectId && (
          <FileTabBar
            projectId={projectId}
            queryIconColorClassName={projectTypeColorClassName}
          />
        )}

        {/* Data Display */}
        <div className="flex-1 min-w-0 overflow-auto bg-background">
          {activeFileTabId ? (
            <DataViewerContent
              activeFileTabId={activeFileTabId}
              fileTabType={fileTabType}
              files={files}
              previews={previews}
              queryArtifacts={queryArtifacts}
              activeProject={activeProject}
              projectTypeColorClassName={projectTypeColorClassName}
              controlsPortalTarget={activeControlsPortalTarget}
              updateColumnType={updateColumnType}
              extractApiErrorMessage={extractApiErrorMessage}
              datasetIncrementalLoad={datasetIncrementalLoad}
              onInsightAction={handleInsightAction}
            />
          ) : (
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
          projectId={projectId}
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
          suggestedSql={suggestedSql}
        />
      </div>
    </div>
  );
}
