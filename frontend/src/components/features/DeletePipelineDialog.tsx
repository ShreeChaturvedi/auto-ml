import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DeletePipelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftName: string;
  isLastVersion: boolean;
  onConfirm: () => void;
}

export function DeletePipelineDialog({
  open,
  onOpenChange,
  draftName,
  isLastVersion,
  onConfirm,
}: DeletePipelineDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete draft pipeline?</DialogTitle>
          <DialogDescription>
            {isLastVersion
              ? `Delete draft "${draftName}"? A fresh blank draft will be created.`
              : `Delete draft "${draftName}"? This action cannot be undone.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
