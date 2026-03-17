import { LlmEnvelopeSchema, LlmUsageSchema } from '@/types/llmUi';
import {
  WorkflowArtifactUpdatedEventSchema,
  WorkflowErrorEventSchema,
  WorkflowPauseEventSchema,
  WorkflowStateSchema,
  WorkflowToolExecutedEventSchema
} from '@/types/workflow';

import type { LlmStreamEvent } from './llm';

export function emitParsedLlmStreamEvent(
  payload: LlmStreamEvent,
  onEvent: (event: LlmStreamEvent) => void
) {
  if (payload.type === 'envelope') {
    const parsed = LlmEnvelopeSchema.safeParse(payload.envelope);
    if (!parsed.success) {
      onEvent({ type: 'error', message: 'LLM envelope failed validation.' });
      return;
    }

    onEvent({ type: 'envelope', envelope: parsed.data });
    if (parsed.data.ask_user?.questions?.length) {
      onEvent({ type: 'ask_user', questions: parsed.data.ask_user.questions });
    }
    if (parsed.data.plan_exit?.planMarkdown) {
      onEvent({
        type: 'plan_exit',
        planName: parsed.data.plan_exit.planName,
        planMarkdown: parsed.data.plan_exit.planMarkdown
      });
    }
    return;
  }

  if (payload.type === 'workflow_state') {
    const parsed = WorkflowStateSchema.safeParse(payload.state);
    onEvent(
      parsed.success
        ? { type: 'workflow_state', state: parsed.data }
        : { type: 'error', message: 'Workflow state payload failed validation.' }
    );
    return;
  }

  if (payload.type === 'tool_executed') {
    const parsed = WorkflowToolExecutedEventSchema.safeParse(payload);
    onEvent(
      parsed.success
        ? parsed.data
        : { type: 'error', message: 'Workflow tool execution payload failed validation.' }
    );
    return;
  }

  if (payload.type === 'artifact_updated') {
    const parsed = WorkflowArtifactUpdatedEventSchema.safeParse(payload);
    onEvent(
      parsed.success
        ? parsed.data
        : { type: 'error', message: 'Workflow artifact payload failed validation.' }
    );
    return;
  }

  if (payload.type === 'workflow_pause') {
    const parsed = WorkflowPauseEventSchema.safeParse(payload);
    onEvent(
      parsed.success
        ? parsed.data
        : { type: 'error', message: 'Workflow pause payload failed validation.' }
    );
    return;
  }

  if (payload.type === 'workflow_error') {
    const parsed = WorkflowErrorEventSchema.safeParse(payload);
    onEvent(
      parsed.success
        ? parsed.data
        : { type: 'error', message: 'Workflow error payload failed validation.' }
    );
    return;
  }

  if (payload.type === 'usage') {
    const parsed = LlmUsageSchema.safeParse(payload.usage);
    onEvent(
      parsed.success
        ? { type: 'usage', usage: parsed.data }
        : { type: 'error', message: 'LLM usage payload failed validation.' }
    );
    return;
  }

  onEvent(payload);
}
