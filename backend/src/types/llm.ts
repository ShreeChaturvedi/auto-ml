import { z } from 'zod';

export const ToolNameSchema = z.enum([
  'list_project_files',
  'get_dataset_profile',
  'get_dataset_sample',
  'search_documents',
  'ask_user',
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

export const AskUserQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  header: z.string().min(1),
  type: z.enum(['single_select', 'multi_select', 'free_text']),
  options: z
    .array(
      z.object({
        label: z.string().min(1),
        description: z.string().min(1)
      })
    )
    .optional(),
  allowCustom: z.boolean().optional()
});

export const AskUserPayloadSchema = z.object({
  questions: z.array(AskUserQuestionSchema)
});

export const LlmEnvelopeSchema = z.object({
  version: z.literal('1'),
  kind: z.enum(['feature_engineering', 'training', 'onboarding']),
  message: z.string().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
  ask_user: AskUserPayloadSchema.optional(),
  ui: z.unknown().optional()
});

export type LlmEnvelope = z.infer<typeof LlmEnvelopeSchema>;

export interface ToolResult {
  id: string;
  tool: ToolCall['tool'];
  output?: unknown;
  error?: string;
}
