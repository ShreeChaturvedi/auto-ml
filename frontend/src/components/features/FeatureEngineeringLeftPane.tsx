import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { ChatMessageRenderer } from '@/components/agentic/ChatMessageRenderer';
import { FeatureApprovalGate } from './FeatureApprovalGate';
import { FeatureEngineeringFooter } from './FeatureEngineeringFooter';
import { AlertTriangle } from 'lucide-react';
import { ToolsEmptyIllustration } from '@/components/ui/illustrations';
import { Card, CardContent } from '@/components/ui/card';
import {
  captureFeatureLeftPaneScrollTop,
  clearFeatureLeftPaneScrollTop,
  peekFeatureLeftPaneScrollTop
} from './featureEngineeringUtils';

import type { ChatMessage } from '@/types/llmUi';
import type { LeftPaneRenderProps } from '@/types/agentic';
import type { ReadinessReport, FeatureSpec } from '@/types/feature';

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getToolMessageFeatureId(message: Extract<ChatMessage, { type: 'tool_call' }>): string | undefined {
  const output = getRecord(message.result?.output);
  const args = getRecord(message.call.args);
  const metadata = getRecord(args?.metadata);
  return typeof output?.featureId === 'string'
    ? output.featureId
    : typeof args?.featureId === 'string'
      ? args.featureId
      : typeof metadata?.featureId === 'string'
        ? metadata.featureId
        : undefined;
}

function getToolMessageCellId(message: Extract<ChatMessage, { type: 'tool_call' }>): string | undefined {
  const output = getRecord(message.result?.output);
  const args = getRecord(message.call.args);
  const cell = getRecord(output?.cell);
  return typeof output?.cellId === 'string'
    ? output.cellId
    : typeof cell?.cellId === 'string'
      ? cell.cellId
      : typeof args?.cellId === 'string'
        ? args.cellId
        : undefined;
}

function isSuccessfulToolMessage(message: Extract<ChatMessage, { type: 'tool_call' }>): boolean {
  if (!message.result || message.result.error) {
    return false;
  }

  const output = getRecord(message.result.output);
  if (output?.succeeded === false) {
    return false;
  }

  const status = typeof output?.status === 'string' ? output.status.toLowerCase() : '';
  return !['failed', 'error', 'timeout', 'rejected'].includes(status);
}

function suppressDuplicateToolCallMessages(messages: ChatMessage[]): ChatMessage[] {
  const lastIndexByCallId = new Map<string, number>();
  messages.forEach((message, index) => {
    if (message.type === 'tool_call') {
      lastIndexByCallId.set(message.call.id, index);
    }
  });

  return messages.filter((message, index) => (
    message.type !== 'tool_call' || lastIndexByCallId.get(message.call.id) === index
  ));
}

function suppressRedundantFeatureLifecycleMessages(messages: ChatMessage[]): ChatMessage[] {
  const successfulFeatureWriteIds = new Set<string>();
  const successfulFeatureRunIds = new Set<string>();
  const successfulRunCellIds = new Set<string>();

  for (const message of messages) {
    if (message.type !== 'tool_call' || !isSuccessfulToolMessage(message)) {
      continue;
    }

    const featureId = getToolMessageFeatureId(message);
    if (message.call.tool === 'write_cell' && featureId) {
      successfulFeatureWriteIds.add(featureId);
    }

    if (message.call.tool === 'run_cell') {
      const cellId = getToolMessageCellId(message);
      if (cellId) {
        successfulRunCellIds.add(cellId);
      }
      if (featureId) {
        successfulFeatureRunIds.add(featureId);
      }
    }
  }

  return messages.filter((message) => {
    if (message.type !== 'tool_call' || !isSuccessfulToolMessage(message)) {
      return true;
    }

    const featureId = getToolMessageFeatureId(message);
    if (message.call.tool === 'materialize_feature_code' && featureId) {
      return !successfulFeatureWriteIds.has(featureId);
    }

    if (message.call.tool === 'execute_feature') {
      const cellId = getToolMessageCellId(message);
      if (cellId && successfulRunCellIds.has(cellId)) {
        return false;
      }
      return !(featureId && successfulFeatureRunIds.has(featureId));
    }

    return true;
  });
}

