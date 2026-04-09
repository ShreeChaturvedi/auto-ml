import { useCallback, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';

import { getDatasetRows } from '@/lib/api/datasets';
import { getPageSizePref, subscribePageSizePref } from '@/lib/dataPrefs';
import { useDataStore } from '@/stores/dataStore';
import { MAX_PREVIEW_ROWS } from '@/stores/data/fileSlice';
import type { DataPreview, UploadedFile } from '@/types/file';
import type { DataTableIncrementalLoad } from '../DataTable';

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
  const pageSize = useSyncExternalStore(subscribePageSizePref, getPageSizePref);

  const rowCap = preview ? Math.min(preview.totalRows, MAX_PREVIEW_ROWS) : 0;
  const canPaginate = Boolean(
    file
    && preview
    && file.metadata?.datasetId
    && preview.rows.length < rowCap
  );

  const loadMore = useCallback(async () => {
    if (!file?.metadata?.datasetId || !preview || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const page = await getDatasetRows(file.metadata.datasetId, {
        offset: preview.rows.length,
        limit: pageSize
      });
      appendPreviewPage(file.id, page);
    } catch (error) {
      toast.error('Failed to load more rows', {
        description: extractApiErrorMessage(error)
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [appendPreviewPage, extractApiErrorMessage, file, isLoadingMore, pageSize, preview]);

  if (!canPaginate || !preview) {
    return undefined;
  }

  return {
    hasMore: preview.rows.length < rowCap,
    isLoading: isLoadingMore,
    onReachEnd: loadMore
  };
}
