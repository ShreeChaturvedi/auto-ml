import { z } from 'zod';

import { ToolCallSchema, ToolNameSchema, type ToolCall, type ToolResult } from '../../types/llm.js';

const ToolResultSchema = z.object({
  id: z.string().min(1),
  tool: ToolNameSchema,
  output: z.unknown().optional(),
  error: z.string().optional()
});

const WorkflowHistorySchema = z.object({
  toolCalls: z.array(ToolCallSchema).default([]),
  toolResults: z.array(ToolResultSchema).default([])
});

export interface WorkflowHistory {
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
}

function toStableKey(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function dedupeToolCalls(toolCalls: ToolCall[]): ToolCall[] {
  const seen = new Set<string>();
  const deduped: ToolCall[] = [];

  for (const call of toolCalls) {
    const key = `${call.id}:${call.tool}:${toStableKey(call.args)}:${call.thoughtSignature ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(call);
  }

  return deduped;
}

function dedupeToolResults(toolResults: ToolResult[]): ToolResult[] {
  const seen = new Set<string>();
  const deduped: ToolResult[] = [];

  for (const result of toolResults) {
    const key = `${result.id}:${result.tool}:${toStableKey(result.output)}:${result.error ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(result);
  }

  return deduped;
}

export function loadWorkflowHistory(metadata?: Record<string, unknown>): WorkflowHistory {
  const parsed = WorkflowHistorySchema.safeParse(metadata?.history);
  if (!parsed.success) {
    return {
      toolCalls: [],
      toolResults: []
    };
  }

  return {
    toolCalls: dedupeToolCalls(parsed.data.toolCalls),
    toolResults: dedupeToolResults(parsed.data.toolResults)
  };
}

export function persistWorkflowHistory(
  metadata: Record<string, unknown> | undefined,
  history: WorkflowHistory
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    history: {
      toolCalls: dedupeToolCalls(history.toolCalls),
      toolResults: dedupeToolResults(history.toolResults)
    }
  };
}

export function hasWorkflowHistory(history: WorkflowHistory): boolean {
  return history.toolCalls.length > 0 || history.toolResults.length > 0;
}
