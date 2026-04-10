/**
 * WorkflowPhaseTree - Sidebar phase list with subtab system.
 *
 * Phases are top-level items. Expandable phases show subtabs:
 * - Data Upload: plan files
 * - Explorer: data files + context files
 * - Processing/FE/Training: workbooks
 *
 * Architecture:
 * - Each phase is a memoized PhaseItem to isolate re-renders.
 * - Store selectors are narrow: only currentPhase and unlockedPhases,
 *   not the full projects array.
 */

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '@/stores/projectStore';
import { usePlanChatStore } from '@/stores/planChatStore';
import { useWorkbookRegistryStore, type WorkbookPhase } from '@/stores/workbookRegistryStore';
import { createWorkbookId, nextWorkbookName } from '@/components/preprocessing/preprocessingTabUtils';
import type { Phase } from '@/types/phase';
import { phaseConfig, WORKFLOW_PHASES } from '@/types/phase';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { cn } from '@/lib/utils';
import { getLucideIcon } from '@/lib/icons';
import { getSidebarAccordionPref } from '@/lib/sidebarPrefs';
import { SeedModelDialog } from '@/components/experiments/SeedModelDialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PlanSubtabs } from './sidebar/PlanSubtabs';
import { FileSubtabs } from './sidebar/FileSubtabs';
import { NotebookSubtabs } from './sidebar/NotebookSubtabs';
import { WorkbookSubtabs } from './sidebar/WorkbookSubtabs';
import { ModelSubtabs } from './sidebar/ModelSubtabs';
import { DeploymentSubtabs } from './sidebar/DeploymentSubtabs';

const EXPANDABLE_PHASES = new Set<Phase>([
  'upload',
  'data-viewer',
  'preprocessing',
  'feature-engineering',
  'training',
  'experiments',
  'deployment'
]);

const WORKBOOK_PHASES = new Set<Phase>(['preprocessing', 'feature-engineering', 'training']);

const EMPTY_PHASES: Phase[] = [];

/**
 * Connector-line layout constants.
 *
 * The line runs vertically at the parent phase icon's horizontal center,
 * forming a tree-gutter rail. Subtab content is indented right (pl-4 on
 * the subtab container) so icons sit beside the line, not on it.
 *
 * Vertical: Phase button py-2 (8px) + icon h-3.5 (14px) → top at 22px.
 *           SubtabItem py-1.5 (6px) + icon center (7px) → bottom at 13px from last item.
 * Horizontal: Phase icon px-3 (12px) + half w-3.5 (7px) − 0.5px = 18.5px.
 *             Subtab icons start at 28px (16px container + 12px item padding),
 *             clearing the line by 9.5px.
 */
const LINE_STYLE_BASE = { left: '18.5px', top: '22px', bottom: '13px' } as const;
const LINE_STYLE_ACTIVE: React.CSSProperties = { ...LINE_STYLE_BASE, background: 'currentColor' };
const LINE_STYLE_INACTIVE: React.CSSProperties = { ...LINE_STYLE_BASE, background: 'hsl(var(--muted-foreground) / 0.25)' };

/** Min subtabs column height (px) to show the vertical rail; avoids empty-phase sliver. */
const SUBTAB_RAIL_MIN_HEIGHT_PX = 1;

function readSubtabColumnHeightPx(el: HTMLElement, entry?: ResizeObserverEntry): number {
  const h = entry?.contentRect.height ?? el.getBoundingClientRect().height;
  return Number.isFinite(h) ? h : 0;
}

/** Phases that show a "+" action button on hover */
const PLUS_ACTION_PHASES = new Set<Phase>([
  'upload',
  'preprocessing',
  'feature-engineering',
  'training',
  'experiments',
]);

// ─── PhaseItem ───────────────────────────────────────────────────────────────

interface PhaseItemProps {
  phase: Phase;
  collapsed: boolean;
  projectId: string;
  isUnlocked: boolean;
  isActive: boolean;
  isExpanded: boolean;
  hasBeenExpanded: boolean;
  isShimmering: boolean;
  onPhaseClick: (e: React.MouseEvent, phase: Phase) => void;
  onToggleExpand: (phase: Phase) => void;
  onNewWorkbook: (e: React.MouseEvent, phase: Phase) => void;
  onNewPlan: (e: React.MouseEvent) => void;
  onShimmerEnd: (phase: Phase) => void;
  onOpenSeedDialog: () => void;
}

