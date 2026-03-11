import type {
  PreprocessingRunState,
  PreprocessingRunRepository,
  StepState
} from '../../../repositories/preprocessingRunRepository.js';
import { asBoolean, asRecord, asString } from '../../../utils/typeCoercion.js';
import type {
  PreprocessingGraphState,
  PreprocessingLangGraphRuntime
} from '../langgraph/preprocessingRuntime.js';
import { nowIso } from '../preprocessingTools/helpers.js';

/* ------------------------------------------------------------------ */
/*  Shared constants                                                   */
/* ------------------------------------------------------------------ */

const PREPROCESSING_TOOL_NAMES = [
  'list_project_datasets',
  'set_active_dataset',
  'profile_active_dataset',
  'checkpoint_dataset',
  'register_derived_dataset',
  'list_checkpoints',
  'restore_checkpoint',
  'propose_transformation_step',
  'materialize_step_code',
  'execute_transformation_step',
  'validate_step_result',
  'commit_transformation_step',
  'detect_step_divergence',
  'reconcile_diverged_step'
] as const;

export type PreprocessingToolName = (typeof PREPROCESSING_TOOL_NAMES)[number];

export { PREPROCESSING_TOOL_NAMES };

const LANGGRAPH_STAGE_TOOLS = new Set<PreprocessingToolName>([
  'set_active_dataset',
  'profile_active_dataset',
  'propose_transformation_step',
  'materialize_step_code',
  'execute_transformation_step',
  'validate_step_result',
  'commit_transformation_step',
  'detect_step_divergence',
  'reconcile_diverged_step'
]);

