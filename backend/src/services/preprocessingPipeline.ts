import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import { z } from 'zod';

import { env } from '../config.js';
import { hasDatabaseConfiguration } from '../db.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { createProjectRepository } from '../repositories/projectRepository.js';

import { executeInContainer, getOrCreateContainer, isDockerAvailable } from './containerManager.js';
import { loadDatasetIntoPostgres, sanitizeTableName } from './datasetLoader.js';
import { profileDataset } from './datasetProfiler.js';
import { syncWorkspaceDatasets } from './executionWorkspace.js';
import {
  createLlmClient,
  createThinkingLlmClient,
  type LlmToolCall,
  type LlmToolCallHistory,
  type LlmToolDefinition,
  type LlmToolResultHistory
} from './llm/llmClient.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const projectRepository = createProjectRepository(env.storagePath);

const PREPROCESSING_ACTIONS = [
  'drop_columns',
  'impute_missing',
  'scale_features',
  'encode_categorical',
  'remove_outliers',
  'custom_python'
] as const;

const PREPROCESSING_METHODS = [
  'drop',
  'mean',
  'median',
  'mode',
  'constant',
  'drop_rows',
  'drop_column',
  'standard',
  'minmax',
  'robust',
  'onehot',
  'label',
  'frequency',
  'iqr',
  'zscore',
  'clip',
  'custom'
] as const;

export const preprocessingActionSchema = z.enum(PREPROCESSING_ACTIONS);

export const preprocessingStepSchema = z.object({
  id: z.string().min(1),
  action: preprocessingActionSchema,
  title: z.string().min(1).max(120),
  description: z.string().max(400).optional(),
  columns: z.array(z.string().min(1)).default([]),
  method: z.string().min(1).max(64).optional(),
  params: z.record(z.unknown()).default({}),
  reasoning: z.string().min(1).max(500),
  customCode: z.string().max(8000).optional(),
  enabled: z.boolean().default(true)
});

const preprocessingDraftSchema = z.array(preprocessingStepSchema).max(50);

const generatedPipelineSchema = z.object({
  assistantMessage: z.string().min(1).max(1000),
  steps: preprocessingDraftSchema
});

const addStepArgsSchema = z.object({
  step: preprocessingStepSchema.omit({ id: true }).partial().extend({
    action: preprocessingActionSchema,
    title: z.string().min(1).max(120),
    reasoning: z.string().min(1).max(500),
    columns: z.array(z.string().min(1)).default([]),
    params: z.record(z.unknown()).default({}),
    enabled: z.boolean().default(true)
  })
});

const updateStepArgsSchema = z.object({
  stepId: z.string().min(1),
  updates: preprocessingStepSchema
    .omit({ id: true })
    .partial()
    .refine((value) => Object.keys(value).length > 0, 'updates cannot be empty')
});

const removeStepArgsSchema = z.object({
  stepId: z.string().min(1)
});

const reorderStepArgsSchema = z.object({
  stepId: z.string().min(1),
  toIndex: z.number().int().min(0)
});

export type PreprocessingAction = z.infer<typeof preprocessingActionSchema>;
export type PreprocessingStep = z.infer<typeof preprocessingStepSchema>;

interface AnalyzePipelineInput {
  projectId: string;
  datasetId: string;
  sampleSize?: number;
}

interface RefinePipelineInput {
  projectId: string;
  datasetId: string;
  message: string;
  draftSteps: PreprocessingStep[];
  model?: string;
  enableThinking?: boolean;
  thinkingLevel?: 'dynamic' | 'low' | 'medium' | 'high';
}

interface ExecutePipelineInput {
  projectId: string;
  datasetId: string;
  draftSteps: PreprocessingStep[];
  outputName?: string;
}

interface PlanContext {
  name: string;
  markdown: string;
}

interface AnalyzePipelineResult {
  assistantMessage: string;
  draftSteps: PreprocessingStep[];
  planName?: string;
  qualitySummary: {
    nRows: number;
    nCols: number;
    columnsWithMissing: number;
    missingCellPercentage: number;
  };
}

interface RefinePipelineResult {
  assistantMessage: string;
  draftSteps: PreprocessingStep[];
  toolActivities: PreprocessingToolActivity[];
}

