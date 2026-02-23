import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  /** Optional action button on the right (e.g., + button for Projects) */
  action?: React.ReactNode;
}

export function CollapsibleSection({
  title,
  defaultExpanded = true,
  children,
  action
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 px-2 py-1">
        {/* Main clickable area - chevron + title */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="group flex-1 flex items-center gap-1 rounded transition-colors"
        >
          {/* Chevron on the left, aligned with sub-item icons */}
          <div className="h-6 w-6 flex items-center justify-center shrink-0">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            )}
          </div>

          {/* Title */}
          <h2 className="text-workflow-label font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
            {title}
          </h2>
        </button>

        {/* Optional action on the right */}
        {action && (
          <div className="shrink-0">
            {action}
          </div>
        )}
      </div>

      {expanded && children}
    </div>
  );
}
