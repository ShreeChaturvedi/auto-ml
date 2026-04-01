import type { ToolResult } from '../../../../types/llm.js';
import { asRecord } from '../../../../utils/typeCoercion.js';
import { getToolResultPauseReason } from '../../turnState.js';

interface LatestToolOutcome {
  latestToolName?: string;
  latestToolSucceeded: boolean;
  requiresApproval: boolean;
}

function inferRequiresApproval(result: ToolResult | undefined): boolean {
  const output = asRecord(result?.output);
  const step = asRecord(output?.step);
  return output?.requiresApproval === true || step?.requiresApproval === true;
}

function inferPendingApproval(toolResults: ToolResult[]): boolean {
  return getToolResultPauseReason(toolResults.at(-1)) === 'awaiting_approval';
}

function getLatestToolOutcome(toolResults: ToolResult[]): LatestToolOutcome {
  const latest = toolResults.at(-1);
  if (!latest) {
    return {
      latestToolSucceeded: false,
      requiresApproval: false
    };
  }

  return {
    latestToolName: latest.tool,
    latestToolSucceeded: !latest.error,
    requiresApproval: inferRequiresApproval(latest)
  };
}

export function inferPreprocessingActionNode(toolResults: ToolResult[]): string {
  const pendingApproval = inferPendingApproval(toolResults);
  if (pendingApproval) {
    return 'await_approval';
  }

  const {
    latestToolName,
    latestToolSucceeded,
    requiresApproval
  } = getLatestToolOutcome(toolResults);
  if (!latestToolName) {
    return 'plan_step';
  }

  switch (latestToolName) {
    case 'propose_transformation_step':
      return latestToolSucceeded ? 'generate_code' : 'plan_step';
    case 'materialize_step_code':
      return latestToolSucceeded ? 'write_code' : 'generate_code';
    case 'write_cell':
    case 'edit_cell':
      return latestToolSucceeded ? 'write_code' : 'generate_code';
    case 'run_cell':
      return latestToolSucceeded ? 'record_execution' : 'write_code';
    case 'execute_transformation_step':
      return 'validate';
    case 'validate_step_result':
      return requiresApproval ? 'await_approval' : 'commit';
    case 'commit_transformation_step':
      return latestToolSucceeded ? 'summarize' : 'commit';
    case 'set_active_dataset':
    case 'profile_active_dataset':
    case 'list_project_datasets':
    case 'checkpoint_dataset':
    case 'list_cells':
    case 'read_cell':
      return 'plan_step';
    default:
      return 'plan_step';
  }
}

export function resolvePreprocessingNextStage(
  current: string,
  toolResults: ToolResult[]
): string | null {
  const nextStage = inferPreprocessingActionNode(toolResults);
  return nextStage !== current ? nextStage : null;
}
