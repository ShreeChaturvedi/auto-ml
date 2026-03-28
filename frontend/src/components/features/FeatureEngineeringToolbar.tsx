import { Button } from '@/components/ui/button';
import {
  COMPACT_TOOLBAR_GROUP_CLASS,
  COMPACT_TOOLBAR_ICON_BUTTON_CLASS,
  compactToolbarSelectClass
} from '@/components/agentic/toolbarStyles';
import { WorkbookActionsMenu } from '@/components/agentic/WorkbookActionsMenu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Database, Plus } from 'lucide-react';

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
  onReplay: () => void;
  onReset: () => void;
  onDeleteDraft?: () => void;
  canRenameDraft: boolean;
  canDeleteDraft?: boolean;
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
  onReplay,
  onReset,
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

      <WorkbookActionsMenu
        onRename={onRenameDraft}
        onReplay={onReplay}
        onReset={onReset}
        onDelete={onDeleteDraft}
        disableAll={!currentVersionId}
        disableRename={!canRenameDraft}
        disableDelete={!canDeleteDraft}
      />
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
        <SelectTrigger className="h-7 min-w-0 max-w-[180px] flex-1 text-xs">
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
        <SelectTrigger className="h-7 min-w-0 max-w-[150px] flex-1 text-xs">
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
