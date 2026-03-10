import {
  checkpointDataset,
  listCheckpoints,
  listProjectDatasets,
  profileActiveDataset,
  registerDerivedDataset,
  restoreCheckpoint,
  setActiveDataset
} from './datasetTools.js';
import {
  detectStepDivergence,
  reconcileDivergedStep
} from './divergenceTools.js';
import {
  executeTransformationStep,
  materializeStepCode,
  proposeTransformationStep
} from './transformationTools.js';
import type { ToolHandler } from './types.js';
import {
  commitTransformationStep,
  validateStepResult
} from './validationTools.js';

export type { ToolContext, ToolHandler } from './types.js';

export const TOOL_HANDLERS: Map<string, ToolHandler> = new Map([
  ['list_project_datasets', listProjectDatasets],
  ['set_active_dataset', setActiveDataset],
  ['profile_active_dataset', profileActiveDataset],
  ['checkpoint_dataset', checkpointDataset],
  ['register_derived_dataset', registerDerivedDataset],
  ['list_checkpoints', listCheckpoints],
  ['restore_checkpoint', restoreCheckpoint],
  ['propose_transformation_step', proposeTransformationStep],
  ['materialize_step_code', materializeStepCode],
  ['execute_transformation_step', executeTransformationStep],
  ['validate_step_result', validateStepResult],
  ['commit_transformation_step', commitTransformationStep],
  ['detect_step_divergence', detectStepDivergence],
  ['reconcile_diverged_step', reconcileDivergedStep]
]);
