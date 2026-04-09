export const PDF_ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export const DEFAULT_PDF_SCALE = 1;
export const PDF_PAGE_GAP = 8;

/** US Letter dimensions in PDF points (1/72 inch) */
export const PDF_DEFAULT_PAGE_WIDTH = 612;
export const PDF_DEFAULT_PAGE_HEIGHT = 792;

/** ISO A4 aspect ratio (~1.414:1), used for placeholder sizing before dimensions load */
export const PDF_A4_ASPECT_RATIO = 1.414;

export interface PageDimension {
  width: number;
  height: number;
}

export interface PdfPageInputCommit {
  pageInput: string;
  currentPage: number;
  numPages: number;
}

export interface PdfPageInputCommitResult {
  nextPage: number | null;
  nextInput: string;
}

export function clampPdfPage(page: number, max: number) {
  return Math.max(1, Math.min(page, max));
}

export function getNextPdfZoom(current: number): number {
  for (const zoom of PDF_ZOOM_PRESETS) {
    if (zoom > current + 0.01) {
      return zoom;
    }
  }

  return PDF_ZOOM_PRESETS[PDF_ZOOM_PRESETS.length - 1];
}

export function getPreviousPdfZoom(current: number): number {
  for (let index = PDF_ZOOM_PRESETS.length - 1; index >= 0; index -= 1) {
    if (PDF_ZOOM_PRESETS[index] < current - 0.01) {
      return PDF_ZOOM_PRESETS[index];
    }
  }

  return PDF_ZOOM_PRESETS[0];
}

export function resolvePdfPageInputCommit({
  pageInput,
  currentPage,
  numPages,
}: PdfPageInputCommit): PdfPageInputCommitResult {
  const parsed = Number.parseInt(pageInput, 10);
  if (Number.isNaN(parsed)) {
    return {
      nextInput: String(currentPage),
      nextPage: null,
    };
  }

  const nextPage = clampPdfPage(parsed, numPages);
  return {
    nextInput: String(nextPage),
    nextPage,
  };
}

export function createInitialVisiblePdfPages(numPages: number) {
  return new Set([1, 2, 3].filter((page) => page <= numPages));
}

export function getPdfDisplayScale({
  fitWidth,
  scale,
  pageDimensions,
  fitWidthValue,
}: {
  fitWidth: boolean;
  scale: number;
  pageDimensions: Map<number, PageDimension>;
  fitWidthValue: number;
}) {
  if (!fitWidth) {
    return scale;
  }

  const firstPageDimension = pageDimensions.get(1);
  if (!firstPageDimension) {
    return 1;
  }

  return fitWidthValue / firstPageDimension.width;
}
