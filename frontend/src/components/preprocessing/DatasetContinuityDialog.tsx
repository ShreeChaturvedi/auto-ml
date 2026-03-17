import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

interface DatasetContinuityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTableFilename: string | undefined;
  onUseCurrentDataset: () => void;
  onUseOriginalDataset: () => void;
  onCancel: () => void;
}

export function DatasetContinuityDialog({
  open,
  onOpenChange,
  selectedTableFilename,
  onUseCurrentDataset,
  onUseOriginalDataset,
  onCancel
}: DatasetContinuityDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Choose Dataset Source For This Action</DialogTitle>
          <DialogDescription>
            For this prompt, should preprocessing continue from the current edited working dataset,
            or restart from the original dataset source?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Card className="border-muted">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Current selection</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {selectedTableFilename ?? 'No dataset selected'}
            </CardContent>
          </Card>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={onUseOriginalDataset}>
              Start From Original
            </Button>
            <Button onClick={onUseCurrentDataset}>
              Continue Current Working
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
