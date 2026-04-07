import type { ComponentType } from 'react';
import type { ChatMessage, ToolCall, ToolResult } from './llmUi';
import type { SavepointDiff } from './savepoint';
import type { ReasoningEffort } from '@/components/llm/modelOptions';
import type { PreprocessingControllerSummary } from './preprocessing';
import type {
  WorkflowArtifact,
  WorkflowPauseEvent,
  WorkflowState
} from './workflow';
import type { ContextualTip } from '@/components/ui/contextual-tip-bar';

export interface SuggestionPill {
  id: string;
  label: string;
  prompt: string;
}

export interface BuildRequestOptions {
  model: string;
  reasoningEffort: ReasoningEffort;
  continuation?: boolean;
}

export interface ToolHandlers {
  onCall?: (call: ToolCall) => void;
  onResult?: (call: ToolCall, result: ToolResult) => void;
}

export interface ToolExecutionRequest {
  datasetId?: string;
  executionMode?: 'agent' | 'user_approval';
}

export interface DomainAdapter {
  buildRequest: (
    prompt: string,
    toolCalls: ToolCall[] | undefined,
    toolResults: ToolResult[] | undefined,
    onEvent: (event: unknown) => void,
    signal: AbortSignal,
    options: BuildRequestOptions
  ) => Promise<void>;

  prepareToolCalls?: (toolCalls: ToolCall[]) => ToolCall[];
  onStreamError?: (message: string) => void;
  onStop?: (reason: string) => void;
  onControllerUpdate?: (controller: PreprocessingControllerSummary) => void;
  onWorkflowStateUpdate?: (state: WorkflowState) => void;
  onWorkflowPause?: (pause: WorkflowPauseEvent) => void;
  onWorkflowArtifactUpdate?: (artifact: WorkflowArtifact, state?: WorkflowState) => void;
  resolveToolExecutionRequest?: (toolCalls: ToolCall[]) => ToolExecutionRequest;
  preserveToolHistoryBetweenPrompts?: boolean;
  onRevert?: (turnIndex: number) => void;

  toolRegistry: Record<string, ToolHandlers>;
  toolUiRegistry: Record<string, ComponentType<{ call: ToolCall; result?: ToolResult }>>;

  suggestionProvider?: (messages: ChatMessage[], isGenerating: boolean) => SuggestionPill[];
  tipsProvider?: (messages: ChatMessage[], isGenerating: boolean) => ContextualTip[];
}

/** Props passed to the left-pane render callback in AgenticShell. */
export interface LeftPaneRenderProps {
  messages: ChatMessage[];
  isGenerating: boolean;
  error: string | null;
  submitPrompt?: (prompt: string) => void;
  activeTextMessageId: string | null;
  activeThinkingMessageId: string | null;
  hydratedMessageIds: Set<string>;
  // Savepoint props (all optional — phases that don't render revert need zero changes)
  onEditMessage?: (messageId: string) => void;
  onRevertToMessage?: (messageId: string) => void;
  editingMessageId?: string | null;
  turnDiffs?: ReadonlyMap<string, SavepointDiff>;
  /** Called when user clicks "Retry" on a retryable workflow error */
  onRetryWorkflow?: () => void;
};
