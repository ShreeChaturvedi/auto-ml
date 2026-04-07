import { forwardRef, useMemo } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Markdown } from '@/components/ui/Markdown';

import { buildMarkdownComponents } from './planViewerUtils';

interface PlanViewerPaneProps {
  plan: { id: string; name: string; content: string };
  searchQuery?: string;
}

export const PlanViewerPane = forwardRef<HTMLDivElement, PlanViewerPaneProps>(
  function PlanViewerPane({ plan, searchQuery = '' }, ref) {
    const markdownComponents = useMemo(() => buildMarkdownComponents(searchQuery), [searchQuery]);

    return (
      <ScrollArea ref={ref} className="flex-1">
        <div className="p-6 prose prose-sm dark:prose-invert max-w-none">
          <Markdown components={markdownComponents}>
            {plan.content}
          </Markdown>
        </div>
      </ScrollArea>
    );
  }
);
