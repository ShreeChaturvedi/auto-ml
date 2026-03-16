/**
 * PdfViewer — React-based PDF viewer with custom toolbar, continuous scroll,
 * and IntersectionObserver-based virtualization.
 *
 * Uses react-pdf v10 (pdfjs-dist v5, patched for CVE-2024-34342 / CVE-2024-4367).
 * Default-exported for React.lazy code-splitting.
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import {
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Loader2,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';

// ---------- pdfjs worker (CDN, version-matched) ----------
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ---------- constants ----------
const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const DEFAULT_SCALE = 1;
const PAGE_GAP = 8;

// ---------- types ----------
interface PdfViewerProps {
  /** Blob URL or remote URL pointing to the PDF */
  url: string;
  /** File name used for the download action */
  fileName?: string;
  className?: string;
}

interface PageDimension {
  width: number;
  height: number;
}

// ---------- helpers ----------
function clampPage(page: number, max: number) {
  return Math.max(1, Math.min(page, max));
}

function nextZoom(current: number): number {
  for (const z of ZOOM_PRESETS) {
    if (z > current + 0.01) return z;
  }
  return ZOOM_PRESETS[ZOOM_PRESETS.length - 1];
}

function prevZoom(current: number): number {
  for (let i = ZOOM_PRESETS.length - 1; i >= 0; i--) {
    if (ZOOM_PRESETS[i] < current - 0.01) return ZOOM_PRESETS[i];
  }
  return ZOOM_PRESETS[0];
}

// ---------- toolbar ----------
function Toolbar({
  currentPage,
  numPages,
  scale,
  fitWidth,
  url,
  fileName,
  onPageChange,
  onZoomIn,
  onZoomOut,
  onToggleFitWidth,
}: {
  currentPage: number;
  numPages: number;
  scale: number;
  fitWidth: boolean;
  url: string;
  fileName?: string;
  onPageChange: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleFitWidth: () => void;
}) {
  const [pageInput, setPageInput] = useState(String(currentPage));

  // Sync input when currentPage changes from scroll
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const commitPage = () => {
    const parsed = parseInt(pageInput, 10);
    if (!Number.isNaN(parsed)) {
      onPageChange(clampPage(parsed, numPages));
    } else {
      setPageInput(String(currentPage));
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-3">
        {/* Left: page navigation */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={currentPage <= 1}
                onClick={() => onPageChange(currentPage - 1)}
                aria-label="Previous page"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Previous page</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={currentPage >= numPages}
                onClick={() => onPageChange(currentPage + 1)}
                aria-label="Next page"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Next page</TooltipContent>
          </Tooltip>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Input
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={commitPage}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitPage();
              }}
              className="h-7 w-12 border-input px-1 text-center text-xs"
              aria-label="Current page"
            />
            <span>of {numPages}</span>
          </div>
        </div>

        {/* Center: zoom controls */}
        <div className="flex items-center gap-1">
          <Separator orientation="vertical" className="mx-1.5 h-5" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onZoomOut}
                disabled={scale <= ZOOM_PRESETS[0]}
                aria-label="Zoom out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Zoom out</TooltipContent>
          </Tooltip>

          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onZoomIn}
                disabled={scale >= ZOOM_PRESETS[ZOOM_PRESETS.length - 1]}
                aria-label="Zoom in"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Zoom in</TooltipContent>
          </Tooltip>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1">
          <Separator orientation="vertical" className="mx-1.5 h-5" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={fitWidth ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={onToggleFitWidth}
                aria-label="Fit to width"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Fit to width</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = fileName ?? 'document.pdf';
                  link.rel = 'noopener';
                  link.click();
                }}
                aria-label="Download"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Download</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                aria-label="Open in new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Open in new tab</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ---------- single page wrapper (memo'd to stabilize ref callback) ----------
const PageSlot = memo(function PageSlot({
  pageNum,
  isVisible,
  fitWidth,
  fitWidthValue,
  scale,
  dim,
  onPageRef,
  onPageLoadSuccess,
}: {
  pageNum: number;
  isVisible: boolean;
  fitWidth: boolean;
  fitWidthValue: number;
  scale: number;
  dim: PageDimension | undefined;
  onPageRef: (pageNum: number, el: HTMLDivElement | null) => void;
  onPageLoadSuccess: (page: { pageNumber: number; width: number; height: number }) => void;
}) {
  const ref = useCallback(
    (el: HTMLDivElement | null) => onPageRef(pageNum, el),
    [pageNum, onPageRef],
  );

  const placeholderH = dim
    ? fitWidth
      ? (fitWidthValue / dim.width) * dim.height
      : dim.height * scale
    : fitWidth
      ? fitWidthValue * 1.414
      : 792 * scale;

  const placeholderW = fitWidth
    ? fitWidthValue
    : dim
      ? dim.width * scale
      : 612 * scale;

  return (
    <div
      ref={ref}
      data-page-number={pageNum}
      style={{ marginBottom: PAGE_GAP }}
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
          style={{ width: placeholderW, height: placeholderH }}
        />
      )}
    </div>
  );
});

// ---------- main component ----------
export default function PdfViewer({ url, fileName, className }: PdfViewerProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(DEFAULT_SCALE);
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
      setVisiblePages(new Set([1, 2, 3].filter((p) => p <= n)));
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
      const clamped = clampPage(page, numPages);
      setCurrentPage(clamped);
      scrollToPage(clamped);
    },
    [numPages, scrollToPage],
  );

  const handleZoomIn = useCallback(() => {
    setFitWidth(false);
    setScale((s) => nextZoom(s));
  }, []);

  const handleZoomOut = useCallback(() => {
    setFitWidth(false);
    setScale((s) => prevZoom(s));
  }, []);

  const handleToggleFitWidth = useCallback(() => {
    setFitWidth((f) => !f);
  }, []);

  const fitWidthValue = Math.max(containerWidth - 48, 200);

  const displayScale = useMemo(() => {
    if (!fitWidth) return scale;
    const firstPageDim = pageDimensions.get(1);
    if (!firstPageDim) return 1;
    return fitWidthValue / firstPageDim.width;
  }, [fitWidth, scale, pageDimensions, fitWidthValue]);

  return (
    <div className={cn('flex flex-col', className)}>
      {numPages > 0 && (
        <Toolbar
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
                <PageSlot
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
