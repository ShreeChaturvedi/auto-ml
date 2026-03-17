import { executeTraining, evaluateResults } from './executionTools.js';
import { configureExperiment, proposeTrainingPlan } from './experimentTools.js';
import { registerModel, compareModels } from './registrationTools.js';
import type { TrainingToolHandler } from './types.js';

export type { TrainingToolContext, TrainingToolHandler, TrainingToolResult, ExperimentState } from './types.js';

/**
 * Training tool handler registry.
 * Maps tool names to their handler implementations.
 */
export const TRAINING_TOOL_HANDLERS: Map<string, TrainingToolHandler> = new Map([
  ['configure_experiment', configureExperiment],
  ['propose_training_plan', proposeTrainingPlan],
  ['execute_training', executeTraining],
  ['evaluate_results', evaluateResults],
  ['register_model', registerModel],
  ['compare_models', compareModels]
]);
