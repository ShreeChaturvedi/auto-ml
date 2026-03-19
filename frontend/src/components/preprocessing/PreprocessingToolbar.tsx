import { Button } from '@/components/ui/button';
import {
  COMPACT_TOOLBAR_GROUP_CLASS,
  COMPACT_TOOLBAR_ICON_BUTTON_CLASS,
  compactToolbarSelectClass
} from '@/components/agentic/toolbarStyles';
import { WorkbookActionsMenu } from '@/components/agentic/WorkbookActionsMenu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AvailableTable } from '@/types/preprocessing';
import { Database, Plus } from 'lucide-react';

interface ProcessingTabOption {
  id: string;
  name: string;
}

interface PreprocessingToolbarLeftProps {
  tabs: ProcessingTabOption[];
  activeTabId: string;
  onTabSwitch: (value: string) => void;
  onNewTab: () => void;
  onRenameTab: () => void;
  onReplayCheck: () => void;
  onResetTab: () => void;
  onDeleteTab?: () => void;
  canReplay: boolean;
  canDelete?: boolean;
}

interface PreprocessingToolbarRightProps {
  selectedDatasetId: string;
  tables: AvailableTable[];
  onDatasetSelect: (value: string) => void;
  isLoadingTables: boolean;
}

export function PreprocessingToolbarLeft({
  tabs,
  activeTabId,
  onTabSwitch,
  onNewTab,
  onRenameTab,
  onReplayCheck,
  onResetTab,
  onDeleteTab,
  canReplay,
  canDelete
}: PreprocessingToolbarLeftProps) {
  return (
    <div className={COMPACT_TOOLBAR_GROUP_CLASS}>
      <Select value={activeTabId} onValueChange={onTabSwitch}>
        <SelectTrigger className={compactToolbarSelectClass('w-[180px]')}>
          <SelectValue placeholder="Workbook" />
        </SelectTrigger>
        <SelectContent>
          {tabs.map((tab) => (
            <SelectItem key={tab.id} value={tab.id}>
              {tab.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="icon"
        className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
        onClick={onNewTab}
        title="New workbook"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>

      <WorkbookActionsMenu
        onRename={onRenameTab}
        onReplay={onReplayCheck}
        onReset={onResetTab}
        onDelete={onDeleteTab}
        disableAll={!activeTabId}
        disableReplay={!canReplay}
        disableDelete={!canDelete}
      />
    </div>
  );
}

export function PreprocessingToolbarRight({
  selectedDatasetId,
  tables,
  onDatasetSelect,
  isLoadingTables
}: PreprocessingToolbarRightProps) {
  return (
    <Select
      value={selectedDatasetId}
      onValueChange={onDatasetSelect}
      disabled={isLoadingTables || tables.length === 0}
    >
      <SelectTrigger className="h-7 w-[200px] text-xs">
        <Database className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
        <SelectValue placeholder="Select dataset" />
      </SelectTrigger>
      <SelectContent>
        {tables.map((table) => (
          <SelectItem key={table.datasetId} value={table.datasetId}>
            {table.filename}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
