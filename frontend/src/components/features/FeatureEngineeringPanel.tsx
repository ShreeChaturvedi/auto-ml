import { useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
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
import { RenameTabDialog } from '@/components/preprocessing/PreprocessingDialogs';
import { DeletePipelineDialog } from './DeletePipelineDialog';
import { FeatureEngineeringLeftPane } from './FeatureEngineeringLeftPane';
import { cn } from '@/lib/utils';
import { useFeatureNotebookSync } from './hooks/useFeatureNotebookSync';
import { useFeatureCodeGen } from './hooks/useFeatureCodeGen';

import type { ChatMessage } from '@/types/llmUi';

interface FeatureEngineeringPanelProps {
  projectId: string;
}

export function FeatureEngineeringPanel({ projectId }: FeatureEngineeringPanelProps) {
  const composerPlaceholders = useWorkflowPlaceholders(projectId, 'featureEngineering');

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
    chatSessionVersion,
    isCurrentVersionDraft,
    activeFeatures,
    featureById,
    featureSteps,
    currentStage,
    readinessReport,
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
    handleDeleteConfirm
  } = useFeaturePipelineState(projectId);

  // --- URL synchronization and version management ---
  const {
    handleVersionSelect,
    handleCreateDraft,
    handleDeleteCurrentDraft
  } = useFeatureUrlSync({
    projectId,
    currentVersion,
    handleVersionSwitch,
    handleNewDraft,
    handleDeleteDraft
  });

  const implementedFeaturesCount = useMemo(() => {
    const implementedStatuses = new Set([
      'code_ready',
      'executing',
      'executed',
      'validated',
      'registered',
      'completed'
    ]);

    return activeFeatures.filter((feature) => {
      const step = featureSteps[feature.id];
      return step ? implementedStatuses.has(step.status) : false;
    }).length;
  }, [activeFeatures, featureSteps]);

  const {
    notebookId: resolvedNotebookId,
    isReady: isFeatureNotebookReady
  } = useFeatureNotebookSync({
    projectId,
    currentVersion
  });

  useFeatureCodeGen(activeFeatures, selectedDatasetFile, resolvedNotebookId);

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
      notebookId: resolvedNotebookId ?? undefined,
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
  }, [
    currentVersion,
    datasetFiles,
    documentFiles,
    projectId,
    resolvedNotebookId,
    selectedDatasetFile,
    targetColumn
  ]);

  const baseRenderLifecycleCard = useLifecycleCards();

  /** Extends lifecycle cards with FE-specific ui message rendering */
  const renderLifecycleCard = useCallback(
    (message: ChatMessage): ReactNode | null => {
      // Handle ui messages with FE-specific item rendering
      if (message.type === 'ui') {
        if (!hasUiItems(message.schema)) return null;

        return (
          <div className="space-y-4">
            {message.schema.sections.map((section) => (
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
    [baseRenderLifecycleCard, datasetColumns, suggestionDrafts, featureById, toggleSuggestion, updateSuggestionControl]
  );

  return (
    <>
      {isFeatureNotebookReady ? (
      <AgenticShell
        key={currentVersion?.id ?? 'feature-engineering-default'}
        projectId={projectId}
        composerPlaceholders={composerPlaceholders}
        storageKey={`feature-engineering-messages-v3-${currentVersion?.id ?? 'default'}`}
        sessionVersion={chatSessionVersion}
        domainAdapter={adapter}
        renderLeftPane={(renderProps) => (
          <FeatureEngineeringLeftPane
            renderProps={renderProps}
            activeFeaturesCount={activeFeatures.length}
            implementedFeaturesCount={implementedFeaturesCount}
            currentStage={currentStage}
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
            canDeleteDraft={isCurrentVersionDraft}
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
        notebookId={resolvedNotebookId}
      />
      ) : (
        <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground">
          Preparing feature notebook...
        </div>
      )}

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
