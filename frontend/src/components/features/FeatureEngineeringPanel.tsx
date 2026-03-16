import { useCallback, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AgenticShell } from '@/components/agentic/AgenticShell';
import { ChatMessageRenderer } from '@/components/agentic/ChatMessageRenderer';
import { useLifecycleCards } from '@/components/agentic/useLifecycleCards';
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

import { cn } from '@/lib/utils';

import { Beaker } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

import type { ChatMessage } from '@/types/llmUi';

interface FeatureEngineeringPanelProps {
  projectId: string;
}

export function FeatureEngineeringPanel({ projectId }: FeatureEngineeringPanelProps) {
  const [searchParams] = useSearchParams();
  const initialVersionId = searchParams.get('tab') ?? undefined;
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
    canDeleteCurrentDraft,
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
    approveVersion
  } = useFeaturePipelineState(projectId);

  // Apply initial version/notebook from URL search params
  useEffect(() => {
    if (initialVersionId && initialVersionId !== currentVersion?.id) {
      handleVersionSwitch(initialVersionId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      sessionKey
    });
  }, [currentVersion?.id, datasetFiles, documentFiles, projectId, selectedDatasetFile, targetColumn]);

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
    <AgenticShell
      key={currentVersion?.id ?? 'feature-engineering-default'}
      projectId={projectId}
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
            onApprove={() => currentVersion && approveVersion(projectId, currentVersion.id)}
            onNewDraft={handleNewDraft}
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
          onVersionSwitch={handleVersionSwitch}
          onNewDraft={handleNewDraft}
          onRenameDraft={handleRenameDraft}
          onDeleteDraft={handleDeleteDraft}
          canRenameDraft={isCurrentVersionDraft}
          canDeleteDraft={canDeleteCurrentDraft}
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
  );
}
