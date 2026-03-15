import { executeFeature, validateFeature } from './executionTools.js';
import { materializeFeatureCode, proposeFeature } from './proposalTools.js';
import { checkpointFeaturePipeline, registerFeature } from './registrationTools.js';
import type { FeatureToolHandler } from './types.js';

export type { FeatureToolContext, FeatureToolHandler, FeatureStep } from './types.js';
export { toFeatureToolContext } from './types.js';

export const FEATURE_TOOL_HANDLERS: Map<string, FeatureToolHandler> = new Map([
  ['propose_feature', proposeFeature],
  ['materialize_feature_code', materializeFeatureCode],
  ['execute_feature', executeFeature],
  ['validate_feature', validateFeature],
  ['register_feature', registerFeature],
  ['checkpoint_feature_pipeline', checkpointFeaturePipeline]
]);
