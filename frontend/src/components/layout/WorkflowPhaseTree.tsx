/**
 * WorkflowPhaseTree - Sidebar phase list with subtab system.
 *
 * Phases are top-level items. Expandable phases show subtabs:
 * - Data Upload: plan files
 * - Explorer: data files + context files
 * - Processing/FE/Training: workbooks
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { ChevronRight, Plus } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { useWorkbookRegistryStore, type WorkbookPhase } from '@/stores/workbookRegistryStore';
import { createWorkbookId, nextWorkbookName } from '@/components/preprocessing/preprocessingTabUtils';
import type { Phase } from '@/types/phase';
import { phaseConfig, getAllPhasesSorted } from '@/types/phase';
import { projectColorClasses } from '@/types/project';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { getWorkbookParam } from '@/lib/workbookParam';
import { PlanSubtabs } from './sidebar/PlanSubtabs';
import { FileSubtabs } from './sidebar/FileSubtabs';
import { WorkbookSubtabs } from './sidebar/WorkbookSubtabs';

const EXPANDABLE_PHASES = new Set<Phase>([
  'upload',
  'data-viewer',
  'preprocessing',
  'feature-engineering',
  'training'
]);

const WORKBOOK_PHASES = new Set<Phase>(['preprocessing', 'feature-engineering', 'training']);

/** Phases that show a "+" action button on hover */
const PLUS_ACTION_PHASES = new Set<Phase>([
  'upload',
  'preprocessing',
  'feature-engineering',
  'training'
]);

interface WorkflowPhaseTreeProps {
  collapsed?: boolean;
}

