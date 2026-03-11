/**
 * useToolCallProcessor - Manages tool call result application and fallback completion.
 *
 * Extracted from ChatPanel to isolate the logic that:
 * - Marks tool calls as completed with a fallback status
 * - Applies real tool results to the matching tool_call messages
 */

import { useCallback } from 'react';
import type { ChatMessage, ToolCall, ToolResult } from '@/types/llmUi';

interface UseToolCallProcessorOptions {
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

export function useToolCallProcessor({ setMessages }: UseToolCallProcessorOptions) {
  /** Mark tool calls as completed with a generic status when no real result arrived. */
  const markToolsCompleteFallback = useCallback(
    (toolCalls: ToolCall[]) => {
      const toolIds = new Set(toolCalls.map((tc) => tc.id));
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.type === 'tool_call' && toolIds.has(msg.call.id) && !msg.result) {
            return {
              ...msg,
              result: {
                id: msg.call.id,
                tool: msg.call.tool,
                output: { status: 'completed' }
              }
            };
          }
          return msg;
        })
      );
    },
    [setMessages]
  );

  /** Apply real tool execution results to matching tool_call messages. */
  const applyToolResults = useCallback(
    (results: ToolResult[]) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.type !== 'tool_call') return msg;
          const result = results.find((entry) => entry.id === msg.call.id);
          return result ? { ...msg, result } : msg;
        })
      );
    },
    [setMessages]
  );

  return { markToolsCompleteFallback, applyToolResults };
}
