import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { getDatasetRows } from '@/lib/api/datasets';
import { useDataStore } from '@/stores/dataStore';
import { MAX_PREVIEW_ROWS } from '@/stores/data/fileSlice';
import type { DataPreview, UploadedFile } from '@/types/file';
import type { DataTableIncrementalLoad } from '../DataTable';

const DATASET_PREVIEW_PAGE_SIZE = 200;

interface UseDatasetPreviewPaginationParams {
  file?: UploadedFile;
  preview?: DataPreview;
  extractApiErrorMessage: (error: unknown) => string;
}

export function useDatasetPreviewPagination({
  file,
  preview,
  extractApiErrorMessage
}: UseDatasetPreviewPaginationParams): DataTableIncrementalLoad | undefined {
  const appendPreviewPage = useDataStore((state) => state.appendPreviewPage);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const canPaginate = Boolean(
    file
    && preview
    && file.metadata?.datasetId
    && preview.rows.length < Math.min(preview.totalRows, MAX_PREVIEW_ROWS)
  );

  const loadMore = useCallback(async () => {
    if (!file?.metadata?.datasetId || !preview || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const page = await getDatasetRows(file.metadata.datasetId, {
        offset: preview.rows.length,
        limit: DATASET_PREVIEW_PAGE_SIZE
      });
      appendPreviewPage(file.id, page);
    } catch (error) {
      toast.error('Failed to load more rows', {
        description: extractApiErrorMessage(error)
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [appendPreviewPage, extractApiErrorMessage, file, isLoadingMore, preview]);

  if (!canPaginate || !preview) {
    return undefined;
  }

  return {
    hasMore: preview.rows.length < Math.min(preview.totalRows, MAX_PREVIEW_ROWS),
    isLoading: isLoadingMore,
    onReachEnd: loadMore
  };
}
