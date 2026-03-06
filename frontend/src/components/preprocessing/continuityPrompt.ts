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
  const datasetId = context.datasetId?.trim();

  if (mode === 'restart_from_original') {
    const datasetInstruction = datasetId
      ? `Call set_active_dataset with datasetId "${datasetId}" before proposing transformations.`
      : 'Call set_active_dataset before proposing transformations.';
    return `${basePrompt}

Dataset continuity directive:
- Start from the ORIGINAL source dataset "${datasetLabel}" for this request.
- Begin a NEW preprocessing run and do not reuse any previous runId.
- Reload data from source instead of reusing previously transformed in-memory data.
- ${datasetInstruction}`;
  }

  return `${basePrompt}

Dataset continuity directive:
- Continue from the CURRENT working edited dataset for this tab/run.
- Reuse current run context and in-memory dataframe state when available.
- Do not reload the original source dataset unless explicitly requested.`;
}