interface PreprocessingToolActivity {
  id: string;
  name: string;
  args: Record<string, unknown>;
  response: Record<string, unknown>;
  status: 'applied' | 'failed';
}

interface ExecutePipelineResult {
  datasetId: string;
  filename: string;
  tableName: string;
  executedStepCount: number;
}

const PREPROCESSING_TOOL_DEFINITIONS: LlmToolDefinition[] = [
  {
    name: 'add_preprocessing_step',
    description: 'Add a new preprocessing step to the draft pipeline.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        step: {
          type: 'object',
          additionalProperties: false,
          properties: {
            action: { type: 'string', enum: PREPROCESSING_ACTIONS },
            title: { type: 'string' },
            description: { type: 'string' },
            columns: { type: 'array', items: { type: 'string' } },
            method: { type: 'string', enum: PREPROCESSING_METHODS },
            params: { type: 'object' },
            reasoning: { type: 'string' },
            customCode: { type: 'string' },
            enabled: { type: 'boolean' }
          },
          required: ['action', 'title', 'reasoning']
        }
      },
      required: ['step']
    }
  },
  {
    name: 'update_preprocessing_step',
    description: 'Update an existing preprocessing step by its stepId.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        stepId: { type: 'string' },
        updates: {
          type: 'object',
          additionalProperties: false,
          properties: {
            action: { type: 'string', enum: PREPROCESSING_ACTIONS },
            title: { type: 'string' },
            description: { type: 'string' },
            columns: { type: 'array', items: { type: 'string' } },
            method: { type: 'string', enum: PREPROCESSING_METHODS },
            params: { type: 'object' },
            reasoning: { type: 'string' },
            customCode: { type: 'string' },
            enabled: { type: 'boolean' }
          }
        }
      },
      required: ['stepId', 'updates']
    }
  },
  {
    name: 'remove_preprocessing_step',
    description: 'Remove a preprocessing step by stepId.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        stepId: { type: 'string' }
      },
      required: ['stepId']
    }
  },
  {
    name: 'reorder_preprocessing_step',
    description: 'Move an existing step to a new zero-based index.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        stepId: { type: 'string' },
        toIndex: { type: 'number' }
      },
      required: ['stepId', 'toIndex']
    }
  }
];

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

type PreprocessingStepInput = Omit<PreprocessingStep, 'columns' | 'params' | 'enabled'> & {
  columns?: string[];
  params?: Record<string, unknown>;
  enabled?: boolean;
};

function normalizeStep(step: PreprocessingStepInput): PreprocessingStep {
  return {
    ...step,
    columns: dedupeStrings(step.columns ?? []),
    params: step.params ?? {},
    enabled: step.enabled ?? true
  };
}

function createStep(input: z.infer<typeof addStepArgsSchema>['step']): PreprocessingStep {
  return normalizeStep({
    id: randomUUID(),
    action: input.action,
    title: input.title,
    description: input.description,
    columns: input.columns,
    method: input.method,
    params: input.params,
    reasoning: input.reasoning,
    customCode: input.customCode,
    enabled: input.enabled
  });
}

