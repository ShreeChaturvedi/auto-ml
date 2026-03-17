import { mergeToolCalls } from '@/hooks/useToolExecution';
import type { DomainAdapter } from '@/types/agentic';
import type { ChatMessage, ToolCall, ToolResult } from '@/types/llmUi';
import type { WorkflowState } from '@/types/workflow';

export function applyBackendToolExecution(
  call: ToolCall,
  result: ToolResult,
  domainAdapter: DomainAdapter,
  toolHistoryRef: React.MutableRefObject<{ calls: ToolCall[]; results: ToolResult[] }>,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  nextState?: WorkflowState
) {
  toolHistoryRef.current.calls = mergeToolCalls(toolHistoryRef.current.calls, [call]);
  toolHistoryRef.current.results = [...toolHistoryRef.current.results, result];

  domainAdapter.toolRegistry[call.tool]?.onCall?.(call);
  domainAdapter.toolRegistry[call.tool]?.onResult?.(call, result);

  setMessages((prev) => {
    const existingIndex = prev.findIndex((message) =>
      message.type === 'tool_call' && message.call.id === call.id
    );
    if (existingIndex === -1) {
      return [...prev, { id: `tool-${call.id}`, type: 'tool_call', call, result }];
    }

    return prev.map((message, index) =>
      index === existingIndex && message.type === 'tool_call'
        ? { ...message, call, result }
        : message
    );
  });

  if (nextState) {
    domainAdapter.onWorkflowStateUpdate?.(nextState);
  }
}

/**
 * Rebuild tool history from a set of messages.
 * Used after reverting to reconstruct the tool call/result history.
 */
export function rebuildToolHistoryFromMessages(
  messages: ChatMessage[],
  toolHistoryRef: React.MutableRefObject<{ calls: ToolCall[]; results: ToolResult[] }>
): void {
  const calls: ToolCall[] = [];
  const results: ToolResult[] = [];

  for (const msg of messages) {
    if (msg.type === 'tool_call') {
      calls.push(msg.call);
      if (msg.result) results.push(msg.result);
    }
  }

  toolHistoryRef.current = { calls, results };
}
