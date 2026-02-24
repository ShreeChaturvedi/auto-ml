import { z } from 'zod';

export const ToolNameSchema = z.enum([
  'list_project_files',
  'get_dataset_profile',
  'get_dataset_sample',
  'search_documents',
  'ask_user',
  'plan_exit',
  'list_cells',
  'read_cell',
  'write_cell',
  'edit_cell',
  'run_cell',
  'delete_cell',
  'reorder_cells',
  'insert_cell',
  'install_package',
  'uninstall_package',
  'list_packages'
]);

export const ToolCallSchema = z.object({
  id: z.string().min(1),
  tool: ToolNameSchema,
  args: z.record(z.unknown()).optional(),
  rationale: z.string().optional(),
  thoughtSignature: z.string().optional()
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

const AskUserOptionSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1)
});

const AskUserQuestionBaseSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  header: z.string().min(1),
  allowCustom: z.boolean().optional()
});

const AskUserSelectQuestionSchema = AskUserQuestionBaseSchema.extend({
  type: z.enum(['single_select', 'multi_select']),
  options: z.array(AskUserOptionSchema).min(1)
});

const AskUserFreeTextQuestionSchema = AskUserQuestionBaseSchema.extend({
  type: z.literal('free_text'),
  options: z.array(AskUserOptionSchema).optional()
});

export const AskUserQuestionSchema = z.union([
  AskUserSelectQuestionSchema,
  AskUserFreeTextQuestionSchema
]);

export const AskUserPayloadSchema = z.object({
  questions: z.array(AskUserQuestionSchema).min(1)
});

export const PlanExitPayloadSchema = z.object({
  planName: z.string().min(1).max(120).optional(),
  planMarkdown: z.string().min(1).max(50000)
});

export const LlmEnvelopeSchema = z.object({
  version: z.literal('1'),
  kind: z.enum(['feature_engineering', 'training', 'onboarding']),
  message: z.string().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
  ask_user: AskUserPayloadSchema.optional(),
  plan_exit: PlanExitPayloadSchema.optional(),
  ui: z.unknown().optional()
});

export type LlmEnvelope = z.infer<typeof LlmEnvelopeSchema>;

export interface ToolResult {
  id: string;
  tool: ToolCall['tool'];
  output?: unknown;
  error?: string;
}
