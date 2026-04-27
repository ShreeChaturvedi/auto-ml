import type { ToolResult } from '../../../types/llm.js';

import { classifyRunCellOutcome } from './runCellOutcome.js';
import type { PreprocessingTurnMode } from './turnClassification.js';

function isWorkflowThreadReference(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  return /^(?:[a-z]+-)*thread[-:]/i.test(value.trim());
}

export type PreprocessingControllerNode =
  | 'answer'
  | 'plan_step'
  | 'generate_code'
  | 'write_code'
  | 'record_execution'
  | 'validate'
  | 'await_approval'
  | 'commit'
  | 'summarize';

export interface LatestToolOutcome {
  latestToolName: string | undefined;
  latestToolSucceeded: boolean;
  latestOutputStatus: string | undefined;
}

export interface ControllerRouteState {
  turnMode: PreprocessingTurnMode;
  latestToolName?: string;
  latestToolSucceeded: boolean;
  latestOutputStatus?: string;
  hasPendingNotebookCells?: boolean;
}

export interface ControllerStageDefinition {
  allowedTools: string[];
  allowTextResponse: boolean;
  requireToolCall: boolean;
}

const STAGE_DEFINITIONS: Record<PreprocessingControllerNode, ControllerStageDefinition> = {
  answer: {
    allowedTools: [],
    allowTextResponse: true,
    requireToolCall: false
  },
  plan_step: {
    allowedTools: [
      'profile_active_dataset',
      'list_cells',
      'read_cell',
      'propose_transformation_step'
    ],
    allowTextResponse: false,
    requireToolCall: true
  },
  generate_code: {
    allowedTools: ['materialize_step_code'],
    allowTextResponse: false,
    requireToolCall: true
  },
  write_code: {
    allowedTools: [
      'write_cell',
      'edit_cell',
      'run_cell',
      'list_cells',
      'read_cell'
    ],
    allowTextResponse: false,
    requireToolCall: true
  },
  record_execution: {
    allowedTools: [
      'execute_transformation_step',
      'list_cells',
      'read_cell'
    ],
    allowTextResponse: false,
    requireToolCall: true
  },
  validate: {
    allowedTools: [
      'validate_step_result',
      'profile_active_dataset',
      'read_cell'
    ],
    allowTextResponse: false,
    requireToolCall: true
  },
  await_approval: {
    allowedTools: [],
    allowTextResponse: true,
    requireToolCall: false
  },
  commit: {
    allowedTools: [
      'commit_transformation_step',
      'checkpoint_dataset'
    ],
    allowTextResponse: false,
    requireToolCall: true
  },
  summarize: {
    allowedTools: [],
    allowTextResponse: true,
    requireToolCall: false
  }
};

export function inferApprovalDecision(prompt?: string): 'approve' | 'reject' | null {
  const normalized = prompt?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.includes('?')) {
    return null;
  }

  if (/\b(reject|decline|deny|do not apply|don't apply|skip it|cancel it|do not commit|don't commit|do not proceed|don't proceed|stop)\b/.test(normalized)) {
    return 'reject';
  }

  if (/\b(approve|approved|accept|apply|commit|go ahead|proceed|yes|looks good|ship it)\b/.test(normalized)) {
    return 'approve';
  }

  return null;
}

export function inferPendingApproval(toolResults?: ToolResult[]): boolean {
  const latest = toolResults?.at(-1);
  if (!latest?.output || typeof latest.output !== 'object' || Array.isArray(latest.output)) {
    return false;
  }

  const output = latest.output as Record<string, unknown>;
  const step = output.step && typeof output.step === 'object' && !Array.isArray(output.step)
    ? output.step as Record<string, unknown>
    : null;
  const reasonCode = typeof output.reasonCode === 'string' ? output.reasonCode : undefined;
  const outputStatus = typeof output.status === 'string' ? output.status : undefined;
  const stepStatus = typeof step?.status === 'string' ? step.status : undefined;
  const status = outputStatus ?? stepStatus;
  return status === 'awaiting_approval'
    || reasonCode === 'STEP_APPROVAL_REQUIRED'
    || reasonCode === 'STEP_APPROVAL_USER_REQUIRED';
}

