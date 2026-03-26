/**
 * TrainingToolbar — workbook selector and actions for the Training phase.
 */

import { Button } from '@/components/ui/button';
import {
  COMPACT_TOOLBAR_GROUP_CLASS,
  COMPACT_TOOLBAR_ICON_BUTTON_CLASS,
  compactToolbarSelectClass
} from '@/components/agentic/toolbarStyles';
import { WorkbookActionsMenu } from '@/components/agentic/WorkbookActionsMenu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import type { WorkbookEntry } from '@/types/workbook';

interface TrainingToolbarLeftProps {
  workbooks: WorkbookEntry[];
  activeWorkbookId: string;
  onSwitch: (value: string) => void;
  onNew: () => void;
  onRename: () => void;
  onReplay: () => void;
  onReset: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
}

export function TrainingToolbarLeft({
  workbooks,
  activeWorkbookId,
  onSwitch,
  onNew,
  onRename,
  onReplay,
  onReset,
  onDelete,
  canDelete
}: TrainingToolbarLeftProps) {
  return (
    <div className={COMPACT_TOOLBAR_GROUP_CLASS}>
      <Select value={activeWorkbookId} onValueChange={onSwitch}>
        <SelectTrigger className={compactToolbarSelectClass('w-[180px]')}>
          <SelectValue placeholder="Workbook" />
        </SelectTrigger>
        <SelectContent>
          {workbooks.map((wb) => (
            <SelectItem key={wb.id} value={wb.id}>
              {wb.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="icon"
        className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
        onClick={onNew}
        title="New workbook"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>

      <WorkbookActionsMenu
        onRename={onRename}
        onReplay={onReplay}
        onReset={onReset}
        onDelete={onDelete}
        disableAll={!activeWorkbookId}
        disableDelete={!canDelete}
      />
    </div>
  );
}
