import type { LlmToolDefinition } from '../../../llm/llmClient.js';
import {
  CELL_TOOL_DEFINITIONS,
  PREPROCESSING_ORCHESTRATION_TOOLS
} from '../../../llm/toolRegistry.js';
import type {
  LifecycleStageDefinition,
  RuntimeContext,
  StageConfig
} from '../../phaseConfig.js';

const PREPROCESSING_TEXT_STAGES = new Set(['answer', 'await_approval', 'summarize']);
const PREPROCESSING_DETERMINISTIC_STAGES = new Set([
  'write_code',
  'record_execution',
  'validate',
  'commit'
]);

const ORCHESTRATION_TOOL_MAP = new Map<string, LlmToolDefinition>(
  [...PREPROCESSING_ORCHESTRATION_TOOLS, ...CELL_TOOL_DEFINITIONS]
    .map((tool) => [tool.name, tool])
);

const STAGE_TOOLS: Record<string, string[]> = {
  answer: [],
  plan_step: [
    'list_project_datasets',
    'set_active_dataset',
    'profile_active_dataset',
    'list_cells',
    'read_cell',
    'propose_transformation_step'
  ],
  generate_code: ['materialize_step_code'],
  write_code: ['write_cell', 'edit_cell', 'run_cell', 'list_cells', 'read_cell'],
  record_execution: ['execute_transformation_step', 'list_cells', 'read_cell'],
  validate: ['validate_step_result', 'profile_active_dataset', 'read_cell'],
  await_approval: [],
  commit: ['commit_transformation_step', 'checkpoint_dataset'],
  summarize: []
};

export const PREPROCESSING_LIFECYCLE: LifecycleStageDefinition[] = [
  { name: 'answer', label: 'Answering', order: 0 },
  { name: 'plan_step', label: 'Planning step', order: 1 },
  { name: 'generate_code', label: 'Generating code', order: 2 },
  { name: 'write_code', label: 'Writing to notebook', order: 3 },
  { name: 'record_execution', label: 'Recording execution', order: 4 },
  { name: 'validate', label: 'Validating', order: 5 },
  { name: 'await_approval', label: 'Awaiting approval', order: 6 },
  { name: 'commit', label: 'Committing', order: 7 },
  { name: 'summarize', label: 'Summarizing', order: 8 }
];

interface PreprocessingStageActions {
  buildCodeGenerationAction: NonNullable<StageConfig['delegatedAction']>;
  buildWriteCodeAction: NonNullable<StageConfig['deterministicAction']>;
  buildRecordExecutionAction: NonNullable<StageConfig['deterministicAction']>;
  buildValidateAction: NonNullable<StageConfig['deterministicAction']>;
  buildCommitAction: NonNullable<StageConfig['deterministicAction']>;
}

function toolsByNames(names: string[]): LlmToolDefinition[] {
  return names
    .map((name) => ORCHESTRATION_TOOL_MAP.get(name))
    .filter((tool): tool is LlmToolDefinition => Boolean(tool));
}

export function buildPreprocessingStageConfig(
  stage: string,
  actions: PreprocessingStageActions,
  runtimeContext?: RuntimeContext
): StageConfig {
  const toolNames = STAGE_TOOLS[stage] ?? [];
  const isTextStage = PREPROCESSING_TEXT_STAGES.has(stage);
  const isDeterministic = PREPROCESSING_DETERMINISTIC_STAGES.has(stage);
  const isDelegated = stage === 'generate_code';

  const allowTextResponse = runtimeContext?.allowTextResponse === true || isTextStage;
  const requireToolCall = runtimeContext?.requireToolCall === true || (!isTextStage && !allowTextResponse);

  const config: StageConfig = {
    name: stage,
    mode: isDeterministic
      ? 'deterministic'
      : isDelegated
        ? 'llm_delegated'
        : isTextStage
          ? 'text'
          : 'action',
    allowedTools: toolsByNames(toolNames),
    toolChoice: requireToolCall ? 'required' : 'auto',
    requiresApproval: stage === 'await_approval',
    allowAssistantMessage: allowTextResponse,
    allowAskUser: false,
    allowRenderUi: false,
    allowPlanExit: false,
    requireToolCall
  };

  if (stage === 'generate_code') {
    config.delegatedAction = actions.buildCodeGenerationAction;
  } else if (stage === 'write_code') {
    config.deterministicAction = actions.buildWriteCodeAction;
  } else if (stage === 'record_execution') {
    config.deterministicAction = actions.buildRecordExecutionAction;
  } else if (stage === 'validate') {
    config.deterministicAction = actions.buildValidateAction;
  } else if (stage === 'commit') {
    config.deterministicAction = actions.buildCommitAction;
  }

  return config;
}