interface FeatureEngineeringLeftPaneProps {
  renderProps: LeftPaneRenderProps;
  activeFeaturesCount: number;
  implementedFeaturesCount: number;
  currentStage: string | null;
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
  renderLifecycleCard: (message: ChatMessage) => ReactNode | null;
}

export function FeatureEngineeringLeftPane({
  renderProps,
  activeFeaturesCount,
  implementedFeaturesCount,
  currentStage,
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
  renderLifecycleCard,
}: FeatureEngineeringLeftPaneProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef(0);
  const pendingRestoreScrollTopRef = useRef<number | null>(null);
  const restoreFrameRef = useRef<number | null>(null);
  const restoreTimeoutRef = useRef<number | null>(null);
  const restoreIntervalRef = useRef<number | null>(null);
  const restoreIntervalStopTimeoutRef = useRef<number | null>(null);
  const activeFeatureSignature = useMemo(
    () => activeFeatures
      .map((feature) => `${feature.id}:${feature.featureName}:${feature.method}`)
      .sort()
      .join('|'),
    [activeFeatures]
  );
  const displayedMessages = useMemo(() => {
    const hasFeatureSuggestionUi = renderProps.messages.some((message) => {
      if (message.type !== 'ui') {
        return false;
      }
      return message.schema.sections.some((section) =>
        section.items.some((item) => item.type === 'feature_suggestion')
      );
    });

    const withoutDuplicateProposals = hasFeatureSuggestionUi
      ? renderProps.messages.filter((message) =>
      !(message.type === 'tool_call' && message.call.tool === 'propose_feature')
      )
      : renderProps.messages;

    return suppressRedundantFeatureLifecycleMessages(
      suppressDuplicateToolCallMessages(withoutDuplicateProposals)
    );
  }, [renderProps.messages]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const pendingScrollTop = peekFeatureLeftPaneScrollTop();
    if (pendingScrollTop !== null) {
      pendingRestoreScrollTopRef.current = pendingScrollTop;
    } else if (lastScrollTopRef.current > 0) {
      pendingRestoreScrollTopRef.current = lastScrollTopRef.current;
    }

    const restoreTarget = pendingRestoreScrollTopRef.current;
    if (restoreTarget === null) {
      return;
    }

    if (restoreFrameRef.current !== null) {
      cancelAnimationFrame(restoreFrameRef.current);
      restoreFrameRef.current = null;
    }
    if (restoreTimeoutRef.current !== null) {
      window.clearTimeout(restoreTimeoutRef.current);
      restoreTimeoutRef.current = null;
    }
    if (restoreIntervalRef.current !== null) {
      window.clearInterval(restoreIntervalRef.current);
      restoreIntervalRef.current = null;
    }
    if (restoreIntervalStopTimeoutRef.current !== null) {
      window.clearTimeout(restoreIntervalStopTimeoutRef.current);
      restoreIntervalStopTimeoutRef.current = null;
    }

    let attemptCount = 0;
    let cancelled = false;

    const applyRestore = () => {
      if (cancelled) {
        return;
      }

      const currentContainer = scrollContainerRef.current;
      if (!currentContainer) {
        return;
      }

      currentContainer.scrollTop = restoreTarget;
      lastScrollTopRef.current = restoreTarget;
      attemptCount += 1;

      if (Math.abs(currentContainer.scrollTop - restoreTarget) < 4) {
        pendingRestoreScrollTopRef.current = null;
        clearFeatureLeftPaneScrollTop();
        restoreFrameRef.current = null;
        return;
      }

      if (attemptCount < 6) {
        restoreFrameRef.current = requestAnimationFrame(applyRestore);
      } else {
        restoreFrameRef.current = null;
      }
    };

    applyRestore();
    restoreTimeoutRef.current = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      const currentContainer = scrollContainerRef.current;
      if (!currentContainer) {
        return;
      }
      currentContainer.scrollTop = restoreTarget;
      lastScrollTopRef.current = restoreTarget;
      if (Math.abs(currentContainer.scrollTop - restoreTarget) < 4) {
        pendingRestoreScrollTopRef.current = null;
        clearFeatureLeftPaneScrollTop();
      }
      restoreTimeoutRef.current = null;
    }, 120);
    restoreIntervalRef.current = window.setInterval(() => {
      if (cancelled) {
        return;
      }
      const currentContainer = scrollContainerRef.current;
      if (!currentContainer) {
        return;
      }
      currentContainer.scrollTop = restoreTarget;
      lastScrollTopRef.current = restoreTarget;
      if (Math.abs(currentContainer.scrollTop - restoreTarget) < 4) {
        pendingRestoreScrollTopRef.current = null;
        clearFeatureLeftPaneScrollTop();
      }
    }, 50);
    restoreIntervalStopTimeoutRef.current = window.setTimeout(() => {
      if (restoreIntervalRef.current !== null) {
        window.clearInterval(restoreIntervalRef.current);
        restoreIntervalRef.current = null;
      }
      restoreIntervalStopTimeoutRef.current = null;
    }, 1000);

    return () => {
      cancelled = true;
      if (restoreFrameRef.current !== null) {
        cancelAnimationFrame(restoreFrameRef.current);
        restoreFrameRef.current = null;
      }
      if (restoreTimeoutRef.current !== null) {
        window.clearTimeout(restoreTimeoutRef.current);
        restoreTimeoutRef.current = null;
      }
      if (restoreIntervalRef.current !== null) {
        window.clearInterval(restoreIntervalRef.current);
        restoreIntervalRef.current = null;
      }
      if (restoreIntervalStopTimeoutRef.current !== null) {
        window.clearTimeout(restoreIntervalStopTimeoutRef.current);
        restoreIntervalStopTimeoutRef.current = null;
      }
    };
  }, [activeFeatureSignature, renderProps.messages.length, renderProps.isGenerating]);

  const implementationPrompt =
    activeFeaturesCount === 1
      ? 'Implement the enabled feature in the notebook for this draft, run the cells, validate the result, and register it.'
      : 'Implement the enabled features in the notebook for this draft, run the cells in order, validate each result, and register them.';

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-6 pt-6">
      <FeatureApprovalGate
        activeFeaturesCount={activeFeaturesCount}
        implementedFeaturesCount={implementedFeaturesCount}
        isGenerating={renderProps.isGenerating || currentStage === 'execute_feature'}
        panelError={panelError}
        agentError={renderProps.error}
        onImplement={() => renderProps.submitPrompt?.(implementationPrompt)}
      />

      <div
        ref={scrollContainerRef}
        data-testid="fe-left-pane-scroll"
        data-fe-left-pane-scroll="true"
        className="min-h-0 flex-1 overflow-y-auto pr-1"
        style={{ overflowAnchor: 'none' }}
        onScroll={(event) => {
          lastScrollTopRef.current = event.currentTarget.scrollTop;
          captureFeatureLeftPaneScrollTop(event.currentTarget.scrollTop);
          if (
            pendingRestoreScrollTopRef.current !== null
            && Math.abs(event.currentTarget.scrollTop - pendingRestoreScrollTopRef.current) < 4
          ) {
            pendingRestoreScrollTopRef.current = null;
          }
        }}
      >
        {!renderProps.messages.some((m: ChatMessage) => m.type === 'user') ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center empty-state-enter">
              <ToolsEmptyIllustration className="text-muted-foreground" />
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
            messages={displayedMessages}
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
          activeFeaturesCount={activeFeatures.length}
        />
      )}
    </div>
  );
}