function parseJsonBlock<T>(raw: string, schema: z.ZodSchema<T>): T {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]+?)\s*```$/i);
  const jsonText = fencedMatch ? fencedMatch[1] : trimmed;
  return schema.parse(JSON.parse(jsonText));
}

function formatColumnsForPrompt(columns: Array<{ name: string; dtype: string; nullCount: number }>): string {
  return columns
    .map((column) => `- ${column.name} (${column.dtype}), nullCount=${column.nullCount}`)
    .join('\n');
}

function getPlanContext(metadata: Record<string, unknown> | undefined): PlanContext | undefined {
  if (!metadata) {
    return undefined;
  }

  const plans = metadata.plans;
  const activePlanId = typeof metadata.activePlanId === 'string' ? metadata.activePlanId : undefined;

  if (Array.isArray(plans) && plans.length > 0) {
    const entries = plans.filter((value): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null
    );
    const active =
      entries.find((entry) => typeof entry.id === 'string' && entry.id === activePlanId) ?? entries[0];
    const markdown = typeof active.content === 'string' ? active.content.trim() : '';
    if (markdown) {
      return {
        name: typeof active.name === 'string' && active.name.trim() ? active.name : 'project-plan.md',
        markdown
      };
    }
  }

  if (typeof metadata.projectPlan === 'string' && metadata.projectPlan.trim()) {
    return {
      name:
        typeof metadata.projectPlanName === 'string' && metadata.projectPlanName.trim()
          ? metadata.projectPlanName
          : 'project-plan.md',
      markdown: metadata.projectPlan
    };
  }

  return undefined;
}

function buildAnalyzePrompt(params: {
  projectName: string;
  datasetFilename: string;
  nRows: number;
  nCols: number;
  columns: Array<{ name: string; dtype: string; nullCount: number }>;
  sampleRows: Record<string, unknown>[];
  plan?: PlanContext;
}) {
  const planSection = params.plan
    ? `Approved project plan (${params.plan.name}):\n${params.plan.markdown}`
    : 'No approved project plan is available. Infer a safe default preprocessing strategy from schema and sample.';

  return [
    {
      role: 'system' as const,
      content:
        'You are a senior ML data preprocessing planner. Produce practical, production-ready preprocessing steps for a tabular dataset. Return JSON only, matching the requested schema exactly. Do not include markdown fences.'
    },
    {
      role: 'user' as const,
      content: [
        `Project: ${params.projectName}`,
        `Dataset: ${params.datasetFilename}`,
        `Rows: ${params.nRows}, Columns: ${params.nCols}`,
        `Columns:\n${formatColumnsForPrompt(params.columns)}`,
        `Sample rows:\n${JSON.stringify(params.sampleRows, null, 2)}`,
        planSection,
        'Return a JSON object with this exact shape:',
        '{',
        '  "assistantMessage": "short explanation",',
        '  "steps": [',
        '    {',
        '      "id": "uuid-string",',
        '      "action": "drop_columns|impute_missing|scale_features|encode_categorical|remove_outliers|custom_python",',
        '      "title": "short title",',
        '      "description": "optional detail",',
        '      "columns": ["columnA"],',
        '      "method": "one of supported methods",',
        '      "params": {},',
        '      "reasoning": "why this helps objective",',
        '      "customCode": "python code only for custom_python",',
        '      "enabled": true',
        '    }',
        '  ]',
        '}',
        'Rules:',
        '- keep steps concrete and executable',
        '- avoid dropping columns unless justified by high missingness or leakage',
        '- include only columns that exist in schema',
        '- always provide concise reasoning'
      ].join('\n\n')
    }
  ];
}

function buildFallbackPipeline(input: {
  columns: Array<{ name: string; dtype: string; nullCount: number }>;
  nRows: number;
}): PreprocessingStep[] {
  const steps: PreprocessingStep[] = [];

  for (const column of input.columns) {
    if (input.nRows <= 0 || column.nullCount <= 0) {
      continue;
    }

    const missingRatio = column.nullCount / input.nRows;
    if (missingRatio >= 0.65) {
      steps.push({
        id: randomUUID(),
        action: 'drop_columns',
        title: `Drop ${column.name}`,
        description: 'Column has very high missingness.',
        columns: [column.name],
        method: 'drop',
        params: {},
        reasoning: `${Math.round(missingRatio * 100)}% of values are missing.`,
        enabled: true
      });
      continue;
    }

    const numeric = column.dtype === 'integer' || column.dtype === 'float';
    steps.push({
      id: randomUUID(),
      action: 'impute_missing',
      title: `Impute ${column.name}`,
      description: numeric ? 'Fill missing values with median.' : 'Fill missing values with mode.',
      columns: [column.name],
      method: numeric ? 'median' : 'mode',
      params: {},
      reasoning: `${column.nullCount} missing values detected.`,
      enabled: true
    });
  }

  return steps;
}

function qualitySummary(nRows: number, nCols: number, columns: Array<{ nullCount: number }>) {
  const totalCells = nRows > 0 && nCols > 0 ? nRows * nCols : 0;
  const missingCells = columns.reduce((sum, column) => sum + column.nullCount, 0);
  const columnsWithMissing = columns.filter((column) => column.nullCount > 0).length;
  return {
    nRows,
    nCols,
    columnsWithMissing,
    missingCellPercentage: totalCells > 0 ? (missingCells / totalCells) * 100 : 0
  };
}

export async function analyzePreprocessingPipeline(
  input: AnalyzePipelineInput
): Promise<AnalyzePipelineResult> {
  const dataset = await datasetRepository.getById(input.datasetId);
  if (!dataset) {
    throw new Error('Dataset not found');
  }

  if (dataset.projectId && dataset.projectId !== input.projectId) {
    throw new Error('Dataset does not belong to this project');
  }

  const project = await projectRepository.getById(input.projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const plan = getPlanContext(project.metadata as Record<string, unknown> | undefined);
  const sampleRows = dataset.sample.slice(0, Math.max(10, Math.min(input.sampleSize ?? 20, 60)));
  const columns = dataset.columns.map((column) => ({
    name: column.name,
    dtype: column.dtype,
    nullCount: column.nullCount
  }));

  const messages = buildAnalyzePrompt({
    projectName: project.name,
    datasetFilename: dataset.filename,
    nRows: dataset.nRows,
    nCols: dataset.nCols,
    columns,
    sampleRows,
    plan
  });

  let draftSteps = buildFallbackPipeline({
    columns,
    nRows: dataset.nRows
  });

  let assistantMessage =
    draftSteps.length > 0
      ? 'Generated a fallback preprocessing draft based on missing values.'
      : 'No high-impact preprocessing steps were detected.';

  try {
    const raw = await createThinkingLlmClient().complete({
      messages,
      temperature: 0.2,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      enableThinking: true,
      thinkingLevel: 'medium'
    });

    const parsed = parseJsonBlock(raw, generatedPipelineSchema);
    draftSteps = parsed.steps.map(normalizeStep);
    assistantMessage = parsed.assistantMessage;
  } catch (error) {
    console.warn('[preprocessingPipeline] Falling back to deterministic draft:', error);
  }

  return {
    assistantMessage,
    draftSteps,
    planName: plan?.name,
    qualitySummary: qualitySummary(dataset.nRows, dataset.nCols, columns)
  };
}

function buildRefineMessages(params: {
  datasetFilename: string;
  columns: Array<{ name: string; dtype: string; nullCount: number }>;
  plan?: PlanContext;
  message: string;
  draftSteps: PreprocessingStep[];
}) {
  const planText = params.plan
    ? `Approved plan (${params.plan.name}):\n${params.plan.markdown}`
    : 'No approved project plan is available.';

  return [
    {
      role: 'system' as const,
      content: [
        'You are a preprocessing assistant that edits a draft preprocessing pipeline.',
        'Use tool calls to mutate the pipeline whenever the user asks for changes.',
        'Use add_preprocessing_step, update_preprocessing_step, remove_preprocessing_step, reorder_preprocessing_step as needed.',
        'After applying necessary tool calls, provide a concise explanation of what changed.'
      ].join(' ')
    },
    {
      role: 'user' as const,
      content: [
        `Dataset: ${params.datasetFilename}`,
        `Columns:\n${formatColumnsForPrompt(params.columns)}`,
        planText,
        `Current pipeline:\n${JSON.stringify(params.draftSteps, null, 2)}`,
        `User request: ${params.message}`
      ].join('\n\n')
    }
  ];
}

function applyToolCall(toolCall: LlmToolCall, draftSteps: PreprocessingStep[]) {
  if (toolCall.name === 'add_preprocessing_step') {
    const parsed = addStepArgsSchema.parse(toolCall.args);
    const next = [...draftSteps, createStep(parsed.step)];
    return {
      draftSteps: next,
      result: { ok: true, message: 'Step added', count: next.length }
    };
  }

  if (toolCall.name === 'update_preprocessing_step') {
    const parsed = updateStepArgsSchema.parse(toolCall.args);
    const index = draftSteps.findIndex((step) => step.id === parsed.stepId);
    if (index === -1) {
      return {
        draftSteps,
        result: { ok: false, error: `Step ${parsed.stepId} not found` }
      };
    }

    const merged = normalizeStep({
      ...draftSteps[index],
      ...parsed.updates,
      params: parsed.updates.params ?? draftSteps[index].params
    });

    const next = draftSteps.slice();
    next[index] = merged;
    return {
      draftSteps: next,
      result: { ok: true, message: 'Step updated', stepId: parsed.stepId }
    };
  }

  if (toolCall.name === 'remove_preprocessing_step') {
    const parsed = removeStepArgsSchema.parse(toolCall.args);
    const next = draftSteps.filter((step) => step.id !== parsed.stepId);
    if (next.length === draftSteps.length) {
      return {
        draftSteps,
        result: { ok: false, error: `Step ${parsed.stepId} not found` }
      };
    }

    return {
      draftSteps: next,
      result: { ok: true, message: 'Step removed', count: next.length }
    };
  }

  if (toolCall.name === 'reorder_preprocessing_step') {
    const parsed = reorderStepArgsSchema.parse(toolCall.args);
    const index = draftSteps.findIndex((step) => step.id === parsed.stepId);
    if (index === -1) {
      return {
        draftSteps,
        result: { ok: false, error: `Step ${parsed.stepId} not found` }
      };
    }

    const boundedIndex = Math.max(0, Math.min(parsed.toIndex, Math.max(0, draftSteps.length - 1)));
    const next = draftSteps.slice();
    const [step] = next.splice(index, 1);
    next.splice(boundedIndex, 0, step);
    return {
      draftSteps: next,
      result: { ok: true, message: 'Step reordered', toIndex: boundedIndex }
    };
  }

  return {
    draftSteps,
    result: { ok: false, error: `Unknown tool ${toolCall.name}` }
  };
}

export async function refinePreprocessingPipeline(
  input: RefinePipelineInput
): Promise<RefinePipelineResult> {
  const dataset = await datasetRepository.getById(input.datasetId);
  if (!dataset) {
    throw new Error('Dataset not found');
  }

  if (dataset.projectId && dataset.projectId !== input.projectId) {
    throw new Error('Dataset does not belong to this project');
  }

  const project = await projectRepository.getById(input.projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const plan = getPlanContext(project.metadata as Record<string, unknown> | undefined);
  let draftSteps = preprocessingDraftSchema.parse(input.draftSteps).map(normalizeStep);

  const toolCallHistory: LlmToolCallHistory[] = [];
  const toolResultHistory: LlmToolResultHistory[] = [];
  const toolActivities: PreprocessingToolActivity[] = [];
  let assistantMessage = '';
  const activeClient =
    input.enableThinking === false ? createLlmClient(input.model) : createThinkingLlmClient(input.model);

  for (let pass = 0; pass < 4; pass += 1) {
    const passToolCalls: LlmToolCall[] = [];
    const passTokens: string[] = [];

    await activeClient.stream(
      {
        messages: buildRefineMessages({
          datasetFilename: dataset.filename,
          columns: dataset.columns.map((column) => ({
            name: column.name,
            dtype: column.dtype,
            nullCount: column.nullCount
          })),
          plan,
          message: input.message,
          draftSteps
        }),
        tools: PREPROCESSING_TOOL_DEFINITIONS,
        toolChoice: 'auto',
        toolCallHistory,
        toolResultHistory,
        temperature: 0.2,
        maxOutputTokens: 4096,
        enableThinking: input.enableThinking ?? true,
        thinkingLevel: input.thinkingLevel ?? 'medium'
      },
      {
        onToken: (token) => {
          passTokens.push(token);
        },
        onToolCall: (toolCall) => {
          passToolCalls.push(toolCall);
        }
      }
    );

    const passText = passTokens.join('').trim();
    if (passText) {
      assistantMessage = passText;
    }

    if (passToolCalls.length === 0) {
      break;
    }

    passToolCalls.forEach((toolCall) => {
      const callArgs =
        typeof toolCall.args === 'object' && toolCall.args !== null
          ? (toolCall.args as Record<string, unknown>)
          : {};

      try {
        const applied = applyToolCall(toolCall, draftSteps);
        draftSteps = applied.draftSteps;
        toolCallHistory.push({
          name: toolCall.name,
          args: toolCall.args,
          thoughtSignature: toolCall.thoughtSignature
        });
        toolResultHistory.push({
          name: toolCall.name,
          response: applied.result
        });
        toolActivities.push({
          id: randomUUID(),
          name: toolCall.name,
          args: callArgs,
          response: applied.result as Record<string, unknown>,
          status: 'applied'
        });
      } catch (error) {
        const response = {
          ok: false,
          error: error instanceof Error ? error.message : 'Failed to apply tool call'
        };

        toolCallHistory.push({
          name: toolCall.name,
          args: toolCall.args,
          thoughtSignature: toolCall.thoughtSignature
        });
        toolResultHistory.push({
          name: toolCall.name,
          response
        });
        toolActivities.push({
          id: randomUUID(),
          name: toolCall.name,
          args: callArgs,
          response,
          status: 'failed'
        });
      }
    });
  }

  if (!assistantMessage) {
    assistantMessage = 'Pipeline updated.';
  }

  return {
    assistantMessage,
    draftSteps,
    toolActivities
  };
}

function pythonString(value: string): string {
  return JSON.stringify(value);
}

function pythonStringArray(values: string[]): string {
  return `[${values.map((value) => pythonString(value)).join(', ')}]`;
}

function buildStepCode(step: PreprocessingStep, index: number): string {
  const columnsLiteral = pythonStringArray(step.columns);
  const method = step.method ?? '';
  const title = step.title.replace(/[\r\n]+/g, ' ').trim();
  const stepLabelLiteral = pythonString(`Step ${index + 1}: ${title}`);
  const paramsLiteral = JSON.stringify(step.params ?? {});

  if (step.action === 'drop_columns') {
    return [
      `print(${stepLabelLiteral})`,
      `drop_columns = [column for column in ${columnsLiteral} if column in df.columns]`,
      'if drop_columns:',
      '    df = df.drop(columns=drop_columns)'
    ].join('\n');
  }

  if (step.action === 'impute_missing') {
    return [
      `print(${stepLabelLiteral})`,
      `impute_columns = [column for column in ${columnsLiteral} if column in df.columns]`,
      `impute_method = ${pythonString(method || 'median')}`,
      `impute_params = ${paramsLiteral}`,
      'for column in impute_columns:',
      '    if impute_method == "drop_rows":',
      '        df = df[df[column].notna()]',
      '        continue',
      '    if impute_method == "drop_column":',
      '        df = df.drop(columns=[column])',
      '        continue',
      '    series = df[column]',
      '    if impute_method == "mean":',
      '        numeric = pd.to_numeric(series, errors="coerce")',
      '        fill_value = numeric.mean()',
      '    elif impute_method == "median":',
      '        numeric = pd.to_numeric(series, errors="coerce")',
      '        fill_value = numeric.median()',
      '    elif impute_method == "mode":',
      '        mode = series.mode(dropna=True)',
      '        fill_value = mode.iloc[0] if len(mode) > 0 else None',
      '    elif impute_method == "constant":',
      '        fill_value = impute_params.get("fillValue", impute_params.get("value"))',
      '    else:',
      '        mode = series.mode(dropna=True)',
      '        fill_value = mode.iloc[0] if len(mode) > 0 else None',
      '    if fill_value is not None and not (isinstance(fill_value, float) and np.isnan(fill_value)):',
      '        df[column] = series.fillna(fill_value)'
    ].join('\n');
  }

  if (step.action === 'scale_features') {
    return [
      `print(${stepLabelLiteral})`,
      `scale_columns = [column for column in ${columnsLiteral} if column in df.columns]`,
      `scale_method = ${pythonString(method || 'standard')}`,
      'for column in scale_columns:',
      '    values = pd.to_numeric(df[column], errors="coerce")',
      '    if scale_method == "minmax":',
      '        min_value = values.min()',
      '        max_value = values.max()',
      '        denom = max_value - min_value',
      '        df[column] = ((values - min_value) / denom) if pd.notna(denom) and denom != 0 else values.fillna(0)',
      '    elif scale_method == "robust":',
      '        q1 = values.quantile(0.25)',
      '        q3 = values.quantile(0.75)',
      '        iqr = q3 - q1',
      '        median = values.median()',
      '        df[column] = ((values - median) / iqr) if pd.notna(iqr) and iqr != 0 else values.fillna(0)',
      '    else:',
      '        mean = values.mean()',
      '        std = values.std()',
      '        df[column] = ((values - mean) / std) if pd.notna(std) and std != 0 else values.fillna(0)'
    ].join('\n');
  }

  if (step.action === 'encode_categorical') {
    return [
      `print(${stepLabelLiteral})`,
      `encode_columns = [column for column in ${columnsLiteral} if column in df.columns]`,
      `encode_method = ${pythonString(method || 'onehot')}`,
      'if encode_method == "onehot":',
      '    if encode_columns:',
      '        df = pd.get_dummies(df, columns=encode_columns, drop_first=False)',
      'else:',
      '    for column in encode_columns:',
      '        series = df[column].astype("string")',
      '        if encode_method == "frequency":',
      '            freq_map = series.value_counts(dropna=True, normalize=True)',
      '            df[column] = series.map(freq_map).fillna(0)',
      '        else:',
      '            categorical = pd.Categorical(series)',
      '            codes = pd.Series(categorical.codes, index=df.index)',
      '            df[column] = codes.replace(-1, np.nan)'
    ].join('\n');
  }

  if (step.action === 'remove_outliers') {
    return [
      `print(${stepLabelLiteral})`,
      `outlier_columns = [column for column in ${columnsLiteral} if column in df.columns]`,
      `outlier_method = ${pythonString(method || 'iqr')}`,
      `outlier_params = ${paramsLiteral}`,
      'for column in outlier_columns:',
      '    values = pd.to_numeric(df[column], errors="coerce")',
      '    if outlier_method == "zscore":',
      '        threshold = float(outlier_params.get("threshold", 3))',
      '        std = values.std()',
      '        if pd.notna(std) and std != 0:',
      '            z = ((values - values.mean()).abs() / std)',
      '            df = df[(z <= threshold) | z.isna()]',
      '    elif outlier_method == "clip":',
      '        q_low = float(outlier_params.get("lowerQuantile", 0.01))',
      '        q_high = float(outlier_params.get("upperQuantile", 0.99))',
      '        lower = values.quantile(q_low)',
      '        upper = values.quantile(q_high)',
      '        df[column] = values.clip(lower=lower, upper=upper)',
      '    else:',
      '        q1 = values.quantile(0.25)',
      '        q3 = values.quantile(0.75)',
      '        iqr = q3 - q1',
      '        if pd.notna(iqr) and iqr > 0:',
      '            lower = q1 - 1.5 * iqr',
      '            upper = q3 + 1.5 * iqr',
      '            mask = values.between(lower, upper) | values.isna()',
      '            df = df[mask]'
    ].join('\n');
  }

  const customCode = step.customCode?.trim();
  return [
    `print(${stepLabelLiteral})`,
    `custom_scope = {'df': df, 'pd': pd, 'np': np}`,
    `exec(${pythonString(customCode || '# no-op')}, {}, custom_scope)`,
    'if "df" in custom_scope:',
    '    df = custom_scope["df"]'
  ].join('\n');
}

function buildPreprocessingScript(params: {
  datasetId: string;
  filename: string;
  outputFilename: string;
  steps: PreprocessingStep[];
}) {
  const stepCode = params.steps.map((step, index) => buildStepCode(step, index)).join('\n\n');

  return [
    'import pandas as pd',
    'import numpy as np',
    '',
    `input_path = resolve_dataset_path(${pythonString(params.filename)}, ${pythonString(params.datasetId)})`,
    'suffix = input_path.lower().split(".")[-1]',
    'if suffix == "csv":',
    '    df = pd.read_csv(input_path)',
    'elif suffix == "json":',
    '    try:',
    '        df = pd.read_json(input_path, lines=True)',
    '    except ValueError:',
    '        df = pd.read_json(input_path)',
    'elif suffix in ("xlsx", "xls"):',
    '    df = pd.read_excel(input_path)',
    'else:',
    '    raise ValueError(f"Unsupported file extension: {suffix}")',
    '',
    stepCode,
    '',
    `output_path = ${pythonString(join('/workspace', params.outputFilename))}`,
    'df.to_csv(output_path, index=False)',
    `print(f"Saved preprocessed dataset to {output_path}")`
  ].join('\n');
}

function normalizeOutputStem(value: string): string {
  const stem = value
    .trim()
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return stem || `preprocessed_${Date.now()}`;
}

function buildOutputFilename(sourceFilename: string, outputName?: string): string {
  if (outputName && outputName.trim()) {
    return `${normalizeOutputStem(outputName)}.csv`;
  }

  const sourceBase = basename(sourceFilename, extname(sourceFilename));
  return `${normalizeOutputStem(sourceBase)}_preprocessed.csv`;
}

export async function executePreprocessingPipeline(
  input: ExecutePipelineInput
): Promise<ExecutePipelineResult> {
  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    throw new Error('Python runtime is unavailable. Ensure Docker is running.');
  }

  const dataset = await datasetRepository.getById(input.datasetId);
  if (!dataset) {
    throw new Error('Dataset not found');
  }

  if (dataset.projectId && dataset.projectId !== input.projectId) {
    throw new Error('Dataset does not belong to this project');
  }

  const sourcePath = join(env.datasetStorageDir, dataset.datasetId, dataset.filename);
  const workspacePath = join(env.executionWorkspaceDir, input.projectId, `preprocess-${randomUUID()}`);
  const outputFilename = buildOutputFilename(dataset.filename, input.outputName);

  const steps = preprocessingDraftSchema.parse(input.draftSteps).map(normalizeStep).filter((step) => step.enabled);
  if (steps.length === 0) {
    throw new Error('No enabled preprocessing steps to execute');
  }

  await mkdir(workspacePath, { recursive: true });

  const container = await getOrCreateContainer({
    projectId: input.projectId,
    pythonVersion: '3.11',
    workspacePath,
    datasetPaths: [sourcePath]
  });

  await syncWorkspaceDatasets(input.projectId, container.workspacePath);

  const script = buildPreprocessingScript({
    datasetId: dataset.datasetId,
    filename: dataset.filename,
    outputFilename,
    steps
  });

  const executionResult = await executeInContainer(container, script, env.executionTimeoutMs, {
    executionId: randomUUID()
  });

  if (executionResult.status !== 'success') {
    throw new Error(executionResult.stderr || executionResult.error || 'Preprocessing execution failed');
  }

  const workspaceOutputPath = join(container.workspacePath, outputFilename);
  const outputBuffer = await readFile(workspaceOutputPath);
  const outputStats = await stat(workspaceOutputPath);
  const profile = await profileDataset(outputBuffer, 'csv');

  const createdDataset = await datasetRepository.create({
    projectId: input.projectId,
    filename: outputFilename,
    fileType: 'csv',
    size: outputStats.size,
    profile,
    metadata: {
      stage: 'preprocessing',
      derivedFrom: dataset.datasetId,
      preprocessing: {
        stepCount: steps.length,
        steps: steps.map((step) => ({
          id: step.id,
          action: step.action,
          title: step.title,
          method: step.method,
          columns: step.columns
        }))
      }
    }
  });

  const datasetDir = join(env.datasetStorageDir, createdDataset.datasetId);
  await mkdir(datasetDir, { recursive: true });
  await writeFile(join(datasetDir, outputFilename), outputBuffer);

  let tableName = sanitizeTableName(createdDataset.filename, createdDataset.datasetId);

  if (hasDatabaseConfiguration()) {
    const loadResult = await loadDatasetIntoPostgres({
      datasetId: createdDataset.datasetId,
      filename: createdDataset.filename,
      fileType: createdDataset.fileType,
      buffer: outputBuffer,
      columns: createdDataset.columns
    });
    tableName = loadResult.tableName;
    await datasetRepository.update(createdDataset.datasetId, (current) => ({
      ...current,
      metadata: {
        ...(current.metadata ?? {}),
        tableName: loadResult.tableName,
        rowsLoaded: loadResult.rowsLoaded
      }
    }));
  } else {
    await datasetRepository.update(createdDataset.datasetId, (current) => ({
      ...current,
      metadata: {
        ...(current.metadata ?? {}),
        tableName
      }
    }));
  }

  return {
    datasetId: createdDataset.datasetId,
    filename: createdDataset.filename,
    tableName,
    executedStepCount: steps.length
  };
}
