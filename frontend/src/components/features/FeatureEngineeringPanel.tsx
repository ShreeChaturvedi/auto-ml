import { useCallback, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AgenticShell } from '@/components/agentic/AgenticShell';
import { useLifecycleCards } from '@/components/agentic/useLifecycleCards';
import { useWorkflowPlaceholders } from '@/hooks/useWorkflowPlaceholders';
import { createFeatureEngineeringAdapter } from './FeatureEngineeringAdapter';
import { buildWorkflowSessionKey } from '@/stores/workflowSessionStore';
import {
  FeatureEngineeringToolbarLeft,
  FeatureEngineeringToolbarRight
} from './FeatureEngineeringToolbar';
import { FeatureUiItemRenderer } from './FeatureUiItemRenderer';
import {
  hasUiItems,
} from './featureEngineeringUtils';
import { useFeaturePipelineState } from './hooks/useFeaturePipelineState';
import { useFeatureUrlSync } from './hooks/useFeatureUrlSync';
import { useNotebookStore } from '@/stores/notebookStore';
import { RenameTabDialog } from '@/components/preprocessing/PreprocessingDialogs';
import { DeletePipelineDialog } from './DeletePipelineDialog';
import { FeatureEngineeringLeftPane } from './FeatureEngineeringLeftPane';
import { cn } from '@/lib/utils';

import type { ChatMessage } from '@/types/llmUi';

interface FeatureEngineeringPanelProps {
  projectId: string;
}

