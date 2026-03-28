import { cn } from '@/lib/utils';
import { Markdown } from '@/components/ui/Markdown';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { toPlanPath } from './planningUtils';

export interface PlanMessageCardProps {
  msgId: string;
  content: string;
  planName: string;
  approved: boolean;
  onApprove: (content: string, planName: string, msgId: string) => void;
}

export function PlanMessageCard({
  msgId,
  content,
  planName,
  approved,
  onApprove,
}: PlanMessageCardProps) {
  const planPath = toPlanPath(planName);

  return (
    <div className="space-y-3 animate-in fade-in zoom-in-95 duration-300">
      <div className="overflow-hidden rounded-lg border border-primary/30 bg-primary/5 hover:border-primary/50 transition-colors transition-shadow">
        <div className="flex items-center justify-between border-b px-3 py-1.5 border-primary/20 bg-muted/40">
          <div className="font-mono text-[11px] text-muted-foreground" title={planPath}>
            <span className="block truncate">{planPath}</span>
          </div>
        </div>
        <div className="p-4">
          <Markdown className="prose prose-sm max-w-none dark:prose-invert">
            {content}
          </Markdown>
        </div>
      </div>
      {!approved ? (
        <div className="flex items-center mt-2">
          <Button
            size="sm"
            variant="outline"
            className={cn('gap-1.5 bg-accent-bg border-accent-border hover:bg-accent-bg-hover text-accent-text')}
            onClick={() => onApprove(content, planName, msgId)}
          >
            <Check className="h-3.5 w-3.5" />
            Approve Plan
          </Button>
        </div>
      ) : (
        <div className={cn(
          'flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium',
          'bg-accent-bg border-accent-border text-accent-text',
        )}>
          <Check className="h-4 w-4" />
          Plan approved
        </div>
      )}
    </div>
  );
}
