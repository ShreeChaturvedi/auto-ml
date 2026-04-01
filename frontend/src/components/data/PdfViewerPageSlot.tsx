import { memo, useCallback } from 'react';
import { Page } from 'react-pdf';

import { PageDimension, PDF_PAGE_GAP } from './pdfViewerState';

interface PdfViewerPageSlotProps {
  pageNum: number;
  isVisible: boolean;
  fitWidth: boolean;
  fitWidthValue: number;
  scale: number;
  dim: PageDimension | undefined;
  onPageRef: (pageNum: number, element: HTMLDivElement | null) => void;
  onPageLoadSuccess: (page: { pageNumber: number; width: number; height: number }) => void;
}

export const PdfViewerPageSlot = memo(function PdfViewerPageSlot({
  pageNum,
  isVisible,
  fitWidth,
  fitWidthValue,
  scale,
  dim,
  onPageRef,
  onPageLoadSuccess,
}: PdfViewerPageSlotProps) {
  const ref = useCallback(
    (element: HTMLDivElement | null) => onPageRef(pageNum, element),
    [pageNum, onPageRef],
  );

  const placeholderHeight = dim
    ? fitWidth
      ? (fitWidthValue / dim.width) * dim.height
      : dim.height * scale
    : fitWidth
      ? fitWidthValue * 1.414
      : 792 * scale;

  const placeholderWidth = fitWidth
    ? fitWidthValue
    : dim
      ? dim.width * scale
      : 612 * scale;

  return (
    <div
      ref={ref}
      data-page-number={pageNum}
      style={{ marginBottom: PDF_PAGE_GAP }}
    >
      {isVisible ? (
        <Page
          pageNumber={pageNum}
          width={fitWidth ? fitWidthValue : undefined}
          scale={fitWidth ? undefined : scale}
          onLoadSuccess={onPageLoadSuccess}
          className="pdf-viewer-page"
        />
      ) : (
        <div
          className="rounded-sm bg-muted/30"
          style={{ width: placeholderWidth, height: placeholderHeight }}
        />
      )}
    </div>
  );
});
