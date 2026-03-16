import { useState } from 'react';
import { RotateCcw, MessageSquare, FileCode2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import type { SavepointDiff } from '@/types/savepoint';

interface RevertPopoverProps {
  diff: SavepointDiff | null;
  messagesAfter: number;
  onRevertConversation: () => void;
  onRevertWithNotebook: () => Promise<void>;
  children: React.ReactNode;
}

export function RevertPopover({
  diff,
  messagesAfter,
  onRevertConversation,
  onRevertWithNotebook,
  children
}: RevertPopoverProps) {
  const [isRestoring, setIsRestoring] = useState(false);
  const [open, setOpen] = useState(false);

  const handleRevertWithNotebook = async () => {
    setIsRestoring(true);
    try {
      await onRevertWithNotebook();
      setOpen(false);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRevertConversation = () => {
    onRevertConversation();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-3" side="top" align="end">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Revert to this point</span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {messagesAfter} message{messagesAfter !== 1 ? 's' : ''}
            </span>
            {diff && (diff.linesAdded + diff.linesRemoved > 0) && (
              <span className="inline-flex items-center gap-1">
                <FileCode2 className="h-3 w-3" />
                <span className="font-mono text-emerald-600">+{diff.linesAdded}</span>
                <span className="font-mono text-red-500">-{diff.linesRemoved}</span>
              </span>
            )}
          </div>

          {/* Cell details */}
          {diff && (diff.cellsModified + diff.cellsAdded + diff.cellsDeleted > 0) && (
            <p className="text-xs text-muted-foreground">
              {[
                diff.cellsModified > 0 && `${diff.cellsModified} cell${diff.cellsModified !== 1 ? 's' : ''} modified`,
                diff.cellsAdded > 0 && `${diff.cellsAdded} added`,
                diff.cellsDeleted > 0 && `${diff.cellsDeleted} deleted`
              ].filter(Boolean).join(', ')}
            </p>
          )}

          {/* Manual edit warning */}
          {diff?.hasManualEdits && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
              <span>Includes manual edits you made</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={handleRevertConversation}
              disabled={isRestoring}
            >
              Revert conversation
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 text-xs"
              onClick={handleRevertWithNotebook}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : null}
              Revert + Notebook
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
