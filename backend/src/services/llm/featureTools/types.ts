import type {
  FeaturePipelineRunRepository,
  FeaturePipelineRunState
} from '../../../repositories/featurePipelineRunRepository.js';
import type { ToolContext as PhaseToolContext, ToolResult } from '../../workflows/phaseConfig.js';

/**
 * Feature tool context — a subset of the PhaseConfig ToolContext
 * scoped to what feature handlers need.
 *
 * The `run` and `runRepository` fields are populated by the phase config's
 * dispatch function (featureEngineering.ts), NOT by `toFeatureToolContext`.
 */
export interface FeatureToolContext {
  projectId: string;
  toolCallId: string | undefined;
  rationale?: string;
  args: Record<string, unknown>;
  datasetId?: string;
  /** Raw turn prompt — used by handlers to detect implementation mode
   *  (e.g., propose_feature rejects when the prompt contains selected
   *  feature IDs because the LLM should be materializing, not proposing). */
  prompt?: string;
  /** Feature pipeline run state — populated when dispatched via phase config. */
  run?: FeaturePipelineRunState;
  /** Feature pipeline run repository — populated when dispatched via phase config. */
  runRepository?: FeaturePipelineRunRepository;
}

export type FeatureToolHandler = (ctx: FeatureToolContext) => Promise<ToolResult>;

export interface FeatureStep {
  stepId: string;
  name: string;
  method: string;
  status: string;
  code?: string;
  metrics?: Record<string, unknown>;
}

/**
 * Convert a PhaseConfig ToolContext into a FeatureToolContext
 * so that feature handlers do not depend on the full run state.
 *
 * NOTE: This does NOT populate `run` or `runRepository`. Those are
 * injected by the phase config's dispatch function when the repository
 * is available.
 */
export function toFeatureToolContext(ctx: PhaseToolContext): FeatureToolContext {
  return {
    projectId: ctx.projectId,
    toolCallId: ctx.toolCallId,
    rationale: ctx.rationale,
    args: ctx.args,
    datasetId: ctx.turn.datasetId,
    prompt: ctx.turn.prompt
  };
}
