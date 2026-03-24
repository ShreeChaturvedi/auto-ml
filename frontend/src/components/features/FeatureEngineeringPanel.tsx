import { useCallback, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AgenticShell } from '@/components/agentic/AgenticShell';
import { ChatMessageRenderer } from '@/components/agentic/ChatMessageRenderer';
import { useLifecycleCards } from '@/components/agentic/useLifecycleCards';
import { useWorkflowPlaceholders } from '@/hooks/useWorkflowPlaceholders';
import { createFeatureEngineeringAdapter } from './FeatureEngineeringAdapter';
import { buildWorkflowSessionKey } from '@/stores/workflowSessionStore';
import { FeatureApprovalGate } from './FeatureApprovalGate';
import { FeatureEngineeringFooter } from './FeatureEngineeringFooter';
import {
  FeatureEngineeringToolbarLeft,
  FeatureEngineeringToolbarRight
} from './FeatureEngineeringToolbar';
import { FeatureUiItemRenderer } from './FeatureUiItemRenderer';
import {
  hasUiItems,
} from './featureEngineeringUtils';
import { useFeaturePipelineState } from './hooks/useFeaturePipelineState';
import { useNotebookStore } from '@/stores/notebookStore';
import { RenameTabDialog } from '@/components/preprocessing/PreprocessingDialogs';
import { useFeatureStore } from '@/stores/featureStore';

import { cn } from '@/lib/utils';
import { getWorkbookParam } from '@/lib/workbookParam';

import { Beaker } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import type { ChatMessage } from '@/types/llmUi';

interface FeatureEngineeringPanelProps {
  projectId: string;
}

export function FeatureEngineeringPanel({ projectId }: FeatureEngineeringPanelProps) {
  const composerPlaceholders = useWorkflowPlaceholders(projectId, 'featureEngineering');
  const [searchParams, setSearchParams] = useSearchParams();
  const workbookParam = getWorkbookParam(searchParams);
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

  const setCurrentVersion = useFeatureStore((state) => state.setCurrentVersion);

  // Sync active draft pipeline from URL changes after mount.
  useEffect(() => {
    if (workbookParam && workbookParam !== currentVersion?.id) {
      handleVersionSwitch(workbookParam);
    }
  }, [currentVersion?.id, handleVersionSwitch, workbookParam]);

  // Seed the URL with the current draft pipeline when the page loads without a workbook param.
  useEffect(() => {
    if (workbookParam || !currentVersion?.id) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.set('workbook', currentVersion.id);
    setSearchParams(next, { replace: true });
  }, [currentVersion?.id, searchParams, setSearchParams, workbookParam]);

  const updateWorkbookParam = useCallback((versionId: string, replace = false) => {
    const next = new URLSearchParams(searchParams);
    next.set('workbook', versionId);
    setSearchParams(next, { replace });
  }, [searchParams, setSearchParams]);

  const handleVersionSelect = useCallback((versionId: string) => {
    handleVersionSwitch(versionId);
    updateWorkbookParam(versionId);
  }, [handleVersionSwitch, updateWorkbookParam]);

  const handleCreateDraft = useCallback(() => {
    handleNewDraft();
    const nextVersionId = useFeatureStore.getState().currentVersionId[projectId];
    if (nextVersionId) {
      updateWorkbookParam(nextVersionId);
    }
  }, [handleNewDraft, projectId, updateWorkbookParam]);

  const handleApproveCurrentVersion = useCallback(() => {
    if (!currentVersion) {
      return;
    }
    approveVersion(projectId, currentVersion.id);
    updateWorkbookParam(currentVersion.id);
  }, [approveVersion, currentVersion, projectId, updateWorkbookParam]);

  const handleDeleteCurrentDraft = useCallback(() => {
    const previousVersionId = currentVersion?.id;
    handleDeleteDraft();
    const nextState = useFeatureStore.getState();
    const nextVersionId = nextState.currentVersionId[projectId];

    if (nextVersionId && nextVersionId !== previousVersionId) {
      updateWorkbookParam(nextVersionId);
      return;
    }

    if (!nextVersionId) {
      const fallbackVersion = (nextState.versions[projectId] ?? [])[0];
      if (fallbackVersion) {
        setCurrentVersion(projectId, fallbackVersion.id);
        updateWorkbookParam(fallbackVersion.id);
      }
    }
  }, [currentVersion?.id, handleDeleteDraft, projectId, setCurrentVersion, updateWorkbookParam]);

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
          <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-6 pt-6">
            <FeatureApprovalGate
              isApproved={isApproved}
              isReadyForApproval={isReadyForApproval}
              panelError={panelError}
              agentError={renderProps.error}
              onApprove={handleApproveCurrentVersion}
              onNewDraft={handleCreateDraft}
            />

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {!renderProps.messages.some((m) => m.type === 'user') ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                    <Beaker className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Feature Engineering is ready</p>
                      <p className="text-xs text-muted-foreground">
                        Ask the agent to propose candidate features, validate risks, and produce
                        executable notebook steps.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <div className="space-y-4 py-4 pb-28">
                <ChatMessageRenderer
                  messages={renderProps.messages}
                  renderLifecycleCard={renderLifecycleCard}
                  activeTextMessageId={renderProps.activeTextMessageId}
                  activeThinkingMessageId={renderProps.activeThinkingMessageId}
                  hydratedMessageIds={renderProps.hydratedMessageIds}
                  onEditMessage={renderProps.onEditMessage}
                  onRevertToMessage={renderProps.onRevertToMessage}
                  editingMessageId={renderProps.editingMessageId}
                  turnDiffs={renderProps.turnDiffs}
                  isGenerating={renderProps.isGenerating}
                />
              </div>
            </div>

            <FeatureEngineeringFooter
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
              isApproved={isApproved}
              activeFeaturesCount={activeFeatures.length}
            />
          </div>
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
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete draft pipeline?</DialogTitle>
            <DialogDescription>
              {versions.length <= 1
                ? `Delete draft "${currentVersion?.name}"? A fresh blank draft will be created.`
                : `Delete draft "${currentVersion?.name}"? This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
