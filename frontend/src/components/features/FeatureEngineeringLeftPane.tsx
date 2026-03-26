import type { ReactNode } from 'react';
import { ChatMessageRenderer } from '@/components/agentic/ChatMessageRenderer';
import { FeatureApprovalGate } from './FeatureApprovalGate';
import { FeatureEngineeringFooter } from './FeatureEngineeringFooter';
import { AlertTriangle, Beaker } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

import type { ChatMessage } from '@/types/llmUi';
import type { LeftPaneRenderProps } from '@/types/agentic';
import type { ReadinessReport, FeatureSpec } from '@/types/feature';

interface FeatureEngineeringLeftPaneProps {
  renderProps: LeftPaneRenderProps;
  isApproved: boolean;
  isReadyForApproval: boolean;
  panelError: string | null;
  readinessReportUnlocked: boolean;
  isReadinessExpanded: boolean;
  onToggleReadiness: () => void;
  readinessReport: ReadinessReport | null;
  outputName: string;
  onOutputNameChange: (name: string) => void;
  outputFormat: 'csv' | 'json' | 'xlsx';
  onOutputFormatChange: (format: 'csv' | 'json' | 'xlsx') => void;
  onApplyFeatures: () => Promise<void>;
  applyStatus: 'idle' | 'loading' | 'success' | 'error';
  applyMessage: string | null;
  activeFeatures: FeatureSpec[];
  onApprove: () => void;
  onNewDraft: () => void;
  renderLifecycleCard: (message: ChatMessage) => ReactNode | null;
}

export function FeatureEngineeringLeftPane({
  renderProps,
  isApproved,
  isReadyForApproval,
  panelError,
  readinessReportUnlocked,
  isReadinessExpanded,
  onToggleReadiness,
  readinessReport,
  outputName,
  onOutputNameChange,
  outputFormat,
  onOutputFormatChange,
  onApplyFeatures,
  applyStatus,
  applyMessage,
  activeFeatures,
  onApprove,
  onNewDraft,
  renderLifecycleCard,
}: FeatureEngineeringLeftPaneProps) {
  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-6 pt-6">
      <FeatureApprovalGate
        isApproved={isApproved}
        isReadyForApproval={isReadyForApproval}
        panelError={panelError}
        agentError={renderProps.error}
        onApprove={onApprove}
        onNewDraft={onNewDraft}
      />

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {!renderProps.messages.some((m: ChatMessage) => m.type === 'user') ? (
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

        {!renderProps.isGenerating && activeFeatures.length === 0 && renderProps.messages.some((m: ChatMessage) => m.type === 'assistant_text') && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm dark:border-amber-800 dark:bg-amber-950/30">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-200">No features created</p>
              <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                The feature engineering workflow completed without registering any features.
                Continue the conversation to build features, or proceed to training with the raw dataset.
              </p>
            </div>
          </div>
        )}

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
            onRetryWorkflow={renderProps.onRetryWorkflow}
          />
        </div>
      </div>

      {readinessReport && (
        <FeatureEngineeringFooter
          readinessReportUnlocked={readinessReportUnlocked}
          isReadinessExpanded={isReadinessExpanded}
          onToggleReadiness={onToggleReadiness}
          readinessReport={readinessReport}
          outputName={outputName}
          onOutputNameChange={onOutputNameChange}
          outputFormat={outputFormat}
          onOutputFormatChange={onOutputFormatChange}
          onApplyFeatures={onApplyFeatures}
          applyStatus={applyStatus}
          applyMessage={applyMessage}
          isApproved={isApproved}
          activeFeaturesCount={activeFeatures.length}
        />
      )}
    </div>
  );
}
