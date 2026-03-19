/**
 * WorkbookActionsMenu — shared three-dot dropdown with Rename / Replay / Reset actions
 * used by the preprocessing, feature-engineering, and training toolbars.
 */

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { COMPACT_TOOLBAR_ICON_BUTTON_CLASS } from './toolbarStyles';
import { MoreHorizontal, Pencil, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';

interface WorkbookActionsMenuProps {
  onRename: () => void;
  onReplay: () => void;
  onReset: () => void;
  onDelete?: () => void;
  disableAll?: boolean;
  disableRename?: boolean;
  disableReplay?: boolean;
  disableReset?: boolean;
  disableDelete?: boolean;
}

export function WorkbookActionsMenu({
  onRename,
  onReplay,
  onReset,
  onDelete,
  disableAll,
  disableRename,
  disableReplay,
  disableReset,
  disableDelete
}: WorkbookActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
          disabled={disableAll}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={onRename} disabled={disableRename}>
          <Pencil className="h-3.5 w-3.5 mr-2" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onReplay} disabled={disableReplay}>
          <RefreshCw className="h-3.5 w-3.5 mr-2" />
          Replay
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onReset} disabled={disableReset}>
          <RotateCcw className="h-3.5 w-3.5 mr-2" />
          Reset
        </DropdownMenuItem>
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              disabled={disableDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
