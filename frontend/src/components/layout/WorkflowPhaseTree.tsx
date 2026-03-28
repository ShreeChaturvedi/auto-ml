/**
 * WorkflowPhaseTree - Sidebar phase list with subtab system.
 *
 * Phases are top-level items. Expandable phases show subtabs:
 * - Data Upload: plan files
 * - Explorer: data files + context files
 * - Processing/FE/Training: workbooks
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { ChevronRight, Plus } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { useWorkbookRegistryStore, type WorkbookPhase } from '@/stores/workbookRegistryStore';
import { createWorkbookId, nextWorkbookName } from '@/components/preprocessing/preprocessingTabUtils';
import type { Phase } from '@/types/phase';
import { phaseConfig, WORKFLOW_PHASES } from '@/types/phase';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { getWorkbookParam } from '@/lib/workbookParam';
import { SeedModelDialog } from '@/components/experiments/SeedModelDialog';
import { PlanSubtabs } from './sidebar/PlanSubtabs';
import { FileSubtabs } from './sidebar/FileSubtabs';
import { WorkbookSubtabs } from './sidebar/WorkbookSubtabs';
import { ModelSubtabs } from './sidebar/ModelSubtabs';

const EXPANDABLE_PHASES = new Set<Phase>([
  'upload',
  'data-viewer',
  'preprocessing',
  'feature-engineering',
  'training',
  'experiments'
]);

const WORKBOOK_PHASES = new Set<Phase>(['preprocessing', 'feature-engineering', 'training']);

const EMPTY_PHASES: Phase[] = [];

/**
 * Connector-line layout constants.
 *
 * Phase button: py-2 (8px) padding + icon h-3.5 (14px) → icon bottom at 22px.
 * SubtabItem:   py-1.5 (6px) padding + icon h-3.5 (14px) → icon center at 13px from item bottom.
 * Horizontal:   px-3 (12px) + half of w-3.5 (7px) = 19px center, minus 0.5px to center the 1px line.
 */
const LINE_STYLE_BASE = { left: '18.5px', top: '22px', bottom: '13px' } as const;
const LINE_STYLE_ACTIVE: React.CSSProperties = { ...LINE_STYLE_BASE, background: 'currentColor' };
const LINE_STYLE_INACTIVE: React.CSSProperties = { ...LINE_STYLE_BASE, background: 'hsl(var(--muted-foreground) / 0.25)' };

