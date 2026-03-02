import type { ComponentType } from 'react';
import type { ChatMessage, ToolCall, ToolResult } from './llmUi';
import type { ThinkingLevel } from '@/lib/api/llm';

export interface SuggestionPill {
  id: string;
  label: string;
  prompt: string;
}

export interface BuildRequestOptions {
  model: string;
  enableThinking: boolean;
  thinkingLevel: ThinkingLevel;
}

export interface ToolHandlers {
  onCall?: (call: ToolCall) => void;
  onResult?: (call: ToolCall, result: ToolResult) => void;
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

  toolRegistry: Record<string, ToolHandlers>;
  toolUiRegistry: Record<string, ComponentType<{ call: ToolCall; result?: ToolResult }>>;

  suggestionProvider: (messages: ChatMessage[], isGenerating: boolean) => SuggestionPill[];
}
