/**
 * PlanMessageCard - Renders a single plan message with view/edit/approve UI.
 */

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
  editingPlanId: string | null;
  draftValue: string;
  projectColorClass: {
    bg: string;
    border: string;
    hover: string;
    text: string;
  };
  onSetDraft: (msgId: string, value: string) => void;
  onStartEdit: (msgId: string, content: string) => void;
  onCancelEdit: (msgId: string, content: string) => void;
  onSaveEdit: (msgId: string) => void;
  onApprove: (content: string, planName: string, msgId: string) => void;
}

export function PlanMessageCard({
  msgId,
  content,
  planName,
  approved,
  editingPlanId,
  draftValue,
  projectColorClass,
  onSetDraft,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onApprove,
}: PlanMessageCardProps) {
  const planPath = toPlanPath(planName);
  const isEditing = editingPlanId === msgId;

  return (
    <div className="space-y-3 animate-in fade-in zoom-in-95 duration-300">
      <div className={cn(
        "overflow-hidden rounded-lg transition-all",
        isEditing
          ? "border border-primary/50 shadow-sm ring-1 ring-primary/20 bg-background"
          : "border border-primary/30 bg-primary/5 hover:border-primary/50"
      )}>
        <div className={cn(
          "flex items-center justify-between border-b px-3 py-1.5",
          isEditing ? "bg-muted/30 border-primary/20" : "border-primary/20 bg-muted/40"
        )}>
          <div className="font-mono text-[11px] text-muted-foreground" title={planPath}>
            <span className="block truncate">{planPath}</span>
          </div>
          {isEditing && (
            <div className="text-[10px] uppercase tracking-wider text-primary font-medium">
              Editing Mode
            </div>
          )}
        </div>
        {isEditing ? (
          <textarea
            value={draftValue}
            onChange={(event) => {
              onSetDraft(msgId, event.target.value);
            }}
            aria-label={`Edit plan ${planPath}`}
            className="min-h-[350px] w-full resize-y bg-transparent px-4 py-4 font-mono text-sm leading-relaxed outline-none"
            placeholder="Edit the proposed plan here..."
            data-testid={`plan-editor-${msgId}`}
          />
        ) : (
          <button
            type="button"
            onClick={() => onStartEdit(msgId, content)}
            className="w-full text-left p-4 outline-none focus-visible:bg-primary/10 transition-colors"
            data-testid={`plan-view-${msgId}`}
            title="Click to edit this plan manually"
          >
            <Markdown className="prose prose-sm max-w-none dark:prose-invert">
              {content}
            </Markdown>
          </button>
        )}
      </div>
      {!approved ? (
        <div className="flex flex-wrap items-center justify-between gap-4 mt-2">
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button size="sm" variant="outline" onClick={() => onCancelEdit(msgId, content)}>
                  Cancel
                </Button>
                <Button size="sm" variant="default" onClick={() => onSaveEdit(msgId)}>
                  Save Edit
                </Button>
              </>
            ) : null}
            {!isEditing ? (
              <Button
                size="sm"
                variant="outline"
                className={cn('gap-1.5', projectColorClass.bg, projectColorClass.border, projectColorClass.hover, projectColorClass.text)}
                onClick={() => onApprove(content, planName, msgId)}
              >
                <Check className="h-3.5 w-3.5" />
                Approve Plan
              </Button>
            ) : null}
          </div>
          {!isEditing && (
            <span className="text-xs text-muted-foreground italic">
              Click the plan above to edit, or ask for changes below
            </span>
          )}
        </div>
      ) : (
        <div className={cn(
          'flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium',
          projectColorClass.bg,
          projectColorClass.border,
          projectColorClass.text,
        )}>
          <Check className="h-4 w-4" />
          Plan approved
        </div>
      )}
    </div>
  );
}
