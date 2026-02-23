/**
 * DataViewerTab - Tableau-style data exploration interface
 *
 * Now includes FileTabBar for switching between file previews and query results
 * Uses backend Postgres for queries with EDA support
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, AlertCircle } from 'lucide-react';
import { QueryPanel } from './QueryPanel';
import { FileTabBar } from './FileTabBar';
import { DataTable } from './DataTable';
import { DocumentViewer } from './DocumentViewer';
import { useDataStore } from '@/stores/dataStore';
import { useProjectStore } from '@/stores/projectStore';
import { executeNlQuery, executeSqlQuery } from '@/lib/api/query';
import type { QueryMode, DataPreview } from '@/types/file';

export function DataViewerTab() {
  const [isExecuting, setIsExecuting] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryPanelCollapsed, setQueryPanelCollapsed] = useState(false);
  const { projectId } = useParams();
  const projects = useProjectStore((state) => state.projects);
  const activeProject = projects.find((p) => p.id === projectId);

  const allPreviews = useDataStore((state) => state.previews);
  const allFiles = useDataStore((state) => state.files);
  const allArtifacts = useDataStore((state) => state.queryArtifacts);
  const createArtifact = useDataStore((state) => state.createArtifact);
  const activeFileTabId = useDataStore((state) => state.activeFileTabId);
  const fileTabType = useDataStore((state) => state.fileTabType);
  const openFileTabs = useDataStore((state) => state.openFileTabs);
  const setActiveFileTab = useDataStore((state) => state.setActiveFileTab);
  const hydrateFromBackend = useDataStore((state) => state.hydrateFromBackend);

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

  // Handle query execution
  const handleExecuteQuery = useCallback(
    async (query: string, mode: QueryMode) => {
      if (!activeProject) return;

      setIsExecuting(true);
      setQueryError(null);

      try {
        if (mode === 'english') {
          const response = await executeNlQuery({
            projectId: activeProject.id,
            query,
            tableName: tableNames[0]
          });
          const nl = response.nl;
          const queryResult = nl.query;

          const dataPreview: DataPreview = {
            fileId: 'query-result',
            headers: queryResult.columns.map((col) => col.name),
            rows: queryResult.rows,
            totalRows: queryResult.rowCount,
            previewRows: queryResult.rowCount,
            eda: queryResult.eda
          };

          const artifactId = createArtifact(query, mode, dataPreview, activeProject.id, {
            eda: queryResult.eda,
            cached: queryResult.cached,
            executionMs: queryResult.executionMs,
            cacheTimestamp: queryResult.cacheTimestamp,
            generatedSql: nl.sql,
            rationale: nl.rationale
          });

          setActiveFileTab(artifactId, 'artifact');
          return;
        }

        // Execute SQL using backend Postgres
        const result = await executeSqlQuery({ projectId: activeProject.id, sql: query });

        // Convert backend QueryResult to DataPreview format
        const dataPreview: DataPreview = {
          fileId: 'query-result',
          headers: result.query.columns.map((col) => col.name),
          rows: result.query.rows,
          totalRows: result.query.rowCount,
          previewRows: result.query.rowCount,
          eda: result.query.eda // Include EDA metadata for Analysis tab
        };

        // Create artifact with result, including EDA metadata
        const artifactId = createArtifact(query, mode, dataPreview, activeProject.id, {
          eda: result.query.eda,
          cached: result.query.cached,
          executionMs: result.query.executionMs,
          cacheTimestamp: result.query.cacheTimestamp
        });

        // Switch to the new artifact tab
        setActiveFileTab(artifactId, 'artifact');
      } catch (error) {
        console.error('Query execution failed:', error);
        let errorMessage = 'Unknown error occurred';
        
        if (error instanceof Error) {
          // Check if it's an ApiError with payload containing detailed error info
          const apiError = error as Error & { payload?: unknown };
          if (apiError.payload && typeof apiError.payload === 'object') {
            const payload = apiError.payload as Record<string, unknown>;
            // Handle Zod validation errors
            if (payload.errors && typeof payload.errors === 'object') {
              const errors = payload.errors as { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
              const fieldErrors = errors.fieldErrors ? Object.entries(errors.fieldErrors).map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ') : '';
              const formErrors = errors.formErrors?.join('; ') || '';
              errorMessage = [fieldErrors, formErrors].filter(Boolean).join(' | ') || error.message;
            } else if (payload.error && typeof payload.error === 'string') {
              errorMessage = payload.error;
            } else {
              errorMessage = error.message;
            }
          } else {
            errorMessage = error.message;
          }
        }
        
        setQueryError(errorMessage);
      } finally {
        setIsExecuting(false);
      }
    },
    [activeProject, createArtifact, setActiveFileTab, tableNames]
  );

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
          return <DataTable preview={preview} />;
        }
        return (
          <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
            No preview available for this dataset yet.
          </div>
        );
      }

      return <DocumentViewer file={file} />;
    } else if (fileTabType === 'artifact') {
      const artifact = queryArtifacts.find((a) => a.id === activeFileTabId);
      if (artifact) {
        return (
          <DataTable
            preview={artifact.result}
            queryInfo={{
              query: artifact.query,
              mode: artifact.mode,
              timestamp: artifact.timestamp,
              eda: artifact.eda,
              cached: artifact.cached,
              executionMs: artifact.executionMs,
              cacheTimestamp: artifact.cacheTimestamp,
              generatedSql: artifact.generatedSql,
              rationale: artifact.rationale
            }}
          />
        );
      }
    }

    return null;
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
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

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Data Display (left side) */}
        <div className="flex-1 min-w-0 overflow-auto">
          {getActiveTabContent() ?? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a file from the sidebar to open it here.
            </div>
          )}
        </div>

        {/* Query Panel (right side) - collapsible with smooth animation */}
        <QueryPanel
          onExecute={handleExecuteQuery}
          isExecuting={isExecuting}
          className={queryPanelCollapsed ? 'w-12 shrink-0' : 'w-[400px] shrink-0'}
          tableNames={tableNames}
          columnsByTable={columnsByTable}
          collapsed={queryPanelCollapsed}
          onCollapsedChange={setQueryPanelCollapsed}
        />
      </div>
    </div>
  );
}
