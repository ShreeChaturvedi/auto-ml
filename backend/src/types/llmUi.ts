import { z } from 'zod';

export const ControlSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['number', 'boolean', 'select', 'text', 'column']),
  value: z.unknown(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional()
});

export const FeatureSpecSchema = z.object({
  sourceColumn: z.string(),
  secondaryColumn: z.string().optional(),
  featureName: z.string(),
  description: z.string().optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional()
});

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

export const ModelTemplateSchema = z.object({
  name: z.string(),
  taskType: z.enum(['classification', 'regression', 'clustering']),
  library: z.string(),
  importPath: z.string(),
  modelClass: z.string(),
  parameters: z.array(ModelParamSchema),
  metrics: z.array(z.string())
});

export const UiItemSchema = z.discriminatedUnion('type', [
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
  }),
  z.object({
    type: z.literal('callout'),
    tone: z.enum(['info', 'warning', 'success']),
    text: z.string()
  })
]);

export const UiSectionSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  layout: z.enum(['grid', 'column', 'row']).optional(),
  columns: z.number().optional(),
  items: z.array(UiItemSchema)
});

export const UiSchema = z.object({
  version: z.literal('1'),
  kind: z.enum(['feature_engineering', 'training']),
  title: z.string().optional(),
  summary: z.string().optional(),
  sections: z.array(UiSectionSchema)
});
