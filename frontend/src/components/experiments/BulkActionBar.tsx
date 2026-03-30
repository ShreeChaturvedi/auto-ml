import { useCallback, useEffect, useState } from 'react';
import { X, GitCompareArrows, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { useModelStore } from '@/stores/modelStore';

interface BulkActionBarProps {
  onExportSelected: () => void;
}

export function BulkActionBar({ onExportSelected }: BulkActionBarProps) {
  const comparisonModelIds = useExperimentsStore((s) => s.comparisonModelIds);
  const clearComparison = useExperimentsStore((s) => s.clearComparison);
  const startComparison = useExperimentsStore((s) => s.startComparison);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const count = comparisonModelIds.length;
  const hasSelection = count > 0;
  const canCompare = count >= 2;
  const guidance = count === 1 ? 'select 1 more to compare' : null;

  // Esc key to clear selection
  useEffect(() => {
    if (!hasSelection) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active as HTMLElement)?.isContentEditable
      ) return;
      if (document.querySelector('[data-state="open"][role="dialog"]')) return;
      clearComparison();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [hasSelection, clearComparison]);

  const handleDelete = useCallback(async () => {
    const ids = useExperimentsStore.getState().comparisonModelIds;
    const results = await Promise.allSettled(
      ids.map((id) => useModelStore.getState().deleteModel(id))
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - succeeded;
    if (failed === 0) {
      toast.success(`Deleted ${succeeded} model${succeeded !== 1 ? 's' : ''}`);
    } else {
      toast.error(`Deleted ${succeeded} of ${results.length} models. ${failed} failed.`);
    }
    clearComparison();
    setDeleteDialogOpen(false);
  }, [clearComparison]);

  return (
    <div className="flex items-center gap-2.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={clearComparison}
      >
        <X className="h-3.5 w-3.5" />
        <span className="sr-only">Clear selection</span>
      </Button>

      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-muted/60 rounded-full px-2.5 py-0.5">
        <span className="tabular-nums">{count}</span> selected
      </span>

      {guidance && (
        <span className="text-[11px] text-muted-foreground">{guidance}</span>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          className="h-7 gap-1.5 text-xs bg-accent-fill text-accent-on-fill hover:bg-accent-fill-hover"
          disabled={!canCompare}
          onClick={startComparison}
        >
          <GitCompareArrows className="h-3.5 w-3.5" />
          Compare
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={onExportSelected}
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
          onClick={() => setDeleteDialogOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {count} model{count !== 1 ? 's' : ''}?</DialogTitle>
            <DialogDescription>
              This will permanently remove the selected model{count !== 1 ? 's' : ''} and their artifacts. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
