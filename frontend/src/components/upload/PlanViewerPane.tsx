import { useCallback, useMemo, useRef, useState } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Markdown } from '@/components/ui/Markdown';

import { PlanViewerToolbar } from './PlanViewerToolbar';
import { buildMarkdownComponents, extractTocHeadings } from './planViewerUtils';

interface PlanViewerPaneProps {
  plan: { id: string; name: string; content: string };
}

export function PlanViewerPane({ plan }: PlanViewerPaneProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const headings = useMemo(() => extractTocHeadings(plan.content), [plan.content]);
  const markdownComponents = useMemo(() => buildMarkdownComponents(searchQuery), [searchQuery]);

  const scrollToHeading = useCallback((slug: string) => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      '[data-radix-scroll-area-viewport]'
    );
    const target = scrollAreaRef.current?.querySelector<HTMLElement>(`#${CSS.escape(slug)}`);
    if (viewport && target) {
      viewport.scrollTo({ top: target.offsetTop - 16, behavior: 'smooth' });
    }
  }, []);

  return (
    <div className="flex h-full flex-col">
      <PlanViewerToolbar
        planContent={plan.content}
        planName={plan.name}
        searchQuery={searchQuery}
        searchExpanded={searchExpanded}
        onSearchQueryChange={setSearchQuery}
        onSearchExpandedChange={setSearchExpanded}
        headings={headings}
        scrollToHeading={scrollToHeading}
      />
      <ScrollArea ref={scrollAreaRef} className="flex-1">
        <div className="p-6 prose prose-sm dark:prose-invert max-w-none">
          <Markdown components={markdownComponents}>
            {plan.content}
          </Markdown>
        </div>
      </ScrollArea>
    </div>
  );
}
