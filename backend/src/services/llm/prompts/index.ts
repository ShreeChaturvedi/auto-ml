/**
 * Barrel file — composes and re-exports all prompt builders.
 */

export { buildSystemPrompt } from './system.js';

export {
  truncateText,
  summarizeFeatureSampleRows,
  summarizeFeatureToolResults,
  MAX_FEATURE_PLAN_CHARS,
  MAX_FEATURE_SAMPLE_ROWS,
  MAX_FEATURE_SAMPLE_VALUE_CHARS,
  MAX_FEATURE_RAG_SNIPPET_CHARS,
  MAX_FEATURE_TOOL_SUMMARY_COUNT,
  buildPreprocessingRequest,
  buildOnboardingRequest
} from './toolUsage.js';

export { buildFeatureEngineeringRequest } from './featureWorkflow.js';

export { buildTrainingRequest } from './trainingWorkflow.js';

export { buildInsightCodegenPrompt, type InsightCodegenContext } from './insightCodegen.js';
