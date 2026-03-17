import type { ToolContext as PhaseToolContext, ToolResult } from '../../workflows/phaseConfig.js';

/**
 * Feature tool context — a subset of the PhaseConfig ToolContext
 * scoped to what feature handlers need.
 */
export interface FeatureToolContext {
  projectId: string;
  toolCallId: string | undefined;
  args: Record<string, unknown>;
  datasetId?: string;
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
 */
export function toFeatureToolContext(ctx: PhaseToolContext): FeatureToolContext {
  return {
    projectId: ctx.projectId,
    toolCallId: ctx.toolCallId,
    args: ctx.args,
    datasetId: ctx.turn.datasetId
  };
}
