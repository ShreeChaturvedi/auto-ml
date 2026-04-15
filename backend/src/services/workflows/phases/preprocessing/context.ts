import type { ToolResult } from '../../../../types/llm.js';
import { asRecord } from '../../../../utils/typeCoercion.js';
import type { WorkflowGraphState } from '../../graphState.js';

export interface StepNotebookContext {
  runId: string;
  stepId: string;
  title?: string;
  code?: string;
  toolCallId?: string;
  version?: number;
  codeHash?: string;
  requiresApproval?: boolean;
  cellIds: string[];
}

export interface LatestRunCellContext {
  cellId?: string;
  status?: string;
  stdout?: string;
  stderr?: string;
}

export function extractLatestStepNotebookContext(
  state: WorkflowGraphState
): StepNotebookContext | null {
  const runId = state.controllerSummary?.runId;
  if (!runId) {
    return null;
  }

  // Only search the current turn's results so we don't pick up a previous
  // turn's step context (which would cause cell overwrites — see #201).
  const currentTurnResults = state.toolResultHistory.slice(state.turnStartToolCallCount);

  for (let index = currentTurnResults.length - 1; index >= 0; index -= 1) {
    const output = asRecord(currentTurnResults[index]?.output);
    const step = asRecord(output?.step);
    const stepId = typeof output?.stepId === 'string'
      ? output.stepId
      : typeof step?.stepId === 'string'
        ? step.stepId
        : null;
    if (!stepId) {
      continue;
    }

    const cellIds = Array.isArray(step?.cellIds)
      ? step.cellIds.filter((value: unknown): value is string => typeof value === 'string')
      : [];

    return {
      runId: runId as string,
      stepId,
      title: typeof step?.title === 'string' ? step.title : undefined,
      code: typeof step?.code === 'string' ? step.code : undefined,
      toolCallId: typeof step?.toolCallId === 'string' ? step.toolCallId : undefined,
      version: typeof step?.version === 'number' ? step.version : undefined,
      codeHash: typeof step?.codeHash === 'string' ? step.codeHash : undefined,
      requiresApproval: typeof step?.requiresApproval === 'boolean' ? step.requiresApproval : undefined,
      cellIds
    };
  }

  return null;
}

export function extractLatestCellId(toolResults: ToolResult[]): string | null {
  for (let index = toolResults.length - 1; index >= 0; index -= 1) {
    const result = toolResults[index];
    if (!['write_cell', 'edit_cell', 'run_cell'].includes(result.tool)) {
      continue;
    }
    const output = asRecord(result.output);
    if (typeof output?.cellId === 'string') {
      return output.cellId;
    }
    const cell = asRecord(output?.cell);
    if (typeof cell?.cellId === 'string') {
      return cell.cellId;
    }
    if (typeof cell?.id === 'string') {
      return cell.id;
    }
  }

  return null;
}

export function extractLatestRunCellContext(
  toolResults: ToolResult[]
): LatestRunCellContext | null {
  for (let index = toolResults.length - 1; index >= 0; index -= 1) {
    const result = toolResults[index];
    if (result.tool !== 'run_cell') {
      continue;
    }
    const output = asRecord(result.output);
    return {
      cellId: extractLatestCellId([result]) ?? undefined,
      status: typeof output?.status === 'string' ? output.status : undefined,
      stdout: typeof output?.stdout === 'string' ? output.stdout : undefined,
      stderr: typeof output?.stderr === 'string' ? output.stderr : undefined
    };
  }

  return null;
}
