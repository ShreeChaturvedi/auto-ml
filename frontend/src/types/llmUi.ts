import { z } from 'zod';

export const ToolNameSchema = z.enum([
  'list_project_files',
  'get_dataset_profile',
  'get_dataset_sample',
  'search_documents',
  'list_cells',
  'read_cell',
  'write_cell',
  'edit_cell',
  'run_cell'
]);

export const ToolCallSchema = z.object({
  id: z.string(),
  tool: ToolNameSchema,
  args: z.record(z.string(), z.unknown()).optional(),
  rationale: z.string().optional(),
  thoughtSignature: z.string().optional()
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ToolResultSchema = z.object({
  id: z.string(),
  tool: ToolNameSchema,
  output: z.unknown().optional(),
  error: z.string().optional()
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

export const ControlSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['number', 'boolean', 'select', 'text', 'column', 'slider']),
  value: z.unknown(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional()
});

export type Control = z.infer<typeof ControlSchema>;

export const FeatureSpecSchema = z.object({
  sourceColumn: z.string(),
  secondaryColumn: z.string().optional(),
  featureName: z.string(),
  description: z.string().optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional()
});

export type FeatureSpecDraft = z.infer<typeof FeatureSpecSchema>;

export const ModelParamSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['number', 'string', 'boolean', 'select']),
  default: z.unknown(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional()
});

export type ModelParam = z.infer<typeof ModelParamSchema>;

export const ModelTemplateSchema = z.object({
  name: z.string(),
  taskType: z.enum(['classification', 'regression', 'clustering']),
  library: z.string(),
  importPath: z.string(),
  modelClass: z.string(),
  parameters: z.array(ModelParamSchema),
  metrics: z.array(z.string())
});

export type ModelTemplateDraft = z.infer<typeof ModelTemplateSchema>;

export const UiItemSchema = z.discriminatedUnion('type', [
  // NEW TYPES - Primary UI elements
  // Report card - display summaries, info
  z.object({
    type: z.literal('report'),
    id: z.string(),
    title: z.string(),
    content: z.string(),
    format: z.enum(['text', 'markdown', 'json']).optional()
  }),
  // Input form - collect user input
  z.object({
    type: z.literal('input_form'),
    id: z.string(),
    title: z.string().optional(),
    controls: z.array(ControlSchema)
  }),
  // Callout - info/warning/success messages
  z.object({
    type: z.literal('callout'),
    tone: z.enum(['info', 'warning', 'success']),
    text: z.string()
  }),
  // LEGACY TYPES - for backwards compatibility
  z.object({
    type: z.literal('dataset_summary'),
    datasetId: z.string(),
    filename: z.string(),
    rows: z.number(),
    columns: z.number(),
    notes: z.array(z.string()).optional()
  }),
  z.object({
    type: z.literal('feature_suggestion'),
    id: z.string(),
    feature: FeatureSpecSchema,
    rationale: z.string(),
    impact: z.enum(['high', 'medium', 'low']),
    controls: z.array(ControlSchema).optional()
  }),
  z.object({
    type: z.literal('model_recommendation'),
    id: z.string(),
    template: ModelTemplateSchema,
    parameters: z.record(z.string(), z.unknown()),
    rationale: z.string()
  }),
  z.object({
    type: z.literal('code_cell'),
    id: z.string(),
    title: z.string().optional(),
    language: z.literal('python'),
    content: z.string(),
    autoRun: z.boolean().optional()
  }),
  z.object({
    type: z.literal('action'),
    id: z.string(),
    label: z.string(),
    actionType: z.enum(['insert_code_cell', 'apply_features', 'train_model']),
    payload: z.record(z.string(), z.unknown()).optional()
  })
]);

export type UiItem = z.infer<typeof UiItemSchema>;

export const UiSectionSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  layout: z.enum(['grid', 'column', 'row']).optional(),
  columns: z.number().optional(),
  items: z.array(UiItemSchema)
});

export type UiSection = z.infer<typeof UiSectionSchema>;

export const UiSchema = z.object({
  version: z.literal('1'),
  kind: z.enum(['feature_engineering', 'training']),
  title: z.string().optional(),
  summary: z.string().optional(),
  sections: z.array(UiSectionSchema)
});

export type UiSchema = z.infer<typeof UiSchema>;

export const LlmEnvelopeSchema = z.object({
  version: z.literal('1'),
  kind: z.enum(['feature_engineering', 'training']),
  message: z.string().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
  ui: UiSchema.nullable().optional()
});

export type LlmEnvelope = z.infer<typeof LlmEnvelopeSchema>;

// ChatMessage type for interleaved rendering in Training tab
export type ChatMessage =
  | { id: string; type: 'user'; content: string; timestamp: number }
  | { id: string; type: 'assistant_text'; content: string }
  | { id: string; type: 'thinking'; content: string; isComplete: boolean; startTime: number }
  | { id: string; type: 'tool_call'; call: ToolCall; result?: ToolResult }
  | { id: string; type: 'code_cell'; cellId: string }
  | { id: string; type: 'ui'; schema: UiSchema }
  | { id: string; type: 'error'; message: string };
