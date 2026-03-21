import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { AskUserPayloadSchema, PlanExitPayloadSchema, ToolCallSchema } from '../../types/llm.js';
import { UiSchema } from '../../types/llmUi.js';

import type { WorkflowNodeContract } from './contracts.js';

const ToolActionPlanSchema = z.object({
  kind: z.literal('tool_call'),
  toolName: z.string().min(1),
  toolArgs: z.record(z.unknown()).optional(),
  rationale: z.string().optional()
});

const AskUserActionPlanSchema = z.object({
  kind: z.literal('ask_user'),
  questions: AskUserPayloadSchema.shape.questions
});

const RenderUiActionPlanSchema = z.object({
  kind: z.literal('render_ui'),
  ui: UiSchema
});

const PlanExitActionPlanSchema = z.object({
  kind: z.literal('plan_exit'),
  planName: PlanExitPayloadSchema.shape.planName,
  planMarkdown: PlanExitPayloadSchema.shape.planMarkdown
});

const AssistantMessageActionPlanSchema = z.object({
  kind: z.literal('assistant_message'),
  message: z.string().min(1)
});

export const WorkflowActionPlanSchema = z.discriminatedUnion('kind', [
  ToolActionPlanSchema,
  AskUserActionPlanSchema,
  RenderUiActionPlanSchema,
  PlanExitActionPlanSchema,
  AssistantMessageActionPlanSchema
]);

export type WorkflowActionPlan = z.infer<typeof WorkflowActionPlanSchema>;

function extractFirstJsonValue(raw: string): string | null {
  const start = raw.search(/[[{]/);
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      depth += 1;
      continue;
    }

    if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, index + 1);
      }
    }
  }

  return null;
}

export function parsePlannerResponse(raw: string): WorkflowActionPlan {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const normalized = fenced?.[1] ?? trimmed;

  try {
    return WorkflowActionPlanSchema.parse(JSON.parse(normalized) as unknown);
  } catch (error) {
    const extracted = extractFirstJsonValue(normalized);
    if (extracted && extracted !== normalized) {
      return WorkflowActionPlanSchema.parse(JSON.parse(extracted) as unknown);
    }
    throw error;
  }
}

export function validatePlan(
  plan: WorkflowActionPlan,
  contract: WorkflowNodeContract
): {
  error?: string;
  toolCall?: z.infer<typeof ToolCallSchema>;
  askUserPayload?: z.infer<typeof AskUserPayloadSchema>;
  planExitPayload?: z.infer<typeof PlanExitPayloadSchema>;
  uiPayload?: z.infer<typeof UiSchema>;
  message?: string;
} {
  switch (plan.kind) {
    case 'tool_call': {
      const allowedTool = contract.allowedTools.find((tool) => tool.name === plan.toolName);
      if (!allowedTool) {
        return { error: `Planner selected disallowed tool: ${plan.toolName}` };
      }

      const parsed = ToolCallSchema.safeParse({
        id: `wf-call-${randomUUID()}`,
        tool: plan.toolName,
        args: plan.toolArgs ?? {},
        rationale: plan.rationale
      });

      if (!parsed.success) {
        return { error: 'Planner tool call failed validation.' };
      }

      return { toolCall: parsed.data };
    }
    case 'ask_user':
      return contract.allowAskUser
        ? { askUserPayload: { questions: plan.questions } }
        : { error: 'Planner returned ask_user in a node that does not allow it.' };
    case 'render_ui':
      return contract.allowRenderUi
        ? { uiPayload: plan.ui }
        : { error: 'Planner returned render_ui in a node that does not allow it.' };
    case 'plan_exit': {
      const parsed = PlanExitPayloadSchema.safeParse({
        planName: plan.planName,
        planMarkdown: plan.planMarkdown
      });

      if (!parsed.success) {
        return { error: 'Planner returned an invalid plan_exit payload.' };
      }

      return contract.allowPlanExit
        ? { planExitPayload: parsed.data }
        : { error: 'Planner returned plan_exit in a node that does not allow it.' };
    }
    case 'assistant_message':
      return contract.allowAssistantMessage
        ? { message: plan.message.trim() }
        : { error: 'Planner returned assistant_message in a node that does not allow it.' };
    default:
      return { error: 'Planner returned an unsupported action kind.' };
  }
}
