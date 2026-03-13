import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AgenticShell } from '@/components/agentic/AgenticShell';
import { ToolIndicator } from '@/components/llm/ToolIndicator';
import { ProgressiveMessageText } from '@/components/llm/ProgressiveMessageText';
import { ThinkingBlock } from '@/components/training/ThinkingBlock';
import { createFeatureEngineeringAdapter } from './FeatureEngineeringAdapter';
import { FeatureApprovalGate } from './FeatureApprovalGate';
import { FeatureEngineeringFooter } from './FeatureEngineeringFooter';
import {
  FeatureEngineeringToolbarLeft,
  FeatureEngineeringToolbarRight
} from './FeatureEngineeringToolbar';
import { FeatureUiItemRenderer } from './FeatureUiItemRenderer';
import {
  HIDDEN_ACTIVITY_TOOLS,
  HIDDEN_LEGACY_ERROR_MESSAGES,
  hasUiItems,
  stripAssistantArtifacts
} from './featureEngineeringUtils';
import { useFeaturePipelineState } from './hooks/useFeaturePipelineState';
import { useNotebookStore } from '@/stores/notebookStore';

import { cn } from '@/lib/utils';

import { Beaker, Loader2, Sparkles } from 'lucide-react';
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
    return createFeatureEngineeringAdapter({
      projectId,
      datasetId: selectedDatasetFile?.metadata?.datasetId,
      targetColumn,
      datasetFiles,
      documentFiles
    });
  }, [datasetFiles, documentFiles, projectId, selectedDatasetFile, targetColumn]);

  const renderLeftPane = ({
    messages,
    isGenerating,
    error,
    activeTextMessageId,
    activeThinkingMessageId,
    hydratedMessageIds
  }: {
    messages: ChatMessage[];
    isGenerating: boolean;
    error: string | null;
    activeTextMessageId: string | null;
    activeThinkingMessageId: string | null;
    hydratedMessageIds: Set<string>;
  }) => {
    const toolMessages = messages.filter(
      (message): message is Extract<ChatMessage, { type: 'tool_call' }> =>
        message.type === 'tool_call' && !HIDDEN_ACTIVITY_TOOLS.has(message.call.tool)
    );

    const toolCalls = toolMessages.map((message) => message.call);
    const toolResults = toolMessages.flatMap((message) =>
      message.result ? [message.result] : []
    );

    const hasUserMessage = messages.some((message) => message.type === 'user');

    return (
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-6 pt-6">
        <FeatureApprovalGate
          isApproved={isApproved}
          isReadyForApproval={isReadyForApproval}
          panelError={panelError}
          agentError={error}
          onApprove={() => currentVersion && approveVersion(projectId, currentVersion.id)}
          onNewDraft={handleNewDraft}
        />

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {!hasUserMessage ? (
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

          <div className="space-y-4 py-4">
            {messages.map((message) => {
              if (message.type === 'user') {
                return (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-[80%] rounded-lg bg-primary/10 px-4 py-2 text-sm whitespace-pre-wrap">
                      {message.content}
                    </div>
                  </div>
                );
              }

              if (message.type === 'assistant_text') {
                const cleaned = stripAssistantArtifacts(message.content);
                if (!cleaned) return null;

                return (
                  <div key={message.id} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm">
                      <Sparkles className="h-3 w-3 text-emerald-600" />
                    </div>
                    <ProgressiveMessageText
                      messageId={message.id}
                      text={cleaned}
                      isLive={activeTextMessageId === message.id}
                      mode="markdown"
                      animateOnMount={!hydratedMessageIds.has(message.id)}
                      className="llm-assistant-markdown prose prose-sm max-w-none dark:prose-invert text-foreground"
                    />
                  </div>
                );
              }

              if (message.type === 'thinking') {
                return (
                  <div key={message.id} className="ml-9">
                    <ThinkingBlock
                      messageId={message.id}
                      content={message.content}
                      isComplete={message.isComplete}
                      isLive={activeThinkingMessageId === message.id}
                      animateOnMount={!hydratedMessageIds.has(message.id)}
                    />
                  </div>
                );
              }

              if (message.type === 'ui') {
                if (!hasUiItems(message.schema)) return null;

                return (
                  <div key={message.id} className="ml-9 space-y-4">
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

              if (message.type === 'tool_call') {
                if (HIDDEN_ACTIVITY_TOOLS.has(message.call.tool)) return null;

                return (
                  <div key={message.id} className="ml-9 text-xs text-muted-foreground">
                    <span className="font-mono">{message.call.tool}</span>
                    {message.result?.error ? (
                      <span className="ml-2 text-destructive">{message.result.error}</span>
                    ) : null}
                  </div>
                );
              }

              if (message.type === 'error') {
                if (HIDDEN_LEGACY_ERROR_MESSAGES.has(message.message)) return null;
                return (
                  <div
                    key={message.id}
                    className="ml-9 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                  >
                    {message.message}
                  </div>
                );
              }

              return null;
            })}

            <ToolIndicator toolCalls={toolCalls} results={toolResults} isRunning={isGenerating} />

            {isGenerating ? (
              <div className="ml-9 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Generating feature plan...
              </div>
            ) : null}
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
    );
  };

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
      renderLeftPane={renderLeftPane}
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
