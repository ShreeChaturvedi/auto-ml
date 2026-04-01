/**
 * PdfViewer — React-based PDF viewer with custom toolbar, continuous scroll,
 * and IntersectionObserver-based virtualization.
 *
 * Uses react-pdf v10 (pdfjs-dist v5, patched for CVE-2024-34342 / CVE-2024-4367).
 * Default-exported for React.lazy code-splitting.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Document, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import { PdfViewerPageSlot } from './PdfViewerPageSlot';
import { PdfViewerToolbar } from './PdfViewerToolbar';
import {
  clampPdfPage,
  createInitialVisiblePdfPages,
  DEFAULT_PDF_SCALE,
  getNextPdfZoom,
  getPdfDisplayScale,
  getPreviousPdfZoom,
  type PageDimension,
} from './pdfViewerState';

// ---------- pdfjs worker (CDN, version-matched) ----------
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  /** Blob URL or remote URL pointing to the PDF */
  url: string;
  /** File name used for the download action */
  fileName?: string;
  className?: string;
}
// ---------- main component ----------
export default function PdfViewer({ url, fileName, className }: PdfViewerProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(DEFAULT_PDF_SCALE);
  const [fitWidth, setFitWidth] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(() => new Set([1]));
  const [pageDimensions, setPageDimensions] = useState<Map<number, PageDimension>>(
    () => new Map(),
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const topVisibleRef = useRef(1);

  const documentOptions = useMemo(
    () => ({
      cMapUrl: `//unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
      cMapPacked: true,
    }),
    [],
  );

  // ---------- ResizeObserver (rAF-throttled) ----------
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver((entries) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const entry = entries[0];
        if (entry) setContainerWidth(entry.contentRect.width);
      });
    });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  // ---------- IntersectionObserver for page virtualization ----------
  useEffect(() => {
    if (!scrollRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        let nextTop = topVisibleRef.current;

        // Determine topmost intersecting page
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const n = Number((entry.target as HTMLElement).dataset.pageNumber);
          if (!Number.isNaN(n) && n < nextTop) nextTop = n;
        }
        const intersecting = entries
          .filter((e) => e.isIntersecting)
          .map((e) => Number((e.target as HTMLElement).dataset.pageNumber))
          .filter((n) => !Number.isNaN(n));
        if (intersecting.length > 0) {
          nextTop = Math.min(...intersecting);
        }

        // Update current page outside the state updater
        if (nextTop !== topVisibleRef.current) {
          topVisibleRef.current = nextTop;
          setCurrentPage(nextTop);
        }

        setVisiblePages((prev) => {
          const next = new Set(prev);
          let changed = false;

          for (const entry of entries) {
            const pageNum = Number(
              (entry.target as HTMLElement).dataset.pageNumber,
            );
            if (Number.isNaN(pageNum)) continue;

            if (entry.isIntersecting) {
              if (!next.has(pageNum)) { next.add(pageNum); changed = true; }
              if (pageNum > 1 && !next.has(pageNum - 1)) { next.add(pageNum - 1); changed = true; }
              if (pageNum < numPages && !next.has(pageNum + 1)) { next.add(pageNum + 1); changed = true; }
            } else {
              // O(1) adjacency check instead of spreading the Set
              const nearVisible =
                next.has(pageNum - 1) || next.has(pageNum + 1);
              if (!nearVisible && next.has(pageNum)) {
                next.delete(pageNum);
                changed = true;
              }
            }
          }

          return changed ? next : prev;
        });
      },
      {
        root: scrollRef.current,
        rootMargin: '200px 0px',
        threshold: 0.1,
      },
    );

    // Re-observe any already-mounted page elements
    pageRefs.current.forEach((el) => observerRef.current?.observe(el));

    return () => observerRef.current?.disconnect();
  }, [numPages]);

  // Observe/unobserve page elements on mount/unmount
  const handlePageRef = useCallback(
    (pageNum: number, el: HTMLDivElement | null) => {
      const prev = pageRefs.current.get(pageNum);
      if (prev && observerRef.current) {
        observerRef.current.unobserve(prev);
      }
      if (el) {
        pageRefs.current.set(pageNum, el);
        observerRef.current?.observe(el);
      } else {
        pageRefs.current.delete(pageNum);
      }
    },
    [],
  );

  // ---------- handlers ----------
  const handleDocumentLoadSuccess = useCallback(
    ({ numPages: n }: { numPages: number }) => {
      setNumPages(n);
      setVisiblePages(createInitialVisiblePdfPages(n));
    },
    [],
  );

  const handlePageLoadSuccess = useCallback(
    (page: { pageNumber: number; width: number; height: number }) => {
      setPageDimensions((prev) => {
        if (prev.has(page.pageNumber)) return prev;
        const next = new Map(prev);
        next.set(page.pageNumber, { width: page.width, height: page.height });
        return next;
      });
    },
    [],
  );

  const scrollToPage = useCallback((page: number) => {
    const el = pageRefs.current.get(page);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const handlePageChange = useCallback(
    (page: number) => {
      const clamped = clampPdfPage(page, numPages);
      setCurrentPage(clamped);
      scrollToPage(clamped);
    },
    [numPages, scrollToPage],
  );

  const handleZoomIn = useCallback(() => {
    setFitWidth(false);
    setScale((currentScale) => getNextPdfZoom(currentScale));
  }, []);

  const handleZoomOut = useCallback(() => {
    setFitWidth(false);
    setScale((currentScale) => getPreviousPdfZoom(currentScale));
  }, []);

  const handleToggleFitWidth = useCallback(() => {
    setFitWidth((f) => !f);
  }, []);

  const fitWidthValue = Math.max(containerWidth - 48, 200);

  const displayScale = useMemo(() => {
    return getPdfDisplayScale({
      fitWidth,
      scale,
      pageDimensions,
      fitWidthValue,
    });
  }, [fitWidth, scale, pageDimensions, fitWidthValue]);

  return (
    <div className={cn('flex flex-col', className)}>
      {numPages > 0 && (
        <PdfViewerToolbar
          currentPage={currentPage}
          numPages={numPages}
          scale={displayScale}
          fitWidth={fitWidth}
          url={url}
          fileName={fileName}
          onPageChange={handlePageChange}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onToggleFitWidth={handleToggleFitWidth}
        />
      )}

      <div
        ref={scrollRef}
        className={cn(
          'flex-1 overflow-auto',
          isDark ? 'bg-[hsl(0,0%,7%)]' : 'bg-[hsl(210,20%,96%)]',
        )}
      >
        <Document
          file={url}
          onLoadSuccess={handleDocumentLoadSuccess}
          options={documentOptions}
          loading={
            <div className="flex h-full items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading PDF...
            </div>
          }
          error={
            <div className="flex h-full items-center justify-center py-12 text-sm text-destructive">
              Failed to load PDF.
            </div>
          }
        >
          <div className="flex flex-col items-center py-4">
            {Array.from({ length: numPages }, (_, i) => {
              const pageNum = i + 1;
              return (
                <PdfViewerPageSlot
                  key={pageNum}
                  pageNum={pageNum}
                  isVisible={visiblePages.has(pageNum)}
                  fitWidth={fitWidth}
                  fitWidthValue={fitWidthValue}
                  scale={scale}
                  dim={pageDimensions.get(pageNum)}
                  onPageRef={handlePageRef}
                  onPageLoadSuccess={handlePageLoadSuccess}
                />
              );
            })}
          </div>
        </Document>
      </div>
    </div>
  );
}