/**
 * Memoized phase row. Isolates re-renders so that shimmer ending on
 * phase A doesn't re-render phases B through G.
 */
const PhaseItem = memo(function PhaseItem({
  phase, collapsed, projectId,
  isUnlocked, isActive, isExpanded, hasBeenExpanded, isShimmering,
  onPhaseClick, onToggleExpand, onNewWorkbook, onNewPlan,
  onShimmerEnd, onOpenSeedDialog
}: PhaseItemProps) {
  const config = phaseConfig[phase];
  const isExpandable = EXPANDABLE_PHASES.has(phase) && isUnlocked;
  const isWorkbookPhase = WORKBOOK_PHASES.has(phase);
  const hasPlusAction = isExpandable && PLUS_ACTION_PHASES.has(phase);
  const activeColorClass = isActive ? 'text-accent-text' : 'text-muted-foreground';

  const IconComponent = getLucideIcon(config.icon);

  const subtabWrapRef = useRef<HTMLDivElement>(null);
  const [subtabRailHeight, setSubtabRailHeight] = useState(0);

  useLayoutEffect(() => {
    const el = subtabWrapRef.current;
    if (!el || !isExpandable || collapsed || !isExpanded) {
      setSubtabRailHeight((prev) => (prev === 0 ? prev : 0));
      return;
    }
    const applyHeight = (entry?: ResizeObserverEntry) => {
      setSubtabRailHeight((prev) => {
        const next = readSubtabColumnHeightPx(el, entry);
        return prev === next ? prev : next;
      });
    };
    applyHeight();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      applyHeight(entries[0]);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [isExpandable, collapsed, isExpanded, hasBeenExpanded, phase, projectId]);

  const showSubtabRail =
    isExpandable &&
    !collapsed &&
    isExpanded &&
    subtabRailHeight > SUBTAB_RAIL_MIN_HEIGHT_PX;

  const phaseButton = (
    <div
      data-testid={`workflow-phase-${phase}`}
      className={cn(
        'group flex items-center gap-2 rounded-lg',
        !isUnlocked
          ? 'text-muted-foreground'
          : isActive
            ? 'bg-muted'
            : 'text-foreground hover:bg-muted',
        collapsed && isUnlocked && 'cursor-pointer'
      )}
      onClick={collapsed && isUnlocked ? (e) => onPhaseClick(e, phase) : undefined}
    >
      {isExpandable ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (collapsed) onPhaseClick(e, phase);
            else onToggleExpand(phase);
          }}
          className="group/expand shrink-0 pl-3 py-2 cursor-pointer focus-visible:outline-none focus-visible:bg-accent"
          aria-label={isExpanded ? `Collapse ${config.label}` : `Expand ${config.label}`}
          data-testid={`workflow-phase-toggle-${phase}`}
        >
          <div className="relative h-3.5 w-3.5" data-testid={`workflow-phase-icon-${phase}`}>
            {IconComponent ? (
              <IconComponent
                className={cn(
                  'absolute inset-0 h-3.5 w-3.5 transition-opacity duration-200',
                  !collapsed && 'group-hover:opacity-0 group-focus-visible/expand:opacity-0',
                  activeColorClass
                )}
              />
            ) : null}
            <ChevronRight
              data-testid={`workflow-phase-chevron-${phase}`}
              className={cn(
                'absolute inset-0 h-3.5 w-3.5 transition-[opacity,transform] duration-200',
                collapsed
                  ? 'opacity-0'
                  : 'opacity-0 group-hover:opacity-100 group-focus-visible/expand:opacity-100',
                isExpanded && 'rotate-90',
                activeColorClass
              )}
            />
          </div>
        </button>
      ) : (
        <div className="shrink-0 pl-3 py-2">
          {IconComponent && (
            <IconComponent
              data-testid={`workflow-phase-icon-${phase}`}
              className={cn('h-3.5 w-3.5 transition-colors duration-200', activeColorClass)}
            />
          )}
        </div>
      )}

      <button
        type="button"
        onClick={(e) => onPhaseClick(e, phase)}
        disabled={!isUnlocked}
        className={cn(
          'flex min-w-0 flex-1 items-center py-2 pr-3 text-left rounded-r-lg focus-visible:outline-none focus-visible:bg-accent',
          !isUnlocked && 'cursor-default',
          isUnlocked && 'cursor-pointer'
        )}
        data-testid={`workflow-phase-button-${phase}`}
      >
        <span
          className={cn(
            'flex-1 text-sm truncate transition-opacity duration-300',
            !EXPANDABLE_PHASES.has(phase) && 'pl-2',
            collapsed && 'opacity-0',
            isShimmering && 'shimmer-text-once'
          )}
          onAnimationEnd={isShimmering ? () => onShimmerEnd(phase) : undefined}
        >
          {config.label}
        </span>
      </button>

      {hasPlusAction && !collapsed && (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={
                  isWorkbookPhase ? (e) => onNewWorkbook(e, phase)
                  : phase === 'experiments' ? (e) => { e.stopPropagation(); onOpenSeedDialog(); }
                  : onNewPlan
                }
                className="shrink-0 mr-2 transition-opacity opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors duration-200" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isWorkbookPhase ? 'New workbook' : phase === 'experiments' ? 'Seed test model' : 'New plan'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );

  return (
    <div className="relative">
      {/* Vertical connector: absolute on phase root so subtabs overflow-hidden does not clip it. */}
      {showSubtabRail && (
        <div
          data-testid="workflow-phase-connector"
          data-phase={phase}
          className={cn('absolute w-px transition-opacity duration-300', isActive && 'text-accent-text')}
          style={isActive ? LINE_STYLE_ACTIVE : LINE_STYLE_INACTIVE}
        />
      )}

      {phaseButton}

      {isExpandable && !collapsed && (
        <div
          data-expanded={isExpanded}
          className={cn(
            'grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none',
            isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          )}
        >
          <div
            ref={subtabWrapRef}
            className={cn(
              'min-h-0 overflow-hidden pl-4 transition-opacity motion-reduce:transition-none',
              isExpanded
                ? 'opacity-100 duration-200 delay-75 ease-in'
                : 'opacity-0 duration-150 ease-out'
            )}
          >
            {hasBeenExpanded && phase === 'upload' && <PlanSubtabs projectId={projectId} />}
            {hasBeenExpanded && phase === 'data-viewer' && (
              <>
                <FileSubtabs projectId={projectId} />
                <NotebookSubtabs projectId={projectId} />
              </>
            )}
            {hasBeenExpanded && isWorkbookPhase && (
              <WorkbookSubtabs
                projectId={projectId}
                phase={phase as WorkbookPhase}
                isActivePhase={isActive}
              />
            )}
            {hasBeenExpanded && phase === 'experiments' && <ModelSubtabs projectId={projectId} isActivePhase={isActive} />}
            {hasBeenExpanded && phase === 'deployment' && <DeploymentSubtabs projectId={projectId} isActivePhase={isActive} />}
          </div>
        </div>
      )}
    </div>
  );
});

