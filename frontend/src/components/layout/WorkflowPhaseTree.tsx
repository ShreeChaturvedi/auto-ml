/**
 * WorkflowPhaseTree - Sidebar phase list with expandable notebook sub-trees
 *
 * Renders flat items for non-notebook phases and expandable items
 * for preprocessing, feature-engineering, and training.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { BookOpen, ChevronDown, ChevronRight, PanelLeft } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { useSidebarNotebookTree } from '@/hooks/useSidebarNotebookTree';
import type { Phase } from '@/types/phase';
import { phaseConfig, getAllPhasesSorted } from '@/types/phase';
import type { SidebarPhaseNode } from '@/hooks/useSidebarNotebookTree';
import { projectColorClasses } from '@/types/project';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

const NOTEBOOK_PHASES = new Set<Phase>(['preprocessing', 'feature-engineering', 'training']);

interface WorkflowPhaseTreeProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function WorkflowPhaseTree({ collapsed = false, onToggleCollapse }: WorkflowPhaseTreeProps) {
  const navigate = useNavigate();
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const projects = useProjectStore((state) => state.projects);

  const activeProject = activeProjectId
    ? projects.find((p) => p.id === activeProjectId)
    : undefined;

  const unlockedPhases = activeProject?.unlockedPhases ?? [];
  const currentPhase = activeProject?.currentPhase;
  const allPhases = getAllPhasesSorted();

  const phaseNodes = useSidebarNotebookTree(activeProjectId ?? undefined);
  const [expandedPhases, setExpandedPhases] = useState<Set<Phase>>(new Set());

  const expandPhase = (phase: Phase) => {
    setExpandedPhases((prev) => {
      if (prev.has(phase)) return prev;
      const next = new Set(prev);
      next.add(phase);
      return next;
    });
  };

  // Auto-expand the current phase when it's a notebook phase
  useEffect(() => {
    if (currentPhase && NOTEBOOK_PHASES.has(currentPhase)) {
      expandPhase(currentPhase);
    }
  }, [currentPhase]);

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
      if (NOTEBOOK_PHASES.has(phase)) {
        expandPhase(phase);
      }
    }
  };

  const handleNotebookClick = (
    e: React.MouseEvent,
    phase: Phase,
    notebookId: string,
    tabId?: string
  ) => {
    e.stopPropagation();
    if (!activeProjectId) return;
    const params = new URLSearchParams();
    if (tabId) params.set('tab', tabId);
    params.set('notebook', notebookId);
    const search = params.toString();
    navigate(`/project/${activeProjectId}/${phase}${search ? `?${search}` : ''}`);
  };

  const getPhaseNode = (phase: Phase): SidebarPhaseNode | undefined => {
    return phaseNodes.find((node) => node.phase === phase);
  };

  if (!activeProject) {
    return (
      <SectionWrapper collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
        {!collapsed && (
          <div className="px-3 py-2 text-workflow text-muted-foreground">
            Select a project to view phases
          </div>
        )}
      </SectionWrapper>
    );
  }

  return (
    <SectionWrapper collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <div className="space-y-0.5">
        {allPhases.map((phase) => {
          const config = phaseConfig[phase];
          const isUnlocked = unlockedPhases.includes(phase);
          const isActive = phase === currentPhase;
          const isExpandable = NOTEBOOK_PHASES.has(phase) && isUnlocked;
          const isExpanded = expandedPhases.has(phase);
          const phaseNode = isExpandable ? getPhaseNode(phase) : undefined;
          const hasChildren = phaseNode
            ? phaseNode.tabs.length > 0 || phaseNode.notebooks.length > 0
            : false;

          const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
            config.icon
          ];

          const phaseButton = (
            <button
              onClick={(e) => handlePhaseClick(e, phase)}
              disabled={!isUnlocked}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left',
                !isUnlocked
                  ? 'text-muted-foreground/50 cursor-default'
                  : isActive
                    ? 'bg-muted font-medium'
                    : 'text-foreground hover:bg-muted cursor-pointer'
              )}
            >
              <div className="shrink-0">
                {IconComponent && (
                  <IconComponent
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      isActive && activeProject && projectColorClasses[activeProject.color]?.text
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
              {/* Expand chevron for notebook phases */}
              {isExpandable && hasChildren && !collapsed && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePhaseExpand(phase);
                  }}
                  className="shrink-0 p-0.5 rounded hover:bg-muted-foreground/10 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  )}
                </button>
              )}
            </button>
          );

          return (
            <div key={phase}>
              <TooltipProvider delayDuration={300}>
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
              </TooltipProvider>

              {/* Notebook sub-tree */}
              {isExpandable && isExpanded && !collapsed && phaseNode && (
                <div className="ml-1">
                  {/* Tabs with nested notebooks */}
                  {phaseNode.tabs.map((tab) => (
                    <div key={tab.tabId}>
                      <div className="pl-6 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate">
                        {tab.tabName}
                      </div>
                      {tab.notebooks.map((nb) => (
                        <button
                          key={nb.notebookId}
                          onClick={(e) => handleNotebookClick(e, phase, nb.notebookId, tab.tabId)}
                          className="w-full flex items-center gap-1.5 pl-10 pr-3 py-1.5 rounded-md text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors truncate"
                        >
                          <BookOpen className="h-3 w-3 shrink-0" />
                          <span className="truncate">{nb.name}</span>
                        </button>
                      ))}
                    </div>
                  ))}

                  {/* Ungrouped notebooks (training, or notebooks without tabId) */}
                  {phaseNode.notebooks.map((nb) => (
                    <button
                      key={nb.notebookId}
                      onClick={(e) => handleNotebookClick(e, phase, nb.notebookId)}
                      className="w-full flex items-center gap-1.5 pl-6 pr-3 py-1.5 rounded-md text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors truncate"
                    >
                      <BookOpen className="h-3 w-3 shrink-0" />
                      <span className="truncate">{nb.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionWrapper>
  );
}

/**
 * Section wrapper — handles the "Workflow" heading with collapse/expand
 */
function SectionWrapper({
  collapsed,
  onToggleCollapse,
  children
}: {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  children: ReactNode;
}) {
  const [sectionExpanded, setSectionExpanded] = useState(true);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 px-2 py-1">
        {collapsed ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(); }}
            className="flex items-center gap-1 hover:bg-muted/50 rounded transition-colors"
          >
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="h-6 w-6 flex items-center justify-center shrink-0">
                    <PanelLeft className="h-4 w-4" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Expand sidebar</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </button>
        ) : (
          <button
            onClick={() => setSectionExpanded(!sectionExpanded)}
            className="group flex-1 flex items-center gap-1 rounded transition-colors"
          >
            <div className="h-6 w-6 flex items-center justify-center shrink-0">
              {sectionExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              )}
            </div>
            <h2 className="text-workflow-label font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
              Workflow
            </h2>
          </button>
        )}
      </div>

      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-in-out',
          (collapsed || sectionExpanded) ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
