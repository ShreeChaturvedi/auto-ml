export const FLOW_BASE_STROKE_WIDTH = 1.7;
export const FLOW_PARTICLE_STROKE_WIDTH = 2.5;
export const FLOW_PARTICLE_DASHARRAY = '40 400';
export const FLOW_PARTICLE_DURATION = '1.5s';
export const FLOW_PARTICLE_OFFSET_START = 440;
export const FLOW_PARTICLE_OFFSET_END = -300;
export const FLOW_PARTICLE_PATH_LENGTH = 400;

/**
 * Returns the flow particle animation duration scaled by the given factor.
 * Used by ComputeAnimation to support landing-page playback at a slower speed.
 */
export function scaledFlowParticleDuration(scale: number = 1): string {
  return `${(1.5 * scale).toFixed(2)}s`;
}
