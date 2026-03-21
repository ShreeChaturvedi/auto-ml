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
  args: Record<string, unknown>;
  datasetId?: string;
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
    args: ctx.args,
    datasetId: ctx.turn.datasetId
  };
}
