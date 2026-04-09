import { appLogger } from '../../../logging/logger.js';
import type { ToolContext, ToolResult } from '../../workflows/phaseConfig.js';
import type { WorkflowRunState, WorkflowTurnRequest } from '../../workflows/types.js';

/**
 * Detect workflow-thread-shaped identifiers (e.g. "thread-<uuid>",
 * "prep-thread:..."). Mirrors the regex used by
 * `services/llm/preprocessing/controllerRouting.ts` so the two call sites
 * stay in sync. Exported for tests and for symmetry with other lenient
 * id-resolution helpers.
 */
export function isWorkflowThreadReference(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^(?:[a-z]+-)*thread[-:]/i.test(value.trim());
}

/**
 * Context passed to every training tool handler.
 */
export interface TrainingToolContext {
  projectId: string;
  toolCallId: string | undefined;
  args: Record<string, unknown>;
  datasetId?: string;
  notebookId?: string;
  run: WorkflowRunState;
  turn: WorkflowTurnRequest;
}

export type TrainingToolResult = ToolResult;

export type TrainingToolHandler = (ctx: TrainingToolContext) => Promise<TrainingToolResult>;

/**
 * Tracks the state of a single experiment within a training run.
 */
export interface ExperimentState {
  experimentId: string;
  experimentName: string;
  modelType: string;
  status: 'configured' | 'proposed' | 'training' | 'evaluated' | 'registered' | 'failed';
  metrics?: Record<string, unknown>;
  hyperparameters?: Record<string, unknown>;
  splitStrategy?: string;
  targetColumn?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convert a PhaseConfig ToolContext into a TrainingToolContext.
 */
export function toTrainingToolContext(ctx: ToolContext): TrainingToolContext {
  return {
    projectId: ctx.projectId,
    toolCallId: ctx.toolCallId,
    args: ctx.args,
    datasetId: ctx.turn.datasetId,
    notebookId: ctx.turn.notebookId,
    run: ctx.run,
    turn: ctx.turn
  };
}

/**
 * Resolve experiment from run metadata. Shared by all handlers that
 * need an existing experiment.
 *
 * Lenient fallback (narrow, targeted): if the caller supplies an
 * `experimentId` that is workflow-thread-shaped (e.g. `thread-<uuid>`),
 * it is almost certainly a planner leak — `summarizeWorkflowState` used
 * to expose the workflow threadId to the planner, and the planner would
 * grab it as the experimentId arg when `summarizeToolResultPayload`
 * didn't surface the real `exp-<uuid>` from configure_experiment's output.
 * Both leaks were patched in plannerPrompt.ts in the previous commit, but
 * when the planner still produces a thread-shaped id we auto-resolve to
 * the single configured experiment (if unambiguous) rather than failing.
 *
 * DELIBERATELY NARROW:
 *  - Missing experimentId still errors — preserves the existing handler
 *    contract that tools like execute_training / register_model expect
 *    the caller to supply it explicitly.
 *  - Non-thread-shaped unknown ids still error — never silently clobber
 *    the wrong experiment just because the id doesn't match.
 *  - Multiple configured experiments + thread-shaped id still errors with
 *    an explicit message naming the leak.
 */
export function resolveExperiment(
  run: WorkflowRunState,
  args: Record<string, unknown>
): { experiment: Record<string, unknown>; experiments: Record<string, Record<string, unknown>> } | { error: string } {
  const experimentId = typeof args.experimentId === 'string' ? args.experimentId : undefined;
  if (!experimentId) {
    return { error: 'This operation requires experimentId.' };
  }
  const experiments = (run.metadata?.experiments as Record<string, Record<string, unknown>>) ?? {};
  const experiment = experiments[experimentId];
  if (experiment) {
    return { experiment, experiments };
  }

  const matchingByName = Object.values(experiments).filter((candidate) => {
    const candidateName = typeof candidate?.experimentName === 'string'
      ? candidate.experimentName.trim()
      : '';
    return candidateName.length > 0 && candidateName === experimentId;
  });
  if (matchingByName.length === 1) {
    const resolved = matchingByName[0];
    appLogger.warn(
      '[resolveExperiment] LLM supplied experimentName where experimentId was required; recovering against unique experiment name',
      {
        suppliedExperimentId: experimentId,
        resolvedExperimentId: resolved.experimentId
      }
    );
    return { experiment: resolved, experiments };
  }
  if (matchingByName.length > 1) {
    return {
      error: `Experiment identifier "${experimentId}" matched multiple experiment names. Supply the exact experimentId instead.`
    };
  }

  if (isWorkflowThreadReference(experimentId)) {
    const configuredIds = Object.keys(experiments);
    if (configuredIds.length === 1) {
      const resolved = experiments[configuredIds[0]];
      appLogger.warn(
        '[resolveExperiment] Planner leaked workflow threadId as experimentId; recovering against single configured experiment',
        { leakedExperimentId: experimentId, resolvedExperimentId: configuredIds[0] }
      );
      return { experiment: resolved, experiments };
    }
    return {
      error: configuredIds.length === 0
        ? `experimentId "${experimentId}" looks like a workflow thread id — the planner likely leaked state.run.threadId. Call configure_experiment first to create an experiment.`
        : `experimentId "${experimentId}" looks like a workflow thread id — the planner likely leaked state.run.threadId. Supply one of the configured experimentIds: ${configuredIds.join(', ')}.`
    };
  }

  return { error: `Experiment ${experimentId} not found. Call configure_experiment first.` };
}
