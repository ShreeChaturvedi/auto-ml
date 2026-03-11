import { useEffect, useMemo, useRef } from 'react';
import { generateFeatureEngineeringCode } from '@/lib/features/codeGenerator';
import { useNotebookStore } from '@/stores/notebookStore';
import type { FeatureSpec } from '@/types/feature';

const FEATURE_PREVIEW_CELL_TITLE = 'Feature Pipeline Preview';

interface DatasetFileInfo {
  name: string;
  metadata?: {
    datasetId?: string;
    [key: string]: unknown;
  };
}

/**
 * Generates a Python code preview for the active feature pipeline and
 * syncs it to a dedicated notebook cell, creating or updating the cell
 * as needed.
 */
export function useFeatureCodeGen(
  activeFeatures: FeatureSpec[],
  selectedDatasetFile: DatasetFileInfo | undefined
): void {
  const notebookCells = useNotebookStore((state) => state.cells);
  const createNotebookCell = useNotebookStore((state) => state.createCell);
  const updateNotebookCell = useNotebookStore((state) => state.updateCell);

  const lastSyncedCodePreviewRef = useRef('');

  // --- Code preview computation ---
  const codePreview = useMemo(() => {
    if (!selectedDatasetFile) return '';
    if (activeFeatures.length === 0) return '';

    return generateFeatureEngineeringCode(activeFeatures, selectedDatasetFile.name, {
      datasetId: selectedDatasetFile.metadata?.datasetId,
      includeComments: true
    });
  }, [activeFeatures, selectedDatasetFile]);

  // --- Sync code preview to notebook cell ---
  useEffect(() => {
    if (!codePreview.trim()) return;
    if (lastSyncedCodePreviewRef.current === codePreview) return;

    const existingPreviewCell = notebookCells.find(
      (cell) => cell.cellType === 'code' && cell.title === FEATURE_PREVIEW_CELL_TITLE
    );

    const syncCodePreview = async () => {
      if (existingPreviewCell) {
        if (existingPreviewCell.content === codePreview) {
          lastSyncedCodePreviewRef.current = codePreview;
          return;
        }

        const updated = await updateNotebookCell(existingPreviewCell.cellId, {
          title: FEATURE_PREVIEW_CELL_TITLE,
          content: codePreview
        });

        if (updated) {
          lastSyncedCodePreviewRef.current = codePreview;
        }
        return;
      }

      const created = await createNotebookCell({
        cellType: 'code',
        title: FEATURE_PREVIEW_CELL_TITLE,
        content: codePreview
      });

      if (created) {
        lastSyncedCodePreviewRef.current = codePreview;
      }
    };

    void syncCodePreview();
  }, [codePreview, createNotebookCell, notebookCells, updateNotebookCell]);
}
