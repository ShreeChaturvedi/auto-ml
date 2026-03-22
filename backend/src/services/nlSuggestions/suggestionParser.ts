import { z } from 'zod';

import type { NlSuggestion, WorkflowPlaceholders } from './types.js';

const WORKFLOW_PLACEHOLDER_PHASE_SCHEMA = z.array(z.string().min(15).max(150)).min(3).max(6);

export const WORKFLOW_PLACEHOLDER_SCHEMA = z.object({
  preprocessing: WORKFLOW_PLACEHOLDER_PHASE_SCHEMA,
  featureEngineering: WORKFLOW_PLACEHOLDER_PHASE_SCHEMA,
  training: WORKFLOW_PLACEHOLDER_PHASE_SCHEMA,
});

export const SUGGESTION_SCHEMA = z.object({
  suggestions: z.array(
    z.object({
      prompt: z.string().min(20).max(240),
      label: z.string().min(6).max(80),
      category: z.string().min(3).max(40),
      tables: z.array(z.string().min(1)).min(1).max(4),
      rationale: z.string().min(12).max(180)
    })
  ).min(4).max(12),
  workflowPlaceholders: WORKFLOW_PLACEHOLDER_SCHEMA.optional()
});

export function normalizeSuggestionId(prompt: string, index: number): string {
  const base = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'suggestion'}-${index + 1}`;
}

export function normalizeSuggestions(raw: z.infer<typeof SUGGESTION_SCHEMA>, limit: number): NlSuggestion[] {
  const seen = new Set<string>();
  const normalized: NlSuggestion[] = [];

  for (const [index, suggestion] of raw.suggestions.entries()) {
    const prompt = suggestion.prompt.trim().replace(/\s+/g, ' ');
    const promptKey = prompt.toLowerCase();
    if (!prompt || seen.has(promptKey)) {
      continue;
    }

    seen.add(promptKey);
    normalized.push({
      id: normalizeSuggestionId(prompt, index),
      prompt,
      label: suggestion.label.trim(),
      category: suggestion.category.trim(),
      tables: Array.from(new Set(suggestion.tables.map((table) => table.trim()).filter(Boolean))),
      rationale: suggestion.rationale.trim()
    });

    if (normalized.length >= limit) {
      break;
    }
  }

  if (normalized.length === 0) {
    throw new Error('Suggestion model returned no usable suggestions.');
  }

  return normalized;
}

export function normalizeWorkflowPlaceholders(
  raw: z.infer<typeof WORKFLOW_PLACEHOLDER_SCHEMA>
): WorkflowPlaceholders {
  function dedupePhase(items: string[]): string[] {
    const seen = new Set<string>();
    return items
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter((s) => {
        const key = s.toLowerCase();
        if (!s || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  return {
    preprocessing: dedupePhase(raw.preprocessing),
    featureEngineering: dedupePhase(raw.featureEngineering),
    training: dedupePhase(raw.training),
  };
}

export function buildSuggestion(
  prompt: string,
  label: string,
  category: string,
  tables: string[],
  rationale: string,
  index: number
): NlSuggestion {
  return {
    id: normalizeSuggestionId(prompt, index),
    prompt,
    label,
    category,
    tables,
    rationale
  };
}
