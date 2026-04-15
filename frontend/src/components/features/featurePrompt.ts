interface FeaturePromptContext {
  datasetLabel?: string | null;
  targetColumn?: string;
}

function normalizePrompt(prompt: string): string {
  return prompt.trim();
}

export function buildFeatureIntentPrompt(
  prompt: string,
  context: FeaturePromptContext
): string {
  const basePrompt = normalizePrompt(prompt);
  const datasetLabel = context.datasetLabel?.trim() || 'selected dataset';
  const targetDirective = context.targetColumn?.trim()
    ? `- Use "${context.targetColumn}" as the current target context only when the user's request calls for target-aware feature design.`
    : '- No target column is selected. Do not invent one or assume the first column is the target.';

  return `${basePrompt}

Feature engineering directive:
- Use only the currently selected dataset "${datasetLabel}" for this draft pipeline.
- Treat the user's explicit notes, dataset summary, and requested next actions in this message as the primary source of truth for this turn.
- If the user pasted a post-clean profile or listed specific columns/issues, propose features tied to those named items first instead of drifting to generic feature ideas.
- Do not reuse stale proposals, targets, or context from another dataset, target, or draft.
${targetDirective}`;
}
