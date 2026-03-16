/**
 * Streaming endpoint for AI-generated notebook cells from EDA insights.
 *
 * POST /api/notebooks/:notebookId/cells/suggest
 *
 * Creates a cell, locks it, streams LLM-generated Python code token-by-token
 * via NDJSON, updates the cell with the final content, and releases the lock.
 */

import type { Request, Response } from 'express';

import { createLlmClient } from '../../services/llm/llmClient.js';
import {
  buildInsightCodegenPrompt,
  type InsightCodegenContext
} from '../../services/llm/prompts/insightCodegen.js';
import { acquireLock, releaseLock } from '../../services/notebook/cellLockingService.js';
import { writeCell } from '../../services/notebook/cellService.js';
import { initializeNdjsonStreamResponse } from '../query/nlHandler.js';

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

type SuggestCellEvent =
  | { type: 'cell_created'; cellId: string }
  | { type: 'token'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

// ---------------------------------------------------------------------------
// NDJSON writer
// ---------------------------------------------------------------------------

function writeSuggestEvent(res: Response, event: SuggestCellEvent): void {
  if (!res.writableEnded) {
    res.write(JSON.stringify(event) + '\n');
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function handleSuggestCell(req: Request, res: Response): Promise<void> {
  const { notebookId } = req.params;
  const { insightContext } = req.body as { projectId?: string; insightContext?: InsightCodegenContext };

  if (!notebookId || !insightContext) {
    res.status(400).json({ error: 'Missing required fields: notebookId and insightContext' });
    return;
  }

  initializeNdjsonStreamResponse(res);

  let cellId: string | undefined;
  try {
    // 1. Create an empty cell
    const cell = await writeCell(notebookId, {
      content: '',
      cellType: 'code',
      metadata: { isSuggested: true }
    });
    cellId = cell.cellId;

    // 2. Lock the cell for AI editing
    await acquireLock(cellId, 'ai');

    // 3. Notify the client that the cell exists
    writeSuggestEvent(res, { type: 'cell_created', cellId });

    // 4. Build prompt and stream LLM response
    const messages = buildInsightCodegenPrompt(insightContext);
    const client = createLlmClient();

    const content = await client.stream(
      { messages, maxOutputTokens: 2048, temperature: 0.3 },
      {
        onToken: (token: string) => {
          writeSuggestEvent(res, { type: 'token', content: token });
        }
      }
    );

    // 5. Update cell with the full generated content
    await writeCell(notebookId, {
      cellId,
      content,
      cellType: 'code',
      metadata: { isSuggested: true }
    });

    // 6. Signal completion
    writeSuggestEvent(res, { type: 'done' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    writeSuggestEvent(res, { type: 'error', message });
  } finally {
    // Always release the lock if we acquired one
    if (cellId) {
      try {
        await releaseLock(cellId);
      } catch {
        /* lock release failure is non-fatal */
      }
    }
    if (!res.writableEnded) {
      res.end();
    }
  }
}
