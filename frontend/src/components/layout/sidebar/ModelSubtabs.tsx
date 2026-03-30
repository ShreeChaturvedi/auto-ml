/**
 * ModelSubtabs — renders trained models under the Experiments phase.
 * Reuses SubtabItem for uniform sidebar spacing.
 */

import { useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MoreVertical, Download, Trash2, GitCompareArrows } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useModelStore } from '@/stores/modelStore';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { getModelArtifactUrl } from '@/lib/api/models';
import { resolveModelIcon } from '@/components/experiments/modelIcons';
import { SubtabItem } from './SubtabItem';

interface ModelSubtabsProps {
  projectId: string;
  /** Whether this phase is the currently active one in the sidebar. */
  isActivePhase: boolean;
}

function ModelActionMenu({
  hasArtifact,
  isCompared,
  onDownload,
  onDelete,
  onCompare
}: {
  hasArtifact: boolean;
  isCompared: boolean;
  onDownload: () => void;
  onDelete: () => void;
  onCompare: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 -my-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-3 w-3" />
          <span className="sr-only">Model options</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hasArtifact && (
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); onCompare(); }}
        >
          <GitCompareArrows className="h-4 w-4 mr-2" />
          {isCompared ? 'Remove from comparison' : 'Compare'}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ModelSubtabs({ projectId, isActivePhase }: ModelSubtabsProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const models = useModelStore((s) => s.models);
  const refreshModels = useModelStore((s) => s.refreshModels);
  const deleteModel = useModelStore((s) => s.deleteModel);

  const selectedModelId = useExperimentsStore((s) => s.selectedModelId);
  const comparisonModelIds = useExperimentsStore((s) => s.comparisonModelIds);
  const selectModel = useExperimentsStore((s) => s.selectModel);
  const toggleComparison = useExperimentsStore((s) => s.toggleComparison);

  const isOnExperiments = location.pathname.endsWith('/experiments');

  // Hydrate models only when the Experiments phase is active (subtabs are
  // always-mounted for the grid-rows animation, so skip when collapsed).
  useEffect(() => {
    if (projectId && isActivePhase) void refreshModels(projectId);
  }, [projectId, isActivePhase, refreshModels]);

  // Defensive filter: only show models for this project, exclude failed
  const projectModels = useMemo(
    () => models.filter((m) => m.projectId === projectId && m.status === 'completed'),
    [models, projectId]
  );

  if (projectModels.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {projectModels.map((model) => {
        const { Icon, colorClass } = resolveModelIcon(model.taskType);
        const isCompared = comparisonModelIds.includes(model.modelId);

        return (
          <SubtabItem
            key={model.modelId}
            icon={Icon}
            label={model.name}
            isActive={isOnExperiments && model.modelId === selectedModelId}

            iconColorClass={colorClass}
            onClick={() => {
              navigate(`/project/${projectId}/experiments`);
              selectModel(model.modelId);
            }}
            actionSlot={
              <ModelActionMenu
                hasArtifact={!!model.artifact}
                isCompared={isCompared}
                onDownload={() => window.open(getModelArtifactUrl(model.modelId))}
                onDelete={() => deleteModel(model.modelId)}
                onCompare={() => toggleComparison(model.modelId)}
              />
            }
          />
        );
      })}
    </div>
  );
}
