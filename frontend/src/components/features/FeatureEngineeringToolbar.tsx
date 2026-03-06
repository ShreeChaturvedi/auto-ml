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
import { Database, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';

interface FeatureVersionOption {
  id: string;
  name: string;
}

interface DatasetOption {
  id: string;
  name: string;
}

interface FeatureEngineeringToolbarLeftProps {
  currentVersionId: string;
  versions: FeatureVersionOption[];
  onVersionSwitch: (value: string) => void;
  onNewDraft: () => void;
  onRenameDraft: () => void;
  onDeleteDraft: () => void;
  canRenameDraft: boolean;
  canDeleteDraft: boolean;
}

interface FeatureEngineeringToolbarRightProps {
  selectedDatasetId: string;
  datasetOptions: DatasetOption[];
  onDatasetSelect: (value: string) => void;
  selectedTargetColumn: string;
  targetColumns: string[];
  onTargetColumnSelect: (value: string) => void;
}

export function FeatureEngineeringToolbarLeft({
  currentVersionId,
  versions,
  onVersionSwitch,
  onNewDraft,
  onRenameDraft,
  onDeleteDraft,
  canRenameDraft,
  canDeleteDraft
}: FeatureEngineeringToolbarLeftProps) {
  return (
    <div className={COMPACT_TOOLBAR_GROUP_CLASS}>
      <Select value={currentVersionId} onValueChange={onVersionSwitch} disabled={versions.length === 0}>
        <SelectTrigger className={compactToolbarSelectClass('w-[180px]')}>
          <SelectValue placeholder="Pipeline" />
        </SelectTrigger>
        <SelectContent>
          {versions.map((version) => (
            <SelectItem key={version.id} value={version.id}>
              {version.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="icon"
        className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
        onClick={onNewDraft}
        title="New draft pipeline"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
            disabled={!currentVersionId}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={onRenameDraft} disabled={!canRenameDraft}>
            <Pencil className="h-3.5 w-3.5 mr-2" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={onDeleteDraft}
            className="text-destructive focus:text-destructive"
            disabled={!canDeleteDraft}
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function FeatureEngineeringToolbarRight({
  selectedDatasetId,
  datasetOptions,
  onDatasetSelect,
  selectedTargetColumn,
  targetColumns,
  onTargetColumnSelect
}: FeatureEngineeringToolbarRightProps) {
  return (
    <>
      <Select value={selectedDatasetId} onValueChange={onDatasetSelect} disabled={datasetOptions.length === 0}>
        <SelectTrigger className="h-7 w-[180px] text-xs">
          <Database className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
          <SelectValue placeholder="Dataset" />
        </SelectTrigger>
        <SelectContent>
          {datasetOptions.map((file) => (
            <SelectItem key={file.id} value={file.id}>
              {file.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedTargetColumn} onValueChange={onTargetColumnSelect} disabled={targetColumns.length === 0}>
        <SelectTrigger className="h-7 w-[150px] text-xs">
          <SelectValue placeholder="Target column" />
        </SelectTrigger>
        <SelectContent>
          {targetColumns.map((column) => (
            <SelectItem key={column} value={column}>
              {column}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
