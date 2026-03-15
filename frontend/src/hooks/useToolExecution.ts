/**
 * useToolExecution - Manages tool-call history (calls + results) and provides
 * the mergeToolCalls utility for deduplicating tool call arrays.
 *
 * In the unified LangGraph architecture, tool execution happens backend-side.
 * This hook now only tracks the call/result history that flows through
 * `tool_executed` stream events so domain adapters can inspect it.
 */

import { useCallback, useRef } from 'react';
import type { ToolCall, ToolResult } from '@/types/llmUi';

// ── Merge utility ────────────────────────────────────────────────────────

export function mergeToolCalls(previous: ToolCall[], next: ToolCall[]): ToolCall[] {
  const merged = new Map(previous.map((call) => [call.id, call]));
  next.forEach((call) => merged.set(call.id, call));
  return Array.from(merged.values());
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useToolExecution() {
  const toolHistoryRef = useRef<{ calls: ToolCall[]; results: ToolResult[] }>({
    calls: [],
    results: [],
  });

  const resetToolHistory = useCallback(() => {
    toolHistoryRef.current = { calls: [], results: [] };
  }, []);

  return {
    toolHistoryRef,
    resetToolHistory,
    mergeToolCalls,
  };
}
