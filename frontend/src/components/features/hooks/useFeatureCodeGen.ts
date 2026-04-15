import { useEffect, useMemo, useRef } from 'react';
import { generateFeatureEngineeringCode } from '@/lib/features/codeGenerator';
import { useNotebookStore } from '@/stores/notebookStore';
import type { FeatureSpec } from '@/types/feature';
import type { UploadedFile } from '@/types/file';

const FEATURE_PREVIEW_CELL_TITLE = 'Feature Pipeline Preview';

/**
 * Generates a Python code preview for the active feature pipeline and
 * syncs it to an existing dedicated notebook preview cell when present.
 * It must not create notebook cells implicitly, or the FE notebook starts
 * looking "implemented" before the lifecycle has actually run.
 */
export function useFeatureCodeGen(
  activeFeatures: FeatureSpec[],
  selectedDatasetFile: UploadedFile | undefined,
  notebookId: string | null | undefined
): void {
  const activeNotebookId = useNotebookStore((state) => state.activeNotebookId);
  const notebookCells = useNotebookStore((state) => state.cells);
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
    if (!notebookId) return;
    if (!codePreview.trim()) return;
    if (lastSyncedCodePreviewRef.current === codePreview) return;

    if (activeNotebookId !== notebookId) {
      return;
    }

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

      // Do not create preview cells implicitly. FE notebook execution should
      // come from the lifecycle itself, not from toggling suggestion cards.
    };

    void syncCodePreview();
  }, [
    activeNotebookId,
    codePreview,
    notebookCells,
    notebookId,
    updateNotebookCell
  ]);
}
