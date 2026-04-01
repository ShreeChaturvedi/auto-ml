import { z } from 'zod';

import type { DatasetProfile } from '../../../types/dataset.js';
import type { LlmClient, LlmRequest } from '../llmClient.js';

export type PreprocessingTurnMode = 'answer_only' | 'action_required';

export interface PreprocessingTurnClassificationState {
  userPrompt: string;
  pendingApproval: boolean;
}

export interface PreprocessingTurnClassificationDeps {
  client: LlmClient;
  dataset: DatasetProfile;
  projectPlan?: string;
}

export interface PreprocessingTurnClassificationResult {
  turnMode: PreprocessingTurnMode;
  approvalDecisionIntent: 'approve' | 'reject' | undefined;
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

export function detectApprovalDecisionIntent(prompt: string): 'approve' | 'reject' | undefined {
  const normalizedPrompt = prompt.trim().toLowerCase();
  if (!normalizedPrompt || normalizedPrompt.includes('?')) {
    return undefined;
  }

  const rejectPatterns = [
    /\breject\b/,
    /\bdecline\b/,
    /\bcancel\b/,
    /\bskip\b/,
    /\bdon't apply\b/,
    /\bdo not apply\b/,
    /\bdon't commit\b/,
    /\bdo not commit\b/,
    /\bdon't proceed\b/,
    /\bdo not proceed\b/,
    /\bstop\b/
  ];
  if (rejectPatterns.some((pattern) => pattern.test(normalizedPrompt))) {
    return 'reject';
  }

  const approvePatterns = [
    /\bapprove\b/,
    /\bapply\b/,
    /\bcommit\b/,
    /\bproceed\b/,
    /\bgo ahead\b/,
    /\byes\b/,
    /\blooks good\b/,
    /\bship it\b/
  ];
  if (approvePatterns.some((pattern) => pattern.test(normalizedPrompt))) {
    return 'approve';
  }

  return undefined;
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
  const approvalDecisionIntent = detectApprovalDecisionIntent(state.userPrompt);

  if (state.pendingApproval) {
    if (approvalDecisionIntent) {
      return {
        turnMode: 'action_required',
        approvalDecisionIntent,
        classificationRationale: 'The user provided an explicit approval decision for a pending preprocessing step.',
        updatedAt: nowIso()
      };
    }

    return {
      turnMode: 'action_required',
      approvalDecisionIntent: undefined,
      classificationRationale: 'A preprocessing step is awaiting explicit approval.',
      updatedAt: nowIso()
    };
  }

  if (state.userPrompt === '__tool_continuation__') {
    return {
      turnMode: 'action_required',
      approvalDecisionIntent: undefined,
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
        approvalDecisionIntent: undefined,
        classificationRationale: parsed.data.rationale ?? '',
        updatedAt: nowIso()
      };
    }
  } catch {
    // Fall through to the safer action-required default.
  }

  return {
    turnMode: 'action_required',
    approvalDecisionIntent: undefined,
    classificationRationale: 'Classification fallback defaulted to action_required for safety.',
    updatedAt: nowIso()
  };
}
