/**
 * DataViewerTab - Tableau-style data exploration interface
 *
 * Now includes FileTabBar for switching between file previews and query results
 * Uses backend Postgres for queries with EDA support
 */

import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { QueryPanel } from './QueryPanel';
import { FileTabBar } from './FileTabBar';
import { DataViewerContent } from './DataViewerContent';
import { useDataStore } from '@/stores/dataStore';
import { useProjectStore } from '@/stores/projectStore';
import { cn } from '@/lib/utils';
import {
  extractApiErrorMessage,
  useColumnOperations
} from './hooks/useColumnOperations';
import { useDatasetPreviewPagination } from './hooks/useDatasetPreviewPagination';
import { useDataViewerPanelState } from './hooks/useDataViewerPanelState';
import { useDataViewerQueryHandlers } from './hooks/useDataViewerQueryHandlers';
import { useInsightActions } from '@/hooks/useInsightActions';
import { DATA_FILE_TYPES } from '@/lib/fileUtils';
import {
  buildDatasetSchema,
  resolveDataViewerSelection,
} from './dataViewerTabState';

export function DataViewerTab() {
  const { projectId } = useParams();
  const projects = useProjectStore((state) => state.projects);
  const activeProject = projects.find((p) => p.id === projectId);

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
      void useDataStore.getState().hydrateFromBackend(projectId);
    }
  }, [projectId]);

  // Auto-select a tab when none is active or the active tab doesn't belong to this project
  const openFileTabsForProject = useMemo(
    () => openFileTabs.filter((tabId) => files.some((file) => file.id === tabId)),
    [openFileTabs, files]
  );
  const queryArtifactIds = useMemo(
    () => queryArtifacts.map((artifact) => artifact.id),
    [queryArtifacts]
  );

  const firstDataFileId = useMemo(
    () => files.find((f) => DATA_FILE_TYPES.has(f.type))?.id ?? null,
    [files]
  );

  // Derive table names and columns for SQL autocomplete
  const { tableNames, columnsByTable } = useColumnOperations(files, previews);
  const {
    handleExecuteQuery,
    handleNlApprove,
    handleNlGenerate,
    isExecuting,
    queryMode,
    setQueryMode,
  } = useDataViewerQueryHandlers({
    activeProject,
    createArtifact,
    setActiveFileTab,
    tableNames,
  });
  const {
    controlsPortalTarget,
    handleQueryPanelCollapsedChange,
    handleQueryPanelTransitionEnd,
    handleSuggestSql,
    queryPanelCollapsed,
    queryPanelIsExpanding,
    queryPanelIsTransitioning,
    setControlsPortalTarget,
    suggestedSql,
  } = useDataViewerPanelState({
    setQueryMode,
  });
  const activeControlsPortalTarget = controlsPortalTarget;

  useEffect(() => {
    const selection = resolveDataViewerSelection({
      hasActiveFile: Boolean(activeFile),
      hasActiveArtifact: queryArtifacts.some((artifact) => artifact.id === activeFileTabId),
      openFileTabsForProject,
      queryArtifactIds,
      firstDataFileId,
    });

    if (selection.kind === 'activate') {
      setActiveFileTab(selection.id, selection.type);
    } else if (selection.kind === 'open-file') {
      openFileTab(selection.id);
    }
  }, [
    activeFile,
    activeFileTabId,
    firstDataFileId,
    openFileTab,
    openFileTabsForProject,
    queryArtifactIds,
    queryArtifacts,
    setActiveFileTab,
  ]);

  const datasetSchema = useMemo(() => buildDatasetSchema(files), [files]);

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
        onTransitionEnd={handleQueryPanelTransitionEnd}
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
