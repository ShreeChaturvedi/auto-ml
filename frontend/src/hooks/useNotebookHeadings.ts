import { useRef, useMemo } from 'react';
import { useNotebookStore } from '@/stores/notebookStore';
import { extractTocHeadings, type TocHeading } from '@/lib/markdown/tocUtils';

/**
 * Derives TOC headings from all markdown cells in the active notebook.
 * Uses a stable selector so code-cell mutations (execution, output) don't
 * invalidate the memo — only markdown content changes trigger re-extraction.
 */
export function useNotebookHeadings(): TocHeading[] {
  const cells = useNotebookStore((s) => s.cells);

  // Build a cache key from only the markdown cells' IDs and content.
  // This avoids re-running extractTocHeadings when only code cells change.
  const prevKeyRef = useRef('');
  const prevHeadingsRef = useRef<TocHeading[]>([]);

  return useMemo(() => {
    const markdownCells = cells.filter((c) => c.cellType === 'markdown');
    const key = markdownCells.map((c) => `${c.cellId}:${c.content}`).join('\0');
    if (key === prevKeyRef.current) return prevHeadingsRef.current;
    prevKeyRef.current = key;
    prevHeadingsRef.current = markdownCells.flatMap((c) =>
      extractTocHeadings(c.content, c.cellId)
    );
    return prevHeadingsRef.current;
  }, [cells]);
}
