import type { LlmToolDefinition } from '../llmClient.js';

import { CELL_TOOL_DEFINITIONS } from './cellTools.js';
import { DATA_TOOL_DEFINITIONS } from './dataTools.js';
import { FEATURE_TOOL_DEFINITIONS } from './featureTools.js';
import { PACKAGE_TOOL_DEFINITIONS } from './packageTools.js';
import { PREPROCESSING_ORCHESTRATION_TOOLS } from './preprocessingTools.js';
import { TRAINING_TOOL_DEFINITIONS } from './trainingTools.js';
import { LLM_RENDER_UI_TOOL, ASK_USER_TOOL, PLAN_EXIT_TOOL } from './uiTools.js';

// Re-export individual groups
export { CELL_TOOL_DEFINITIONS } from './cellTools.js';
export { DATA_TOOL_DEFINITIONS } from './dataTools.js';
export { FEATURE_TOOL_DEFINITIONS, FEATURE_TOOL_NAMES } from './featureTools.js';
export { PACKAGE_TOOL_DEFINITIONS } from './packageTools.js';
export { PREPROCESSING_ORCHESTRATION_TOOLS } from './preprocessingTools.js';
export { TRAINING_TOOL_DEFINITIONS } from './trainingTools.js';
export { LLM_RENDER_UI_TOOL, ASK_USER_TOOL, PLAN_EXIT_TOOL } from './uiTools.js';

/**
 * All general-purpose tool definitions (data + cell + package).
 * Matches the original LLM_TOOL_DEFINITIONS export.
 */
export const LLM_TOOL_DEFINITIONS: LlmToolDefinition[] = [
  ...DATA_TOOL_DEFINITIONS,
  ...CELL_TOOL_DEFINITIONS,
  ...PACKAGE_TOOL_DEFINITIONS
];

const NOTEBOOK_EXECUTION_TOOLS = [
  'list_cells',
  'read_cell',
  'write_cell',
  'edit_cell',
  'run_cell',
  'delete_cell',
  'reorder_cells',
  'insert_cell'
];

const FEATURE_DISCOVERY_TOOLS = [
  'list_project_files',
  'get_dataset_profile',
  'get_dataset_sample',
  'search_documents'
];

export const LLM_ALL_TOOLS: LlmToolDefinition[] = [
  ...LLM_TOOL_DEFINITIONS,
  LLM_RENDER_UI_TOOL
];

// get_dataset_profile is intentionally excluded: its data (columns, types, sample rows)
// is already injected into every feature engineering request via the dataset parameter.
// Keeping it in the tool list causes the model to re-profile the dataset in a loop
// because there is no matching history entry in the conversation.
const FEATURE_ENGINEERING_DISCOVERY_TOOLS = FEATURE_DISCOVERY_TOOLS.filter(
  (name) => name !== 'get_dataset_profile'
);

export const LLM_FEATURE_ENGINEERING_TOOLS: LlmToolDefinition[] = [
  ...LLM_TOOL_DEFINITIONS.filter((tool) =>
    FEATURE_ENGINEERING_DISCOVERY_TOOLS.includes(tool.name) || NOTEBOOK_EXECUTION_TOOLS.includes(tool.name)
  ),
  ASK_USER_TOOL,
  LLM_RENDER_UI_TOOL
];

/**
 * Feature continue tools — the 6 lifecycle tools merged with notebook and
 * discovery tools, but WITHOUT get_dataset_profile (its data is already
 * injected into the user message; including it causes a re-profiling loop).
 * Used by the `continue_feature_pipeline` stage in text mode.
 */
export const LLM_FEATURE_CONTINUE_TOOLS: LlmToolDefinition[] = [
  ...FEATURE_TOOL_DEFINITIONS,
  ...LLM_TOOL_DEFINITIONS.filter((tool) =>
    FEATURE_ENGINEERING_DISCOVERY_TOOLS.includes(tool.name) || NOTEBOOK_EXECUTION_TOOLS.includes(tool.name)
  ),
  ASK_USER_TOOL,
  LLM_RENDER_UI_TOOL
];

/**
 * Feature lifecycle tools — the 6 semantic feature tools combined with
 * notebook execution and data discovery tools for the unified workflow.
 */
export const LLM_FEATURE_LIFECYCLE_TOOLS: LlmToolDefinition[] = [
  ...FEATURE_TOOL_DEFINITIONS,
  ...LLM_TOOL_DEFINITIONS.filter((tool) =>
    FEATURE_DISCOVERY_TOOLS.includes(tool.name) || NOTEBOOK_EXECUTION_TOOLS.includes(tool.name)
  ),
  ASK_USER_TOOL,
  LLM_RENDER_UI_TOOL
];

/**
 * Training lifecycle tools — the 6 semantic training tools combined with
 * notebook execution and data discovery tools for the unified workflow.
 */
export const LLM_TRAINING_LIFECYCLE_TOOLS: LlmToolDefinition[] = [
  ...TRAINING_TOOL_DEFINITIONS,
  ...LLM_TOOL_DEFINITIONS.filter((tool) =>
    FEATURE_DISCOVERY_TOOLS.includes(tool.name) || NOTEBOOK_EXECUTION_TOOLS.includes(tool.name)
  ),
  ASK_USER_TOOL,
  LLM_RENDER_UI_TOOL
];

export const LLM_PREPROCESSING_TOOLS: LlmToolDefinition[] = [
  ...PREPROCESSING_ORCHESTRATION_TOOLS,
  ...LLM_TOOL_DEFINITIONS.filter((tool) => NOTEBOOK_EXECUTION_TOOLS.includes(tool.name)),
  LLM_RENDER_UI_TOOL
];

export const LLM_ONBOARDING_TOOLS: LlmToolDefinition[] = [
  LLM_TOOL_DEFINITIONS.find(t => t.name === 'list_project_files')!,
  LLM_TOOL_DEFINITIONS.find(t => t.name === 'get_dataset_profile')!,
  LLM_TOOL_DEFINITIONS.find(t => t.name === 'get_dataset_sample')!,
  LLM_TOOL_DEFINITIONS.find(t => t.name === 'search_documents')!,
  ASK_USER_TOOL,
  PLAN_EXIT_TOOL
];

export function buildToolDescriptionText(tools: LlmToolDefinition[] = LLM_ALL_TOOLS): string {
  return tools.map((tool) => {
    const params = JSON.stringify(tool.parameters);
    return `- ${tool.name}(${params}): ${tool.description}`;
  }).join('\n');
}
