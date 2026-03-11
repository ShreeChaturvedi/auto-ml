/**
 * useToolExecution - Encapsulates tool-call execution, result merging,
 * and pause-detection logic extracted from useAgenticLoop.
 *
 * Pure logic helper (no streaming state) — the agentic loop calls
 * `executePending` after receiving an envelope with tool_calls and
 * inspects the returned results to decide whether to re-stream.
 */

import { useCallback, useRef } from 'react';
import { executeToolCalls } from '@/lib/api/llm';
import type { ChatMessage, ToolCall, ToolResult } from '@/types/llmUi';
import type { DomainAdapter } from '@/types/agentic';
import { asRecordOrNull } from '@/lib/typeCoercion';
import { useNotebookStore } from '@/stores/notebookStore';

// ── Pause-detection helpers ──────────────────────────────────────────────

function hasAwaitingApprovalStatus(result: ToolResult): boolean {
  const output = asRecordOrNull(result.output);
  if (!output) return false;

  const status = typeof output.status === 'string' ? output.status : undefined;
  if (status === 'awaiting_approval') return true;

  const step = asRecordOrNull(output.step);
  return step?.status === 'awaiting_approval';
}

function shouldPauseAfterCommit(result: ToolResult): boolean {
  if (result.tool !== 'commit_transformation_step') return false;
  const output = asRecordOrNull(result.output);
  if (!output) return false;

  const reasonCode = typeof output.reasonCode === 'string' ? output.reasonCode : '';
  if (reasonCode === 'STEP_APPROVAL_REQUIRED' || reasonCode === 'STEP_APPROVAL_USER_REQUIRED') {
    return true;
  }

  const outputStatus = typeof output.status === 'string' ? output.status : undefined;
  const step = asRecordOrNull(output.step);
  const stepStatus = typeof step?.status === 'string' ? step.status : undefined;
  const status = outputStatus ?? stepStatus;

  return status === 'applied';
}

// ── Merge utility ────────────────────────────────────────────────────────

export function mergeToolCalls(previous: ToolCall[], next: ToolCall[]): ToolCall[] {
  const merged = new Map(previous.map((call) => [call.id, call]));
  next.forEach((call) => merged.set(call.id, call));
  return Array.from(merged.values());
}

// ── Hook ─────────────────────────────────────────────────────────────────

export interface ToolExecutionResult {
  results: ToolResult[];
  shouldPause: boolean;
}

export function useToolExecution(projectId?: string) {
  const toolHistoryRef = useRef<{ calls: ToolCall[]; results: ToolResult[] }>({
    calls: [],
    results: [],
  });

  const resetToolHistory = useCallback(() => {
    toolHistoryRef.current = { calls: [], results: [] };
  }, []);

  /**
   * Execute an array of tool calls, update message list with results,
   * fire domain adapter callbacks, and return whether the loop should pause.
   */
  const executePending = useCallback(
    async (
      toolCalls: ToolCall[],
      requestId: number,
      activeRequestIdRef: React.RefObject<number>,
      setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
      domainAdapter: DomainAdapter
    ): Promise<ToolExecutionResult | null> => {
      if (!projectId) return null;

      const activeNotebookId = useNotebookStore.getState().activeNotebookId ?? undefined;
      try {
        const { results } = await executeToolCalls(projectId, toolCalls, activeNotebookId);
        if (requestId !== activeRequestIdRef.current) return null;

        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.type === 'tool_call') {
              const result = results.find((r) => r.id === msg.call.id);
              if (result) {
                domainAdapter.toolRegistry[msg.call.tool]?.onResult?.(msg.call, result);
                return { ...msg, result };
              }
            }
            return msg;
          })
        );

        const mergedResults = [...toolHistoryRef.current.results, ...results];
        toolHistoryRef.current.results = mergedResults;

        const shouldPause =
          results.some(hasAwaitingApprovalStatus) || results.some(shouldPauseAfterCommit);

        return { results: mergedResults, shouldPause };
      } catch (toolError) {
        if (requestId !== activeRequestIdRef.current) return null;
        console.error('[AgenticLoop] Tool execution failed:', toolError);
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.type === 'tool_call' && toolCalls.some((tc: ToolCall) => tc.id === msg.call.id)) {
              const result = {
                id: msg.call.id,
                tool: msg.call.tool,
                error: toolError instanceof Error ? toolError.message : 'Tool execution failed',
              };
              domainAdapter.toolRegistry[msg.call.tool]?.onResult?.(msg.call, result);
              return { ...msg, result };
            }
            return msg;
          })
        );
        return null;
      }
    },
    [projectId]
  );

  return {
    toolHistoryRef,
    resetToolHistory,
    mergeToolCalls,
    executePending,
  };
}
