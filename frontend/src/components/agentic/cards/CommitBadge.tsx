/**
 * CommitBadge — emitted for `commit_*` / `register_*` tool results.
 *
 * `GitCommit` header icon tinted with `metric-positive`, left-aligned
 * "Committed" title + muted step subtitle, and a `success → committed`
 * status pill. Details expand into the shell body when present.
 */

import { GitCommit } from 'lucide-react';
import { ToolCardShell } from '@/components/llm/shared/ToolCardShell';

export interface CommitBadgeProps {
  title: string;
  details?: string;
}

export function CommitBadge({ title, details }: CommitBadgeProps) {
  const hasDetails = !!details;

  return (
    <ToolCardShell
      icon={GitCommit}
      iconClassName="text-metric-positive"
      title="Committed"
      subtitle={title}
      status="success"
      statusLabel="committed"
      expandable={hasDetails}
    >
      {hasDetails && (
        <div className="px-3 py-2">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {details}
          </p>
        </div>
      )}
    </ToolCardShell>
  );
}
