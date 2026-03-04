import { Button } from '@/components/ui/button';
import {
  COMPACT_TOOLBAR_GROUP_CLASS,
  COMPACT_TOOLBAR_ICON_BUTTON_CLASS,
  compactToolbarSelectClass
} from '@/components/agentic/toolbarStyles';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AvailableTable } from '@/types/preprocessing';
import { Database, MoreHorizontal, Pencil, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';

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
  onDeleteTab: () => void;
  canDeleteTab: boolean;
  selectedDatasetId: string;
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
  canDeleteTab,
  selectedDatasetId
}: PreprocessingToolbarLeftProps) {
  return (
    <div className={COMPACT_TOOLBAR_GROUP_CLASS}>
      <Select value={activeTabId} onValueChange={onTabSwitch}>
        <SelectTrigger className={compactToolbarSelectClass('w-[180px]')}>
          <SelectValue placeholder="Processing tab" />
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
        title="New processing tab"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
            disabled={!activeTabId}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={onRenameTab}>
            <Pencil className="h-3.5 w-3.5 mr-2" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onReplayCheck} disabled={!selectedDatasetId}>
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
            Replay Check
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onResetTab}>
            <RotateCcw className="h-3.5 w-3.5 mr-2" />
            Reset Tab
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={onDeleteTab}
            className="text-destructive focus:text-destructive"
            disabled={!canDeleteTab}
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
    <>
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
    </>
  );
}
