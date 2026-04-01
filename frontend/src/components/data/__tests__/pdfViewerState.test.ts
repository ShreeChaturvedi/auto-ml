import { describe, expect, it } from 'vitest';

import {
  clampPdfPage,
  getNextPdfZoom,
  getPreviousPdfZoom,
  resolvePdfPageInputCommit,
} from '../pdfViewerState';

describe('pdfViewerState', () => {
  it('clamps committed page input to the available page range', () => {
    expect(
      resolvePdfPageInputCommit({
        pageInput: '12',
        currentPage: 2,
        numPages: 5,
      }),
    ).toEqual({
      nextInput: '5',
      nextPage: 5,
    });
  });

  it('restores the current page when the committed page input is invalid', () => {
    expect(
      resolvePdfPageInputCommit({
        pageInput: 'abc',
        currentPage: 3,
        numPages: 8,
      }),
    ).toEqual({
      nextInput: '3',
      nextPage: null,
    });
  });

  it('walks the configured zoom presets in both directions', () => {
    expect(getNextPdfZoom(1)).toBe(1.25);
    expect(getNextPdfZoom(2)).toBe(2);
    expect(getPreviousPdfZoom(1)).toBe(0.75);
    expect(getPreviousPdfZoom(0.5)).toBe(0.5);
  });

  it('clamps page numbers to the valid document range', () => {
    expect(clampPdfPage(-1, 7)).toBe(1);
    expect(clampPdfPage(4, 7)).toBe(4);
    expect(clampPdfPage(99, 7)).toBe(7);
  });
});