export function getLatestRunId(toolResults?: ToolResult[]): string | undefined {
  for (let index = (toolResults?.length ?? 0) - 1; index >= 0; index -= 1) {
    const output = toolResults?.[index]?.output;
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      continue;
    }
    const runId = (output as Record<string, unknown>).runId;
    if (typeof runId === 'string' && runId.trim() && !isWorkflowThreadReference(runId)) {
      return runId.trim();
    }
  }

  return undefined;
}

export function getLatestStepId(toolResults?: ToolResult[]): string | undefined {
  for (let index = (toolResults?.length ?? 0) - 1; index >= 0; index -= 1) {
    const output = toolResults?.[index]?.output;
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      continue;
    }
    const outputRecord = output as Record<string, unknown>;
    if (typeof outputRecord.stepId === 'string' && outputRecord.stepId.trim()) {
      return outputRecord.stepId.trim();
    }
    const step = outputRecord.step;
    if (step && typeof step === 'object' && !Array.isArray(step)) {
      const stepId = (step as Record<string, unknown>).stepId;
      if (typeof stepId === 'string' && stepId.trim()) {
        return stepId.trim();
      }
    }
  }

  return undefined;
}

export function getLatestToolOutcome(toolResults?: ToolResult[]): LatestToolOutcome {
  const latest = toolResults?.at(-1);
  if (!latest) {
    return {
      latestToolName: undefined,
      latestToolSucceeded: false,
      latestOutputStatus: undefined
    };
  }

  const output = latest.output && typeof latest.output === 'object' && !Array.isArray(latest.output)
    ? latest.output as Record<string, unknown>
    : null;
  const step = output?.step && typeof output.step === 'object' && !Array.isArray(output.step)
    ? output.step as Record<string, unknown>
    : null;
  const outputStatus = typeof output?.status === 'string'
    ? output.status
    : typeof step?.status === 'string'
      ? step.status
      : undefined;
  const runCellOutcome = latest.tool === 'run_cell'
    ? classifyRunCellOutcome({
        status: outputStatus,
        error: typeof output?.error === 'string' ? output.error : latest.error
      })
    : null;
  const executionFailed = latest.tool === 'execute_transformation_step' && outputStatus === 'failed';
  const validationFailed = latest.tool === 'validate_step_result' && outputStatus === 'failed';

  return {
    latestToolName: latest.tool,
    latestToolSucceeded: latest.tool === 'run_cell'
      ? runCellOutcome === 'success'
      : !latest.error && !executionFailed && !validationFailed,
    latestOutputStatus: outputStatus ?? (runCellOutcome === 'indeterminate' ? 'indeterminate' : undefined)
  };
}

export function getControllerStageDefinition(node: PreprocessingControllerNode): ControllerStageDefinition {
  return STAGE_DEFINITIONS[node] ?? STAGE_DEFINITIONS.answer;
}

export function inferActionNode(state: ControllerRouteState): PreprocessingControllerNode {
  switch (state.latestToolName) {
    case 'propose_transformation_step':
      return state.latestToolSucceeded ? 'generate_code' : 'plan_step';
    case 'materialize_step_code':
      return state.latestToolSucceeded ? 'write_code' : 'generate_code';
    case 'write_cell':
    case 'edit_cell':
      return state.latestToolSucceeded ? 'write_code' : 'generate_code';
    case 'run_cell':
      return state.latestToolSucceeded && state.hasPendingNotebookCells
        ? 'write_code'
        : 'record_execution';
    case 'execute_transformation_step':
      return state.latestToolSucceeded ? 'validate' : 'generate_code';
    case 'validate_step_result':
      return state.latestToolSucceeded ? 'commit' : 'validate';
    case 'commit_transformation_step':
      return state.latestToolSucceeded ? 'summarize' : 'commit';
    default:
      return 'plan_step';
  }
}

export function classifyControllerRoute(state: ControllerRouteState): PreprocessingControllerNode {
  return state.turnMode === 'answer_only' ? 'answer' : inferActionNode(state);
}