export function FeatureEngineeringPanel({ projectId }: FeatureEngineeringPanelProps) {
  const composerPlaceholders = useWorkflowPlaceholders(projectId, 'featureEngineering');
  const [searchParams] = useSearchParams();
  const initialNotebookId = searchParams.get('notebook') ?? undefined;

  const {
    selectedDataset,
    setSelectedDataset,
    targetColumn,
    setTargetColumn,
    datasetFiles,
    documentFiles,
    selectedDatasetFile,
    datasetColumns,
    versions,
    currentVersion,
    isApproved,
    isCurrentVersionDraft,
    activeFeatures,
    featureById,
    readinessReport,
    isReadyForApproval,
    readinessReportUnlocked,
    isReadinessExpanded,
    setIsReadinessExpanded,
    outputName,
    setOutputName,
    outputFormat,
    setOutputFormat,
    applyStatus,
    applyMessage,
    panelError,
    suggestionDrafts,
    toggleSuggestion,
    updateSuggestionControl,
    handleApplyFeatures,
    handleVersionSwitch,
    handleNewDraft,
    handleDeleteDraft,
    handleRenameDraft,
    handleReplay,
    handleReset,
    renameDialogOpen,
    setRenameDialogOpen,
    renameDialogValue,
    setRenameDialogValue,
    handleRenameConfirm,
    deleteDialogOpen,
    setDeleteDialogOpen,
    handleDeleteConfirm,
    approveVersion
  } = useFeaturePipelineState(projectId);

  // --- URL synchronization and version management ---
  const {
    handleVersionSelect,
    handleCreateDraft,
    handleApproveCurrentVersion,
    handleDeleteCurrentDraft
  } = useFeatureUrlSync({
    projectId,
    currentVersion,
    handleVersionSwitch,
    handleNewDraft,
    handleDeleteDraft,
    approveVersion
  });

  // Tag notebook with feature-engineering phase metadata
  const activeNotebookId = useNotebookStore((state) => state.activeNotebookId);
  const notebookProjectId = useNotebookStore((state) => state.currentProjectId);
  const notebooks = useNotebookStore((state) => state.notebooks);
  const updateNotebookMetadata = useNotebookStore((state) => state.updateNotebookMetadata);

  useEffect(() => {
    if (!activeNotebookId || !currentVersion) return;
    void updateNotebookMetadata(activeNotebookId, {
      phase: 'feature-engineering',
      tabId: currentVersion.id,
      tabName: currentVersion.name
    });
  }, [activeNotebookId, currentVersion?.id, currentVersion?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialNotebookId || notebookProjectId !== projectId) return;
    if (!notebooks.some((entry) => entry.notebookId === initialNotebookId)) return;
    void useNotebookStore.getState().setActiveNotebook(initialNotebookId);
  }, [initialNotebookId, notebookProjectId, notebooks, projectId]);

  const adapter = useMemo(() => {
    const storageKey = `feature-engineering-messages-v3-${currentVersion?.id ?? 'default'}`;
    const sessionKey = buildWorkflowSessionKey(projectId, storageKey);
    return createFeatureEngineeringAdapter({
      projectId,
      datasetId: selectedDatasetFile?.metadata?.datasetId,
      targetColumn,
      datasetFiles,
      documentFiles,
      sessionKey,
      notebookName: currentVersion?.name ?? 'Feature Engineering Notebook',
      notebookMetadata: currentVersion
        ? {
            phase: 'feature-engineering',
            tabId: currentVersion.id,
            tabName: currentVersion.name
          }
        : {
            phase: 'feature-engineering'
          }
    });
  }, [currentVersion, datasetFiles, documentFiles, projectId, selectedDatasetFile, targetColumn]);

  const baseRenderLifecycleCard = useLifecycleCards();

  /** Extends lifecycle cards with FE-specific ui message rendering */
  const renderLifecycleCard = useCallback(
    (message: ChatMessage): ReactNode | null => {
      // Handle ui messages with FE-specific item rendering
      if (message.type === 'ui') {
        if (!hasUiItems(message.schema)) return null;

        return (
          <div className="space-y-4">
            {(message.schema.sections ?? []).map((section) => (
              <div key={section.id} className="space-y-3">
                {section.title ? (
                  <h3 className="text-sm font-semibold">{section.title}</h3>
                ) : null}
                <div
                  className={cn(
                    section.layout === 'grid' && 'grid gap-3',
                    section.layout === 'grid' && section.columns === 2 && 'md:grid-cols-2',
                    section.layout === 'grid' && section.columns === 3 && 'md:grid-cols-3',
                    (!section.layout || section.layout === 'column') && 'space-y-3'
                  )}
                >
                  {section.items.map((item) => (
                    <FeatureUiItemRenderer
                      key={item.type === 'dataset_summary' ? item.datasetId : ('id' in item ? item.id : item.text)}
                      item={item}
                      isApproved={isApproved}
                      datasetColumns={datasetColumns}
                      suggestionDrafts={suggestionDrafts}
                      featureById={featureById}
                      onToggleSuggestion={toggleSuggestion}
                      onUpdateSuggestionControl={updateSuggestionControl}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      }

      // Delegate tool_call messages to the shared lifecycle cards
      return baseRenderLifecycleCard(message);
    },
    [baseRenderLifecycleCard, isApproved, datasetColumns, suggestionDrafts, featureById, toggleSuggestion, updateSuggestionControl]
  );

  return (
    <>
      <AgenticShell
        key={currentVersion?.id ?? 'feature-engineering-default'}
        projectId={projectId}
        composerPlaceholders={composerPlaceholders}
        storageKey={`feature-engineering-messages-v3-${currentVersion?.id ?? 'default'}`}
        domainAdapter={adapter}
        domainLockReason={
          isApproved
            ? 'This feature pipeline is approved and locked. Start a new draft to continue editing.'
            : undefined
        }
        renderLeftPane={(renderProps) => (
          <FeatureEngineeringLeftPane
            renderProps={renderProps}
            isApproved={isApproved}
            isReadyForApproval={isReadyForApproval}
            panelError={panelError}
            readinessReportUnlocked={readinessReportUnlocked}
            isReadinessExpanded={isReadinessExpanded}
            onToggleReadiness={() => setIsReadinessExpanded(!isReadinessExpanded)}
            readinessReport={readinessReport}
            outputName={outputName}
            onOutputNameChange={setOutputName}
            outputFormat={outputFormat}
            onOutputFormatChange={setOutputFormat}
            onApplyFeatures={handleApplyFeatures}
            applyStatus={applyStatus}
            applyMessage={applyMessage}
            activeFeatures={activeFeatures}
            onApprove={handleApproveCurrentVersion}
            onNewDraft={handleCreateDraft}
            renderLifecycleCard={renderLifecycleCard}
          />
        )}
        toolbarLeft={
          <FeatureEngineeringToolbarLeft
            currentVersionId={currentVersion?.id ?? ''}
            versions={versions.map((version) => ({ id: version.id, name: version.name }))}
            onVersionSwitch={handleVersionSelect}
            onNewDraft={handleCreateDraft}
            onRenameDraft={handleRenameDraft}
            onReplay={handleReplay}
            onReset={handleReset}
            onDeleteDraft={handleDeleteCurrentDraft}
            canRenameDraft={isCurrentVersionDraft}
            canDeleteDraft
          />
        }
        toolbarRight={
          <FeatureEngineeringToolbarRight
            selectedDatasetId={selectedDataset ?? ''}
            datasetOptions={datasetFiles.map((file) => ({ id: file.id, name: file.name }))}
            onDatasetSelect={setSelectedDataset}
            selectedTargetColumn={targetColumn ?? ''}
            targetColumns={datasetColumns}
            onTargetColumnSelect={setTargetColumn}
          />
        }
        leftPaneScrollable={false}
      />

      {/* Rename draft dialog */}
      <RenameTabDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        value={renameDialogValue}
        onValueChange={setRenameDialogValue}
        onSave={handleRenameConfirm}
        title="Rename draft pipeline"
        description="Update the name of the current draft pipeline."
      />

      {/* Delete draft confirmation dialog */}
      <DeletePipelineDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        draftName={currentVersion?.name ?? 'draft'}
        isLastVersion={versions.length <= 1}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}