const NON_TERMINAL_STEP_STATUSES = new Set<StepState['status']>([
  'pending',
  'running',
  'awaiting_approval',
  'diverged'
]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function toPreprocessingGraphState(value: unknown): PreprocessingGraphState | undefined {
  const candidate = asRecord(value);
  if (!candidate) {
    return undefined;
  }
  if (
    typeof candidate.runId !== 'string'
    || typeof candidate.projectId !== 'string'
    || typeof candidate.currentStage !== 'string'
    || typeof candidate.nextStage !== 'string'
  ) {
    return undefined;
  }

  return candidate as unknown as PreprocessingGraphState;
}

export function buildLangGraphPatch(
  toolName: PreprocessingToolName,
  args: Record<string, unknown>,
  result: { output?: unknown; error?: string }
): Partial<PreprocessingGraphState> | undefined {
  const output = asRecord(result.output);
  const step = asRecord(output?.step);
  const stepId = asString(step?.stepId) ?? asString(args.stepId);
  const failed = Boolean(result.error);

  switch (toolName) {
    case 'set_active_dataset':
    case 'profile_active_dataset': {
      const datasetId = asString(output?.datasetId) ?? asString(args.datasetId);
      return {
        currentStage: 'context_ready',
        nextStage: 'context_ready',
        contextReady: !failed,
        activeDatasetId: datasetId
      };
    }
    case 'propose_transformation_step':
      return {
        currentStage: 'plan_step',
        nextStage: 'plan_step',
        planReady: !failed,
        currentStepId: stepId
      };
    case 'materialize_step_code':
      return {
        currentStage: 'generate_code',
        nextStage: 'generate_code',
        codeReady: !failed,
        currentStepId: stepId
      };
    case 'execute_transformation_step': {
      const executeSucceeded = !failed && (asBoolean(step?.lastExecuteSucceeded) ?? asBoolean(args.succeeded) ?? true);
      return {
        currentStage: 'execute_code',
        nextStage: 'execute_code',
        executeSucceeded,
        currentStepId: stepId
      };
    }
    case 'validate_step_result': {
      const requiresApproval = asBoolean(step?.requiresApproval) ?? asBoolean(args.requiresApproval) ?? false;
      const validationPassed = !failed && (asBoolean(step?.lastValidateSucceeded) ?? true);
      return {
        currentStage: 'validate_outcome',
        nextStage: 'validate_outcome',
        validationPassed,
        requiresApproval,
        approvalDecision: requiresApproval ? 'pending' : 'approved',
        currentStepId: stepId
      };
    }
    case 'commit_transformation_step': {
      const approvedArg = asBoolean(args.approved);
      const reasonCode = asString(output?.reasonCode);
      return {
        currentStage: 'commit_or_revise',
        nextStage: 'commit_or_revise',
        approvalDecision: reasonCode === 'STEP_APPROVAL_REQUIRED' || reasonCode === 'STEP_APPROVAL_USER_REQUIRED'
          ? 'pending'
          : approvedArg === false
            ? 'rejected'
            : 'approved',
        currentStepId: stepId
      };
    }
    case 'detect_step_divergence': {
      const divergedStepIds = Array.isArray(output?.divergedStepIds) ? output.divergedStepIds : [];
      const hasDivergence = divergedStepIds.length > 0;
      return {
        currentStage: hasDivergence ? 'commit_or_revise' : 'validate_outcome',
        nextStage: hasDivergence ? 'commit_or_revise' : 'validate_outcome',
        currentStepId: stepId
      };
    }
    case 'reconcile_diverged_step':
      return {
        currentStage: 'commit_or_revise',
        nextStage: 'generate_code',
        currentStepId: stepId
      };
    default:
      return undefined;
  }
}

export function summarizeLangGraphState(state: PreprocessingGraphState) {
  return {
    runtime: 'langgraph',
    currentStage: state.currentStage,
    nextStage: state.nextStage,
    currentStepId: state.currentStepId,
    autoRepairAttempts: state.autoRepairAttempts,
    isCompleted: state.isCompleted,
    updatedAt: state.updatedAt
  };
}

function enforceLangGraphCompletionConsistency(
  run: PreprocessingRunState,
  graphState: PreprocessingGraphState
): PreprocessingGraphState {
  const hasIncompleteStep = Object.values(run.steps).some((step) => NON_TERMINAL_STEP_STATUSES.has(step.status));
  if (!hasIncompleteStep) {
    return graphState;
  }

  return {
    ...graphState,
    currentStage: 'commit_or_revise',
    nextStage: 'commit_or_revise',
    isCompleted: false,
    updatedAt: nowIso()
  };
}

/* ------------------------------------------------------------------ */
/*  Synchronizer factory + singleton                                   */
/* ------------------------------------------------------------------ */

export interface PreprocessingLangGraphSyncDependencies {
  runRepository: PreprocessingRunRepository;
  runtime: PreprocessingLangGraphRuntime;
}

export function createPreprocessingLangGraphSynchronizer(deps: PreprocessingLangGraphSyncDependencies) {
  return async function syncPreprocessingLangGraphState(
    projectId: string,
    toolName: PreprocessingToolName,
    args: Record<string, unknown>,
    result: { output?: unknown; error?: string }
  ): Promise<{ output?: unknown; error?: string }> {
    const output = asRecord(result.output);
    if (!output) {
      return result;
    }

    const runId = asString(output.runId) ?? asString(args.runId);
    if (!runId) {
      return result;
    }

    const run = await deps.runRepository.getById(runId);
    if (!run || run.projectId !== projectId) {
      return result;
    }
    let graphState = toPreprocessingGraphState(run.langGraphState);
    if (!graphState) {
      graphState = await deps.runtime.bootstrapRun({
        runId: run.runId,
        projectId,
        activeDatasetId: run.activeDatasetId
      });
    }

    if (LANGGRAPH_STAGE_TOOLS.has(toolName)) {
      const patch = buildLangGraphPatch(toolName, args, result);
      if (patch) {
        graphState = await deps.runtime.advanceRun(graphState, patch);
        graphState = enforceLangGraphCompletionConsistency(run, graphState);
        run.langGraphRuntime = 'langgraph';
        run.langGraphState = graphState as unknown as Record<string, unknown>;
        await deps.runRepository.save(run);
      }
    }

    output.langGraph = summarizeLangGraphState(graphState);
    return {
      ...result,
      output
    };
  };
}
