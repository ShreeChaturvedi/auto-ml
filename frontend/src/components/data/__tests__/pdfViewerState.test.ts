import { describe, expect, it } from 'vitest';

import {
  clampPdfPage,
  createInitialVisiblePdfPages,
  getNextPdfZoom,
  getPdfDisplayScale,
  getPreviousPdfZoom,
  type PageDimension,
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

  describe('createInitialVisiblePdfPages', () => {
    it('returns pages 1-3 for documents with 3+ pages', () => {
      expect(createInitialVisiblePdfPages(10)).toEqual(new Set([1, 2, 3]));
    });

    it('caps at numPages for short documents', () => {
      expect(createInitialVisiblePdfPages(2)).toEqual(new Set([1, 2]));
      expect(createInitialVisiblePdfPages(1)).toEqual(new Set([1]));
    });

    it('returns empty set for zero pages', () => {
      expect(createInitialVisiblePdfPages(0)).toEqual(new Set());
    });
  });

  describe('getPdfDisplayScale', () => {
    const pageDimensions: Map<number, PageDimension> = new Map([
      [1, { width: 612, height: 792 }],
    ]);

    it('returns fixed scale when fitWidth is off', () => {
      expect(
        getPdfDisplayScale({
          fitWidth: false,
          scale: 1.5,
          pageDimensions,
          fitWidthValue: 800,
        }),
      ).toBe(1.5);
    });

    it('computes scale from container width when fitWidth is on', () => {
      const result = getPdfDisplayScale({
        fitWidth: true,
        scale: 1,
        pageDimensions,
        fitWidthValue: 612,
      });
      expect(result).toBeCloseTo(1);

      const wider = getPdfDisplayScale({
        fitWidth: true,
        scale: 1,
        pageDimensions,
        fitWidthValue: 1224,
      });
      expect(wider).toBeCloseTo(2);
    });

    it('falls back to scale 1 when page dimensions are unknown', () => {
      expect(
        getPdfDisplayScale({
          fitWidth: true,
          scale: 1.5,
          pageDimensions: new Map(),
          fitWidthValue: 800,
        }),
      ).toBe(1);
    });
  });
});
