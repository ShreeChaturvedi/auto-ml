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
