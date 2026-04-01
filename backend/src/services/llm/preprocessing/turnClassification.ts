import { z } from 'zod';

import type { DatasetProfile } from '../../../types/dataset.js';
import type { LlmClient, LlmRequest } from '../llmClient.js';

export type PreprocessingTurnMode = 'answer_only' | 'action_required';

export interface PreprocessingTurnClassificationState {
  userPrompt: string;
}

export interface PreprocessingTurnClassificationDeps {
  client: LlmClient;
  dataset: DatasetProfile;
  projectPlan?: string;
}

export interface PreprocessingTurnClassificationResult {
  turnMode: PreprocessingTurnMode;
  classificationRationale: string;
  updatedAt: string;
}

const TurnClassificationSchema = z.object({
  turnMode: z.enum(['answer_only', 'action_required']),
  rationale: z.string().optional()
});

function nowIso(): string {
  return new Date().toISOString();
}

function buildClassificationRequest(
  state: PreprocessingTurnClassificationState,
  deps: PreprocessingTurnClassificationDeps
): LlmRequest {
  return {
    messages: [
      {
        role: 'system',
        content: [
          'You are a strict preprocessing turn classifier.',
          'Classify the user turn as either answer_only or action_required.',
          'Use answer_only only when the user is asking for explanation, diagnosis, or advice and is not asking to change data, notebook cells, or preprocessing state.',
          'Use action_required when the user asks to modify preprocessing, inspect notebook/data state to determine an action, continue an in-progress workflow, or execute a transformation.',
          'Return JSON only with keys turnMode and rationale.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `Dataset: ${deps.dataset.filename} (${deps.dataset.nRows} rows, ${deps.dataset.nCols} columns)`,
          deps.projectPlan?.trim() ? `Project plan:\n${deps.projectPlan}` : 'Project plan: (none)',
          `User prompt: ${state.userPrompt || 'Continue the current preprocessing workflow.'}`
        ].join('\n\n')
      }
    ],
    responseMimeType: 'application/json',
    maxOutputTokens: 300,
    reasoningEffort: 'low'
  };
}

export async function classifyPreprocessingTurn(
  state: PreprocessingTurnClassificationState,
  deps: PreprocessingTurnClassificationDeps
): Promise<PreprocessingTurnClassificationResult> {
  if (state.userPrompt === '__tool_continuation__') {
    return {
      turnMode: 'action_required',
      classificationRationale: 'This turn continues an active preprocessing workflow.',
      updatedAt: nowIso()
    };
  }

  try {
    const raw = await deps.client.complete(buildClassificationRequest(state, deps));
    const parsed = TurnClassificationSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return {
        turnMode: parsed.data.turnMode,
        classificationRationale: parsed.data.rationale ?? '',
        updatedAt: nowIso()
      };
    }
  } catch {
    // Fall through to the safer action-required default.
  }

  return {
    turnMode: 'action_required',
    classificationRationale: 'Classification fallback defaulted to action_required for safety.',
    updatedAt: nowIso()
  };
}
