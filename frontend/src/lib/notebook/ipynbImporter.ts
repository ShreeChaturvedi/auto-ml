import * as notebooksApi from '@/lib/api/notebooks';
import type { NotebookPhaseMetadata, NotebookCellType } from '@/types/notebook';

interface IpynbCell {
  cell_type: 'code' | 'markdown' | 'raw';
  source: string | string[];
  metadata?: Record<string, unknown>;
}

interface IpynbNotebook {
  nbformat: number;
  nbformat_minor: number;
  metadata?: Record<string, unknown>;
  cells: IpynbCell[];
}

export interface ParsedIpynb {
  name: string;
  cells: Array<{
    cellType: NotebookCellType;
    content: string;
  }>;
}

/**
 * Parse a .ipynb JSON string into a structured representation.
 * Throws on invalid format.
 */
export function parseIpynb(fileContent: string, filename: string): ParsedIpynb {
  let parsed: IpynbNotebook;
  try {
    parsed = JSON.parse(fileContent);
  } catch {
    throw new Error('Invalid JSON: the file is not a valid .ipynb notebook.');
  }

  if (!parsed.cells || !Array.isArray(parsed.cells)) {
    throw new Error('Invalid notebook format: missing "cells" array.');
  }

  if (typeof parsed.nbformat !== 'number' || parsed.nbformat < 3) {
    throw new Error(`Unsupported notebook format version: ${parsed.nbformat}`);
  }

  const cells = parsed.cells
    .filter((cell) => cell.cell_type === 'code' || cell.cell_type === 'markdown')
    .map((cell) => ({
      cellType: cell.cell_type as NotebookCellType,
      content: Array.isArray(cell.source) ? cell.source.join('') : cell.source
    }));

  const name = filename.replace(/\.ipynb$/i, '');

  return { name, cells };
}

/**
 * Import a parsed .ipynb notebook into the project.
 * Creates the notebook and all cells sequentially.
 */
export async function importIpynb(
  projectId: string,
  parsed: ParsedIpynb,
  metadata?: NotebookPhaseMetadata
) {
  const notebook = await notebooksApi.createNotebook(projectId, {
    name: parsed.name,
    metadata
  });

  try {
    // Create cells sequentially to maintain ordering
    for (let i = 0; i < parsed.cells.length; i++) {
      const cell = parsed.cells[i];
      await notebooksApi.createCell(notebook.notebookId, {
        content: cell.content,
        cellType: cell.cellType,
        position: i
      });
    }
  } catch (error) {
    try {
      await notebooksApi.deleteNotebook(projectId, notebook.notebookId);
    } catch (cleanupError) {
      console.error('Failed to rollback imported notebook after cell creation error:', cleanupError);
    }
    throw error;
  }

  return notebook;
}
