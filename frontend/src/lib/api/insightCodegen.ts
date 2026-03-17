/**
 * Insight Codegen API — streams LLM-generated notebook cells from EDA insights.
 *
 * Consumes the NDJSON endpoint at POST /api/notebooks/:notebookId/cells/suggest
 * and yields typed events to the caller.
 */

import { readNdjsonStream } from './streamReader';
import { getApiBaseUrl } from './client';

export interface InsightCodegenContext {
  columns: string[];
  issueType: string;
  severity: string;
  text: string;
  datasetSchema: Array<{ column: string; dtype: string }>;
  tableName: string;
}

export type SuggestCellEvent =
  | { type: 'cell_created'; cellId: string }
  | { type: 'token'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export async function streamSuggestCell(
  notebookId: string,
  context: InsightCodegenContext,
  onEvent: (event: SuggestCellEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/notebooks/${notebookId}/cells/suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ insightContext: context }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Suggest cell request failed (${res.status}): ${text}`);
  }

  let sawTerminal = false;
  for await (const event of readNdjsonStream<SuggestCellEvent>(res)) {
    onEvent(event);
    if (event.type === 'done' || event.type === 'error') {
      sawTerminal = true;
    }
  }

  if (!sawTerminal) {
    onEvent({ type: 'error', message: 'Stream ended without terminal event' });
  }
}
