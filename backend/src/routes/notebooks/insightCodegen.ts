/**
 * Streaming endpoint for AI-generated notebook cells from EDA insights.
 *
 * POST /api/notebooks/:notebookId/cells/suggest
 *
 * Creates a cell, locks it, streams LLM-generated Python code token-by-token
 * via NDJSON, updates the cell with the final content, and releases the lock.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';

import { createLlmClient } from '../../services/llm/llmClient.js';
import { buildInsightCodegenPrompt } from '../../services/llm/prompts/insightCodegen.js';
import { acquireLock, releaseLock } from '../../services/notebook/cellLockingService.js';
import { deleteCell, writeCell } from '../../services/notebook/cellService.js';
import { initializeNdjsonStreamResponse } from '../query/nlHandler.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const insightContextSchema = z.object({
  columns: z.array(z.string()),
  issueType: z.string().min(1),
  severity: z.string().min(1),
  text: z.string().min(1),
  datasetSchema: z.array(z.object({ column: z.string(), dtype: z.string() })),
  tableName: z.string().min(1),
});

const requestBodySchema = z.object({
  insightContext: insightContextSchema,
});

// ---------------------------------------------------------------------------
// NDJSON writer
// ---------------------------------------------------------------------------

type SuggestCellEvent =
  | { type: 'cell_created'; cellId: string }
  | { type: 'token'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

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
  if (!notebookId) {
    res.status(400).json({ error: 'Missing notebookId parameter' });
    return;
  }

  const parsed = requestBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
    return;
  }
  const { insightContext } = parsed.data;

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
    const acquired = await acquireLock(cellId, 'ai');
    if (!acquired) {
      await deleteCell(cellId);
      writeSuggestEvent(res, { type: 'error', message: 'Cell is locked by another editor' });
      cellId = undefined; // prevent finally from releasing a lock we don't own
      return;
    }

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
