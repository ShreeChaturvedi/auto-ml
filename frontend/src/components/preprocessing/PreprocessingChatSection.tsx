import type { ChatMessage } from '@/types/llmUi';
import { Card, CardContent } from '@/components/ui/card';
import { ToolIndicator } from '@/components/llm/ToolIndicator';
import { ProgressiveMessageText } from '@/components/llm/ProgressiveMessageText';
import { ThinkingBlock } from '@/components/training/ThinkingBlock';
import { TransformationTimeline } from './TransformationTimeline';
import { sanitizeAssistantText } from '@/lib/llm/sanitizeAssistantText';
import { AlertTriangle, Wand2 } from 'lucide-react';
import type { TransformationEvent } from '@/types/preprocessing';
import type { ReplayCompatibilityReport } from '@/stores/preprocessingStore';

const HIDDEN_ACTIVITY_TOOLS = new Set([
  'set_active_dataset',
  'list_project_datasets',
  'profile_active_dataset'
]);

export interface PreprocessingChatSectionProps {
  messages: ChatMessage[];
  isGenerating: boolean;
  error: string | null;
  activeTextMessageId: string | null;
  activeThinkingMessageId: string | null;
  hydratedMessageIds: Set<string>;
  storeError: string | null;
  sortedTimeline: TransformationEvent[];
  replayReport: ReplayCompatibilityReport | null;
  divergedAccentClassName: string;
  projectAccentBorderClass: string;
  onApproveStep: (stepId: string) => void;
  onRejectStep: (stepId: string) => void;
}

export function PreprocessingChatSection({
  messages,
  isGenerating,
  error: shellError,
  activeTextMessageId,
  activeThinkingMessageId,
  hydratedMessageIds,
  storeError,
  sortedTimeline,
  replayReport,
  divergedAccentClassName,
  projectAccentBorderClass,
  onApproveStep,
  onRejectStep
}: PreprocessingChatSectionProps) {
  const visibleActivityMessages = messages.filter((message) => (
    message.type !== 'tool_call' || !HIDDEN_ACTIVITY_TOOLS.has(message.call.tool)
  ));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-6 pb-28">
      {storeError || shellError ? (
        <Card className="border-red-300 bg-red-50/80">
          <CardContent className="flex items-center gap-2 p-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" />
            {storeError || shellError}
          </CardContent>
        </Card>
      ) : null}

      {visibleActivityMessages.length > 0 ? (
        <div className="space-y-2 mt-6">
          <h2 className="text-sm font-semibold">Agent Activity</h2>
          {visibleActivityMessages.map((message) => {
            if (message.type === 'user') {
              return (
                <div key={message.id} className="flex flex-col items-end">
                  <div className="rounded-lg bg-primary/10 px-4 py-2 text-sm max-w-[80%] whitespace-pre-wrap">
                    {message.content}
                  </div>
                </div>
              );
            }

            if (message.type === 'assistant_text') {
              const cleaned = sanitizeAssistantText(message.content);
              if (!cleaned) return null;
              return (
                <div key={message.id} className="flex items-start gap-3 w-full">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm">
                    <Wand2 className="h-3 w-3 text-emerald-600" />
                  </div>
                  <ProgressiveMessageText
                    messageId={message.id}
                    text={cleaned}
                    isLive={activeTextMessageId === message.id}
                    mode="markdown"
                    animateOnMount={!hydratedMessageIds.has(message.id)}
                    className="llm-assistant-markdown prose prose-sm dark:prose-invert mt-0.5 max-w-none text-foreground break-words prose-p:leading-relaxed prose-pre:p-0"
                  />
                </div>
              );
            }

            if (message.type === 'thinking') {
              return (
                <ThinkingBlock
                  key={message.id}
                  messageId={message.id}
                  content={message.content}
                  isComplete={message.isComplete}
                  isLive={activeThinkingMessageId === message.id}
                  animateOnMount={!hydratedMessageIds.has(message.id)}
                />
              );
            }

            if (message.type === 'tool_call') {
              return (
                <ToolIndicator
                  key={message.id}
                  toolCalls={[message.call]}
                  results={message.result ? [message.result] : []}
                  isRunning={!message.result}
                  autoExpandPreviewTools
                />
              );
            }

            return null;
          })}
        </div>
      ) : null}

      <TransformationTimeline
        sortedTimeline={sortedTimeline}
        replayReport={replayReport}
        divergedAccentClassName={divergedAccentClassName}
        projectAccentBorderClass={projectAccentBorderClass}
        isGenerating={isGenerating}
        onApproveStep={onApproveStep}
        onRejectStep={onRejectStep}
      />
    </div>
  );
}