export function WorkflowPhaseTree({ collapsed = false }: WorkflowPhaseTreeProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const projects = useProjectStore((state) => state.projects);

  const activeProject = activeProjectId
    ? projects.find((p) => p.id === activeProjectId)
    : undefined;

  const unlockedPhases = activeProject?.unlockedPhases ?? [];
  const currentPhase = activeProject?.currentPhase;
  const allPhases = getAllPhasesSorted();

  const [expandedPhases, setExpandedPhases] = useState<Set<Phase>>(new Set());

  const activeWorkbookId = getWorkbookParam(searchParams);

  const expandPhase = useCallback((phase: Phase) => {
    setExpandedPhases((prev) => {
      if (prev.has(phase)) return prev;
      const next = new Set(prev);
      next.add(phase);
      return next;
    });
  }, []);

  // Auto-expand the current phase when it's expandable
  useEffect(() => {
    if (currentPhase && EXPANDABLE_PHASES.has(currentPhase)) {
      expandPhase(currentPhase);
    }
  }, [currentPhase, expandPhase]);

  const togglePhaseExpand = (phase: Phase) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) {
        next.delete(phase);
      } else {
        next.add(phase);
      }
      return next;
    });
  };

  const handlePhaseClick = (e: React.MouseEvent, phase: Phase) => {
    e.stopPropagation();
    if (activeProjectId && unlockedPhases.includes(phase)) {
      navigate(`/project/${activeProjectId}/${phase}`);
      // Toggle expand for expandable phases
      if (EXPANDABLE_PHASES.has(phase)) {
        togglePhaseExpand(phase);
      }
    }
  };

  const handleNewWorkbook = (e: React.MouseEvent, phase: Phase) => {
    e.stopPropagation();
    if (!activeProjectId || !WORKBOOK_PHASES.has(phase)) return;

    const registryPhase = phase as WorkbookPhase;
    const registry = useWorkbookRegistryStore.getState();
    const existing = registry[registryPhase];
    const newId = createWorkbookId();
    const newName = nextWorkbookName(existing);

    // Write to registry (triggers sidebar re-render)
    registry.addWorkbook(registryPhase, { id: newId, name: newName, notebookId: null });

    // Navigate — the phase panel will pick up the new workbook via URL param
    // and reconcile it with localStorage/Postgres on mount.
    navigate(`/project/${activeProjectId}/${phase}?workbook=${newId}`);
  };

  const handleNewPlan = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeProjectId) {
      navigate(`/project/${activeProjectId}/upload?newPlan=1`);
    }
  };

  const themeColorClass = activeProject
    ? projectColorClasses[activeProject.color]?.text ?? ''
    : '';

  if (!activeProject) {
    return !collapsed ? (
      <div className="px-3 py-2 text-workflow text-muted-foreground">
        Select a project to view phases
      </div>
    ) : null;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-0.5">
        {allPhases.map((phase) => {
          const config = phaseConfig[phase];
          const isUnlocked = unlockedPhases.includes(phase);
          const isActive = phase === currentPhase;
          const isExpandable = EXPANDABLE_PHASES.has(phase) && isUnlocked;
          const isExpanded = expandedPhases.has(phase);
          const isWorkbookPhase = WORKBOOK_PHASES.has(phase);
          const hasPlusAction = PLUS_ACTION_PHASES.has(phase) && isExpandable;

          const iconColorClass = isActive && activeProject
            ? projectColorClasses[activeProject.color]?.text
            : undefined;

          const IconComponent = (
            LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>
          )[config.icon];

          const phaseButton = (
            <div
              className={cn(
                'group flex items-center gap-1 rounded-lg',
                !isUnlocked
                  ? 'text-muted-foreground/50'
                  : isActive
                    ? 'bg-muted font-medium'
                    : 'text-foreground hover:bg-muted'
              )}
            >
              <button
                type="button"
                onClick={(e) => handlePhaseClick(e, phase)}
                disabled={!isUnlocked}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left rounded-lg',
                  !isUnlocked && 'cursor-default',
                  isUnlocked && 'cursor-pointer'
                )}
              >
                {/* Icon + Chevron overlay container */}
                <div className="relative shrink-0 h-3.5 w-3.5">
                  {/* Phase icon - fades out on hover for expandable phases */}
                  {IconComponent && (
                    <IconComponent
                      className={cn(
                        'absolute inset-0 h-3.5 w-3.5 transition-opacity duration-200',
                        isExpandable && 'group-hover:opacity-0',
                        iconColorClass
                      )}
                    />
                  )}
                  {/* Chevron - fades in on hover, rotates when expanded */}
                  {isExpandable && (
                    <ChevronRight
                      className={cn(
                        'absolute inset-0 h-3.5 w-3.5 transition-all duration-200',
                        'opacity-0 group-hover:opacity-100',
                        isExpanded && 'rotate-90',
                        iconColorClass
                      )}
                    />
                  )}
                </div>
                <span
                  className={cn(
                    'flex-1 text-workflow truncate transition-opacity duration-300',
                    collapsed && 'opacity-0'
                  )}
                >
                  {config.label}
                </span>
              </button>

              {/* "+" button - hover-only, for phases with add actions */}
              {hasPlusAction && !collapsed && (
                <button
                  type="button"
                  onClick={isWorkbookPhase ? (e) => handleNewWorkbook(e, phase) : handleNewPlan}
                  className="shrink-0 p-0.5 mr-1 rounded hover:bg-muted-foreground/10 transition-all opacity-0 group-hover:opacity-100"
                  title={isWorkbookPhase ? 'New workbook' : 'New plan'}
                >
                  <Plus className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
          );

          return (
            <div key={phase}>
              <Tooltip>
                <TooltipTrigger asChild>
                  {phaseButton}
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right">
                    <p>{config.label}</p>
                  </TooltipContent>
                )}
              </Tooltip>

              {/* Subtabs — always rendered for animation, visibility controlled by grid-rows */}
              {isExpandable && !collapsed && activeProjectId && (
                <div
                  className={cn(
                    'grid transition-[grid-template-rows,opacity] duration-300 ease-in-out',
                    isExpanded
                      ? 'grid-rows-[1fr] opacity-100'
                      : 'grid-rows-[0fr] opacity-0'
                  )}
                >
                  <div className="relative overflow-hidden">
                    {/* Vertical connector line — bottom-3 stops at last subitem icon center */}
                    <div
                      className="absolute top-0 bottom-3 w-px bg-border"
                      style={{ left: '19px' }}
                    />
                    {phase === 'upload' && (
                      <PlanSubtabs projectId={activeProjectId} themeColorClass={themeColorClass} />
                    )}
                    {phase === 'data-viewer' && (
                      <FileSubtabs projectId={activeProjectId} themeColorClass={themeColorClass} />
                    )}
                    {isWorkbookPhase && (
                      <WorkbookSubtabs
                        projectId={activeProjectId}
                        phase={phase as WorkbookPhase}
                        themeColorClass={themeColorClass}
                        activeWorkbookId={isActive ? activeWorkbookId : undefined}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
