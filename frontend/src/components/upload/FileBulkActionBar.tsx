import { useState } from 'react';
import { X, Download, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface FileBulkActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onBulkDownload: () => void;
  isDeleting?: boolean;
  isDownloading?: boolean;
}

export function FileBulkActionBar({
  selectedCount,
  onClearSelection,
  onBulkDelete,
  onBulkDownload,
  isDeleting,
  isDownloading,
}: FileBulkActionBarProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEscapeKey(selectedCount > 0, onClearSelection);

  return (
    <div className="flex items-center gap-2.5 w-full">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={onClearSelection}
      >
        <X className="h-3.5 w-3.5" />
        <span className="sr-only">Clear selection</span>
      </Button>

      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-muted/60 rounded-full px-2.5 py-0.5">
        <span className="tabular-nums">{selectedCount}</span> selected
      </span>

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={isDownloading}
          onClick={onBulkDownload}
        >
          {isDownloading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Download className="h-3.5 w-3.5" />}
          Download
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
          disabled={isDeleting}
          onClick={() => setDeleteDialogOpen(true)}
        >
          {isDeleting
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Trash2 className="h-3.5 w-3.5" />}
          Delete
        </Button>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedCount} file{selectedCount !== 1 ? 's' : ''}?</DialogTitle>
            <DialogDescription>
              This will permanently remove the selected file{selectedCount !== 1 ? 's' : ''} and their data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={() => {
                onBulkDelete();
                setDeleteDialogOpen(false);
              }}
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