/** Phases that show a "+" action button on hover */
const PLUS_ACTION_PHASES = new Set<Phase>([
  'upload',
  'preprocessing',
  'feature-engineering',
  'training',
  'experiments',
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

  const unlockedPhases = activeProject?.unlockedPhases ?? EMPTY_PHASES;
  const currentPhase = activeProject?.currentPhase;
  const allPhases = WORKFLOW_PHASES;

  const [expandedPhases, setExpandedPhases] = useState<Set<Phase>>(new Set());
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [shimmeringPhases, setShimmeringPhases] = useState<Set<Phase>>(new Set());
  const prevUnlockedRef = useRef<Phase[]>(unlockedPhases);

  // Reset shimmer tracking when switching projects
  useEffect(() => {
    prevUnlockedRef.current = unlockedPhases;
    setShimmeringPhases(new Set());
  }, [activeProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect newly-unlocked phases and trigger shimmer via animationend
  useEffect(() => {
    const prev = new Set(prevUnlockedRef.current);
    const newlyUnlocked = unlockedPhases.filter((p: Phase) => !prev.has(p));
    prevUnlockedRef.current = unlockedPhases;

    if (newlyUnlocked.length === 0) return;

    setShimmeringPhases((s) => {
      const next = new Set(s);
      for (const p of newlyUnlocked) next.add(p);
      return next;
    });
  }, [unlockedPhases]);

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

  useProjectThemeColor();

  if (!activeProject) {
    return !collapsed ? (
      <div className="px-3 py-2 text-sm text-muted-foreground">
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
          const hasPlusAction = PLUS_ACTION_PHASES.has(phase) && (isExpandable || phase === 'experiments');

          const iconColorClass = isActive ? 'text-accent-text' : undefined;

          const IconComponent = (
            LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>
          )[config.icon];

          const phaseButton = (
            <div
              className={cn(
                'group flex items-center gap-1 rounded-lg',
                !isUnlocked
                  ? 'text-muted-foreground'
                  : isActive
                    ? 'bg-muted font-medium shadow-[inset_2px_0_0_0_hsl(var(--accent-fill))]'
                    : 'text-foreground hover:bg-muted',
                collapsed && isUnlocked && 'cursor-pointer'
              )}
              onClick={collapsed && isUnlocked ? (e) => handlePhaseClick(e, phase) : undefined}
            >
              {/* Chevron toggle — separate from the navigation button so
                  expand/collapse never triggers navigation. */}
              {isExpandable ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (collapsed) handlePhaseClick(e, phase);
                    else togglePhaseExpand(phase);
                  }}
                  className="shrink-0 pl-3 py-2 cursor-pointer focus-visible:outline-none focus-visible:bg-accent"
                  aria-label={isExpanded ? `Collapse ${config.label}` : `Expand ${config.label}`}
                >
                  <div className="relative h-3.5 w-3.5">
                    {IconComponent && (
                      <IconComponent
                        className={cn(
                          'absolute inset-0 h-3.5 w-3.5 transition-opacity duration-200',
                          !collapsed && 'group-hover:opacity-0 group-focus-within:opacity-0',
                          iconColorClass
                        )}
                      />
                    )}
                    <ChevronRight
                      className={cn(
                        'absolute inset-0 h-3.5 w-3.5 transition-[opacity,transform] duration-200',
                        collapsed ? 'opacity-0' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                        isExpanded && 'rotate-90',
                        iconColorClass
                      )}
                    />
                  </div>
                </button>
              ) : (
                <div className="shrink-0 pl-3 py-2">
                  {IconComponent && (
                    <IconComponent className={cn('h-3.5 w-3.5', iconColorClass)} />
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={(e) => handlePhaseClick(e, phase)}
                disabled={!isUnlocked}
                className={cn(
                  'flex min-w-0 flex-1 items-center py-2 pr-3 text-left rounded-r-lg focus-visible:outline-none focus-visible:bg-accent',
                  !isUnlocked && 'cursor-default',
                  isUnlocked && 'cursor-pointer'
                )}
              >
                <span
                  className={cn(
                    'flex-1 text-sm truncate transition-opacity duration-300 pl-2',
                    collapsed && 'opacity-0',
                    isActive && 'font-medium',
                    shimmeringPhases.has(phase) && 'shimmer-text-once'
                  )}
                  onAnimationEnd={shimmeringPhases.has(phase) ? () => {
                    setShimmeringPhases((s) => {
                      const next = new Set(s);
                      next.delete(phase);
                      return next;
                    });
                  } : undefined}
                >
                  {config.label}
                </span>
              </button>

              {/* "+" button - hover-only, for phases with add actions */}
              {hasPlusAction && !collapsed && (
                <button
                  type="button"
                  onClick={
                    isWorkbookPhase ? (e) => handleNewWorkbook(e, phase)
                    : phase === 'experiments' ? (e) => { e.stopPropagation(); setSeedDialogOpen(true); }
                    : handleNewPlan
                  }
                  className="shrink-0 p-0.5 mr-1 rounded hover:bg-muted-foreground/10 transition-opacity opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                  title={isWorkbookPhase ? 'New workbook' : phase === 'experiments' ? 'Seed test model' : 'New plan'}
                >
                  <Plus className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
          );

          return (
            <div key={phase} className="relative">
              {/* Vertical connector line — spans from phase icon/background through subtabs.
                  Positioned on the phase root so it isn't clipped by the subtabs overflow-hidden. */}
              {isExpandable && !collapsed && activeProjectId && (
                <div
                  className={cn(
                    'absolute w-px transition-opacity duration-300',
                    isExpanded ? 'opacity-100' : 'opacity-0',
                    isActive && 'text-accent-text'
                  )}
                  style={isActive ? LINE_STYLE_ACTIVE : LINE_STYLE_INACTIVE}
                />
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  {phaseButton}
                </TooltipTrigger>
                {collapsed ? (
                  <TooltipContent side="right">
                    <p>{config.label}</p>
                  </TooltipContent>
                ) : isUnlocked && !isActive ? (
                  <TooltipContent side="right">
                    <p>{config.description}</p>
                  </TooltipContent>
                ) : null}
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
                  <div className="overflow-hidden">
                    {phase === 'upload' && (
                      <PlanSubtabs projectId={activeProjectId} />
                    )}
                    {phase === 'data-viewer' && (
                      <FileSubtabs projectId={activeProjectId} />
                    )}
                    {isWorkbookPhase && (
                      <WorkbookSubtabs
                        projectId={activeProjectId}
                        phase={phase as WorkbookPhase}
                        activeWorkbookId={isActive ? activeWorkbookId : undefined}
                      />
                    )}
                    {phase === 'experiments' && (
                      <ModelSubtabs projectId={activeProjectId} />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {activeProjectId && (
        <SeedModelDialog
          projectId={activeProjectId}
          open={seedDialogOpen}
          onOpenChange={setSeedDialogOpen}
        />
      )}
    </TooltipProvider>
  );
}
