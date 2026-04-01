import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

export type SidebarDeleteRequest = {
  title: string;
  description: string;
  onConfirm: () => void;
};

/**
 * Shared destructive-confirm dialog for sidebar subtab menus (file / workbook / model).
 */
export function useSidebarDeleteConfirm() {
  const [payload, setPayload] = useState<SidebarDeleteRequest | null>(null);

  const requestDelete = useCallback((next: SidebarDeleteRequest) => {
    setPayload(next);
  }, []);

  const dismiss = useCallback(() => setPayload(null), []);

  const confirmDialog = (
    <Dialog
      open={!!payload}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{payload?.title}</DialogTitle>
          <DialogDescription>{payload?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={dismiss}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              payload?.onConfirm();
              dismiss();
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { requestDelete, confirmDialog };
}
