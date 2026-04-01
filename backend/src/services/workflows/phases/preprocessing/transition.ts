import type { ToolResult } from '../../../../types/llm.js';
import { asRecord } from '../../../../utils/typeCoercion.js';
import { getApprovalPauseDetails } from '../../turnState.js';

interface LatestToolOutcome {
  latestToolName?: string;
  latestToolSucceeded: boolean;
  latestOutputStatus?: string;
  requiresApproval: boolean;
}

function getLatestOutputStatus(result: ToolResult | undefined): string | undefined {
  const output = asRecord(result?.output);
  const step = asRecord(output?.step);
  return typeof output?.status === 'string'
    ? output.status
    : typeof step?.status === 'string'
      ? step.status
      : undefined;
}

function inferRequiresApproval(result: ToolResult | undefined): boolean {
  const output = asRecord(result?.output);
  const step = asRecord(output?.step);
  return output?.requiresApproval === true || step?.requiresApproval === true;
}

function getLatestToolOutcome(toolResults: ToolResult[]): LatestToolOutcome {
  const latest = toolResults.at(-1);
  if (!latest) {
    return {
      latestToolSucceeded: false,
      requiresApproval: false
    };
  }

  const latestOutputStatus = getLatestOutputStatus(latest);
  const executionFailed = latest.tool === 'execute_transformation_step' && latestOutputStatus === 'failed';
  const validationFailed = latest.tool === 'validate_step_result' && latestOutputStatus === 'failed';

  return {
    latestToolName: latest.tool,
    latestToolSucceeded: !latest.error && !executionFailed && !validationFailed,
    latestOutputStatus,
    requiresApproval: inferRequiresApproval(latest)
  };
}

export function inferPreprocessingActionNode(toolResults: ToolResult[]): string {
  const pendingApproval = getApprovalPauseDetails(toolResults) !== null;
  if (pendingApproval) {
    return 'await_approval';
  }

  const {
    latestToolName,
    latestToolSucceeded,
    latestOutputStatus,
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
      return latestToolSucceeded ? 'validate' : 'write_code';
    case 'validate_step_result':
      if (latestOutputStatus === 'awaiting_approval' || requiresApproval) {
        return 'await_approval';
      }
      return latestToolSucceeded ? 'commit' : 'validate';
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
