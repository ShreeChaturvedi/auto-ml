import { hasDatabaseConfiguration } from '../../../db.js';
import { getCell as getNotebookCell, updateCell as updateNotebookCell } from '../../../repositories/notebookRepository.js';
import { asRecord } from '../../../utils/typeCoercion.js';
import { buildPreprocessingCellMetadata } from '../preprocessingTools/helpers.js';
import type {
  PreprocessingCellInspector,
  PreprocessingCellMetadataStore
} from '../preprocessingTools/types.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/* ------------------------------------------------------------------ */
/*  Cell metadata store                                                */
/* ------------------------------------------------------------------ */

export function createPreprocessingCellMetadataStore(): PreprocessingCellMetadataStore {
  return {
    async apply(cellIds, binding) {
      if (!hasDatabaseConfiguration() || cellIds.length === 0) {
        return;
      }

      const uniqueCellIds = [...new Set(cellIds)].filter(isUuidLike);
      for (const cellId of uniqueCellIds) {
        const existing = await getNotebookCell(cellId);
        if (!existing) {
          continue;
        }

        await updateNotebookCell(cellId, {
          metadata: buildPreprocessingCellMetadata(asRecord(existing.metadata), binding)
        });
      }
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Cell inspector                                                     */
/* ------------------------------------------------------------------ */

export function createPreprocessingCellInspector(): PreprocessingCellInspector {
  return {
    async read(cellId) {
      if (!hasDatabaseConfiguration() || !isUuidLike(cellId)) {
        return undefined;
      }
      const cell = await getNotebookCell(cellId);
      if (!cell) {
        return undefined;
      }
      return {
        cellId: cell.cellId,
        content: cell.content,
        metadata: asRecord(cell.metadata) ?? {}
      };
    }
  };
}
