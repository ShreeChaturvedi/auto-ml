export type DatasetContinuityMode = 'continue' | 'restart_from_original';

interface DatasetContinuityContext {
  datasetId: string | null;
  datasetLabel?: string | null;
}

function normalizePrompt(prompt: string): string {
  return prompt.trim();
}

export function buildDatasetContinuityPrompt(
  prompt: string,
  mode: DatasetContinuityMode,
  context: DatasetContinuityContext
): string {
  const basePrompt = normalizePrompt(prompt);
  const datasetLabel = context.datasetLabel?.trim() || context.datasetId || 'selected dataset';

  if (mode === 'restart_from_original') {
    return `${basePrompt}

Dataset continuity directive:
- Start from the ORIGINAL source dataset "${datasetLabel}" for this request.
- Begin a NEW preprocessing run and do not reuse any previous runId.
- Reload data from source instead of reusing previously transformed in-memory data.
- The active dataset is already set — proceed directly to profiling and planning.`;
  }

  return `${basePrompt}

Dataset continuity directive:
- Continue from the CURRENT working edited dataset for this workbook/tab only.
- Reuse current run context and in-memory dataframe state when available.
- Do not reuse state from any other workbook/tab.
- Do not reload the original source dataset unless explicitly requested.`;
}