// ─── WorkflowPhaseTree ──────────────────────────────────────────────────────

interface WorkflowPhaseTreeProps {
  collapsed?: boolean;
  projectId: string;
}

export const WorkflowPhaseTree = memo(function WorkflowPhaseTree({
  collapsed = false,
  projectId
}: WorkflowPhaseTreeProps) {
  const navigate = useNavigate();
  const { projectId: routeProjectId, phase: routePhaseParam } = useParams<{ projectId?: string; phase?: string }>();

  // Narrow selectors — only re-render when these specific values change,
  // not on every project mutation. useShallow for array comparison.
  const unlockedPhases = useProjectStore(
    useShallow((s) => s.projects.find((p) => p.id === projectId)?.unlockedPhases ?? EMPTY_PHASES)
  );
  const currentPhase = useProjectStore(
    (s) => s.projects.find((p) => p.id === projectId)?.currentPhase
  );
  const hasActiveProject = useProjectStore(
    (s) => s.projects.some((p) => p.id === projectId)
  );

  const [expandedPhases, setExpandedPhases] = useState<Set<Phase>>(new Set());
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [shimmeringPhases, setShimmeringPhases] = useState<Set<Phase>>(new Set());
  const prevUnlockedRef = useRef<Phase[]>(unlockedPhases);
  const everExpandedRef = useRef<Set<Phase>>(new Set());
  const routePhase =
    routeProjectId === projectId
    && routePhaseParam
    && Object.prototype.hasOwnProperty.call(phaseConfig, routePhaseParam)
      ? routePhaseParam as Phase
      : null;
  const activePhase = routePhase ?? currentPhase;

  // Initialize plan chat store when project changes
  useEffect(() => {
    void usePlanChatStore.getState().initialize(projectId);
  }, [projectId]);

  // Reset shimmer tracking when switching projects
  useEffect(() => {
    prevUnlockedRef.current = unlockedPhases;
    setShimmeringPhases(new Set());
    const initial = new Set<Phase>();
    if (activePhase && EXPANDABLE_PHASES.has(activePhase)) initial.add(activePhase);
    everExpandedRef.current = initial;
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Auto-expand the active phase on navigation.
  // Accordion mode: collapse others. Independent mode: add without collapsing.
  useEffect(() => {
    if (activePhase && EXPANDABLE_PHASES.has(activePhase)) {
      const accordion = getSidebarAccordionPref();
      everExpandedRef.current.add(activePhase);
      setExpandedPhases((prev) => {
        if (accordion) {
          if (prev.size === 1 && prev.has(activePhase)) return prev;
          return new Set([activePhase]);
        }
        if (prev.has(activePhase)) return prev;
        return new Set([...prev, activePhase]);
      });
    }
  }, [activePhase]);

  // ── Stable callbacks for PhaseItem ────────────────────────────────────

  const handlePhaseClick = useCallback((e: React.MouseEvent, phase: Phase) => {
    e.stopPropagation();
    // Read latest unlock state at click time (not stale closure).
    const unlocked = useProjectStore.getState()
      .projects.find((p) => p.id === projectId)?.unlockedPhases;
    if (projectId && unlocked?.includes(phase)) {
      navigate(`/project/${projectId}/${phase}`);
    }
  }, [projectId, navigate]);

  const handleToggleExpand = useCallback((phase: Phase) => {
    const accordion = getSidebarAccordionPref();
    everExpandedRef.current.add(phase);
    setExpandedPhases((prev) => {
      if (prev.has(phase)) {
        const next = new Set(prev);
        next.delete(phase);
        return next;
      }
      return accordion ? new Set([phase]) : new Set([...prev, phase]);
    });
  }, []);

  const handleNewWorkbook = useCallback((e: React.MouseEvent, phase: Phase) => {
    e.stopPropagation();
    if (!projectId || !WORKBOOK_PHASES.has(phase)) return;

    const registryPhase = phase as WorkbookPhase;
    const registry = useWorkbookRegistryStore.getState();
    const existing = registry[registryPhase];
    const newId = createWorkbookId();
    const newName = nextWorkbookName(existing);

    registry.addWorkbook(registryPhase, { id: newId, name: newName, notebookId: null });
    navigate(`/project/${projectId}/${phase}?workbook=${newId}`);
  }, [projectId, navigate]);

  const handleNewPlan = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (projectId) {
      navigate(`/project/${projectId}/upload?newPlan=1`);
    }
  }, [projectId, navigate]);

  const handleShimmerEnd = useCallback((phase: Phase) => {
    setShimmeringPhases((s) => {
      const next = new Set(s);
      next.delete(phase);
      return next;
    });
  }, []);

  const handleOpenSeedDialog = useCallback(() => {
    setSeedDialogOpen(true);
  }, []);

  useProjectThemeColor();

  if (!hasActiveProject) return null;

  return (
    <>
      <div className="space-y-0.5">
        {WORKFLOW_PHASES.map((phase) => (
          <PhaseItem
            key={phase}
            phase={phase}
            collapsed={collapsed}
            projectId={projectId}
            isUnlocked={unlockedPhases.includes(phase)}
            isActive={phase === activePhase}
            isExpanded={expandedPhases.has(phase)}
            hasBeenExpanded={everExpandedRef.current.has(phase)}
            isShimmering={shimmeringPhases.has(phase)}
            onPhaseClick={handlePhaseClick}
            onToggleExpand={handleToggleExpand}
            onNewWorkbook={handleNewWorkbook}
            onNewPlan={handleNewPlan}
            onShimmerEnd={handleShimmerEnd}
            onOpenSeedDialog={handleOpenSeedDialog}
          />
        ))}
      </div>
      {projectId && (
        <SeedModelDialog
          projectId={projectId}
          open={seedDialogOpen}
          onOpenChange={setSeedDialogOpen}
        />
      )}
    </>
  );
});
