import { z } from 'zod';

import { ToolCallSchema, ToolResultSchema, UiSchema } from './llmUi';

export const WorkflowPhaseSchema = z.enum([
  'preprocessing',
  'feature_engineering',
  'training',
  'onboarding'
]);

export type WorkflowPhase = z.infer<typeof WorkflowPhaseSchema>;

export const WorkflowStatusSchema = z.enum([
  'running',
  'paused',
  'failed_retryable',
  'failed_terminal',
  'completed',
  'interrupted'
]);

export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const WorkflowModeSchema = z.enum([
  'answer',
  'inspect',
  'action',
  'await_input',
  'summarize',
  'failed',
  'completed'
]);

export type WorkflowMode = z.infer<typeof WorkflowModeSchema>;

export const WorkflowStateSchema = z.object({
  runId: z.string().min(1),
  threadId: z.string().min(1),
  phase: WorkflowPhaseSchema,
  currentNode: z.string().min(1),
  status: WorkflowStatusSchema,
  mode: WorkflowModeSchema.optional(),
  revision: z.number().int().nonnegative().optional(),
  activeStepId: z.string().min(1).optional(),
  pendingInputKind: z.string().min(1).optional(),
  pauseReason: z.string().min(1).optional()
}).passthrough();

export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

export const WorkflowArtifactSchema = z.object({
  artifactId: z.string().min(1).optional(),
  kind: z.string().min(1),
  label: z.string().min(1).optional(),
  payload: z.unknown().optional(),
  ui: UiSchema.nullable().optional()
}).passthrough();

export type WorkflowArtifact = z.infer<typeof WorkflowArtifactSchema>;

export const WorkflowToolExecutedEventSchema = z.object({
  type: z.literal('tool_executed'),
  call: ToolCallSchema,
  result: ToolResultSchema,
  state: WorkflowStateSchema.optional()
});

export type WorkflowToolExecutedEvent = z.infer<typeof WorkflowToolExecutedEventSchema>;

export const WorkflowArtifactUpdatedEventSchema = z.object({
  type: z.literal('artifact_updated'),
  artifact: WorkflowArtifactSchema,
  state: WorkflowStateSchema.optional()
});

export type WorkflowArtifactUpdatedEvent = z.infer<typeof WorkflowArtifactUpdatedEventSchema>;

export const WorkflowPauseEventSchema = z.object({
  type: z.literal('workflow_pause'),
  reason: z.string().min(1),
  message: z.string().optional(),
  pendingInputKind: z.string().min(1).optional(),
  // Pause ui carries ask_user payloads, approval data, etc. — not the
  // structured render_ui schema.  Accept any shape so we don't reject
  // valid pause events from the backend.
  ui: z.any().nullable().optional(),
  state: WorkflowStateSchema.optional()
});

export type WorkflowPauseEvent = z.infer<typeof WorkflowPauseEventSchema>;

export const WorkflowErrorEventSchema = z.object({
  type: z.literal('workflow_error'),
  message: z.string().min(1),
  retryable: z.boolean().optional(),
  state: WorkflowStateSchema.optional()
});

export type WorkflowErrorEvent = z.infer<typeof WorkflowErrorEventSchema>;
