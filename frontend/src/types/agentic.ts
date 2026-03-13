import type { ComponentType } from 'react';
import type { ChatMessage, ToolCall, ToolResult } from './llmUi';
import type { ReasoningEffort } from '@/components/llm/modelOptions';
import type { PreprocessingControllerSummary } from './preprocessing';

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
  resolveToolExecutionRequest?: (toolCalls: ToolCall[]) => ToolExecutionRequest;
  preserveToolHistoryBetweenPrompts?: boolean;

  toolRegistry: Record<string, ToolHandlers>;
  toolUiRegistry: Record<string, ComponentType<{ call: ToolCall; result?: ToolResult }>>;

  suggestionProvider: (messages: ChatMessage[], isGenerating: boolean) => SuggestionPill[];
}
