import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useParams } from 'react-router-dom';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Markdown } from '@/components/ui/Markdown';
import { ReportToolbar } from './ReportToolbar';
import { ReportSkeleton } from './ReportSkeleton';
import { buildMarkdownComponents } from '@/components/upload/planViewerUtils';
import { extractTocHeadings, slugifyHeading } from '@/lib/markdown/tocUtils';
import { scrollToRadixElement } from '@/lib/scrollUtils';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { useModelStore } from '@/stores/modelStore';
import type { ExperimentView } from '@/types/experiments';

export interface ReportPaneHandle {
  scrollToSection: (slug: string) => void;
}

interface ReportPaneProps {
  experimentView: ExperimentView;
  onViewChange: (view: ExperimentView) => void;
}

const REPORT_PREFIX = 'report-';

export const ReportPane = forwardRef<ReportPaneHandle, ReportPaneProps>(
  function ReportPane({ experimentView, onViewChange }, ref) {
    const { projectId } = useParams<{ projectId: string }>();
    const models = useModelStore((s) => s.models);
    const reportContent = useExperimentsStore((s) => s.reportContent);
    const fetchReport = useExperimentsStore((s) => s.fetchReport);
    const invalidateReport = useExperimentsStore((s) => s.invalidateReport);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchExpanded, setSearchExpanded] = useState(false);
    const scrollAreaRef = useRef<HTMLDivElement>(null);

    const text = reportContent?.text ?? '';
    const isLoading = reportContent?.isLoading ?? false;
    const isStreaming = isLoading && text.length > 0;

    // Extract TOC headings with 'report-' prefix slugs
    const headings = useMemo(() => {
      const raw = extractTocHeadings(text);
      return raw.map((h) => ({
        ...h,
        slug: slugifyHeading(h.text, REPORT_PREFIX),
      }));
    }, [text]);

    const markdownComponents = useMemo(
      () => buildMarkdownComponents(searchQuery, REPORT_PREFIX),
      [searchQuery]
    );

    const scrollToHeading = useCallback((slug: string) => {
      scrollToRadixElement(scrollAreaRef.current, slug);
    }, []);

    useImperativeHandle(ref, () => ({
      scrollToSection: scrollToHeading,
    }), [scrollToHeading]);

    // Auto-fetch report when models exist and hash is stale.
    // Intentionally excludes reportContent from deps — fetchReport's
    // internal hash guard prevents duplicate calls, and including the
    // streaming text here would re-run the hash computation on every token.
    useEffect(() => {
      if (!projectId || models.length === 0) return;
      void fetchReport(projectId, models);
    }, [projectId, models, fetchReport]);

    const handleRegenerate = useCallback(() => {
      if (!projectId || models.length === 0) return;
      invalidateReport();
      void fetchReport(projectId, models);
    }, [fetchReport, invalidateReport, models, projectId]);

    return (
      <div className="flex h-full flex-col">
        <ReportToolbar
          content={text}
          searchQuery={searchQuery}
          searchExpanded={searchExpanded}
          onSearchQueryChange={setSearchQuery}
          onSearchExpandedChange={setSearchExpanded}
          headings={headings}
          scrollToHeading={scrollToHeading}
          isStreaming={isStreaming}
          onRegenerate={handleRegenerate}
          experimentView={experimentView}
          onViewChange={onViewChange}
        />
        <ScrollArea ref={scrollAreaRef} className="flex-1">
          {isLoading && !text ? (
            <ReportSkeleton />
          ) : text ? (
            <div className="p-6 prose prose-sm dark:prose-invert max-w-none [&>:first-child>:first-child]:mt-0">
              <Markdown components={markdownComponents}>{text}</Markdown>
              {isStreaming && (
                <span className="inline-block ml-1 h-3 w-1.5 animate-pulse bg-foreground/50 rounded-sm" />
              )}
            </div>
          ) : models.length > 0 ? (
            <ReportSkeleton />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
              Train some models to see your experiment report.
            </div>
          )}
        </ScrollArea>
      </div>
    );
  }
);
