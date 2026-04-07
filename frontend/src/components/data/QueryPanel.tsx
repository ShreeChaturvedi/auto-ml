/**
 * QueryPanel - Query input interface with dual-mode support
 *
 * Features:
 * - Mode toggle: English <-> SQL (using ToggleGroup)
 * - Separate state for English and SQL inputs
 * - SQL syntax highlighting (Monaco Editor) with theme detection
 * - Default SQL template
 * - Execute button
 *
 * Design decisions documented in:
 * docs/design-system.md
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, Code2, PanelRight, CornerDownRight, Play, Pencil } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { useProjectStore } from '@/stores/projectStore';
import { useNlSuggestionStore } from '@/stores/nlSuggestionStore';
import { IconModeToggle } from './IconModeToggle';
import { NlQueryWorkflow } from './NlQueryWorkflow';
import type { NlQueryWorkflowHandle, NlPhase, ApproveThemeClasses } from './NlQueryWorkflow';
import type { QueryMode } from '@/types/file';
import type { NlGenerationResult, NlQueryStreamEvent } from '@/types/nlQuery';
import { QuerySqlEditor } from './QuerySqlEditor';
import { AnimatedExecuteIcon, AnimatedBrainIcon } from './AnimatedQueryIcons';
import { useQueryExecution } from './useQueryExecution';
import { ContextualTipBar, Kbd, type ContextualTip } from '@/components/ui/contextual-tip-bar';

/** Accent-token-based approve theme — uses CSS-variable-driven accent classes. */
const ACCENT_APPROVE_THEME: ApproveThemeClasses = {
  hoverText: 'hover:text-accent-text',
  hoverBorder: 'hover:border-accent-border',
  hoverBg: 'hover:bg-accent-bg',
};


interface QueryPanelProps {
  projectId?: string | null;
  onExecute: (query: string, mode: QueryMode) => void;
  isExecuting?: boolean;
  className?: string;
  /** Table names available for autocomplete suggestions */
  tableNames?: string[];
  /** Column names for autocomplete, keyed by table name */
  columnsByTable?: Record<string, string[]>;
  /** Whether the panel is collapsed */
  collapsed?: boolean;
  /** Callback when collapse state changes */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Current query mode (english/sql) - managed by parent */
  mode?: QueryMode;
  /** Callback when mode changes */
  onModeChange?: (mode: QueryMode) => void;
  /** Ref to the controls portal target element */
  controlsPortalTarget?: HTMLElement | null;
  /** Callback when the portal target element is mounted */
  onMountPortalTarget?: (target: HTMLElement | null) => void;
  /** Whether the panel is actively expanding in width */
  isExpanding?: boolean;
  /**
   * Async callback to generate SQL from a natural-language query.
   * Required when English mode is active with the NL workflow UI.
   */
  onNlGenerate?: (
    query: string,
    onStreamEvent?: (event: NlQueryStreamEvent) => void,
    signal?: AbortSignal
  ) => Promise<NlGenerationResult>;
  /**
   * Called when the user approves the generated (and possibly edited) SQL.
   * The parent is responsible for executing the SQL and creating an artifact.
   */
  onNlApprove?: (result: NlGenerationResult, approvedSql: string) => void;
  /**
   * When set, the SQL editor is populated with this value.
   * The token field ensures repeated suggestions of the same SQL still trigger.
   */
  suggestedSql?: { sql: string; token: number } | null;
}

export function QueryPanel({
  projectId,
  onExecute,
  isExecuting = false,
  className,
  tableNames = [],
  columnsByTable = {},
  collapsed = false,
  onCollapsedChange,
  mode: externalMode,
  onModeChange,
  controlsPortalTarget,
  onMountPortalTarget,
  isExpanding = false,
  onNlGenerate,
  onNlApprove,
  suggestedSql,
}: QueryPanelProps) {
  const {
    mode,
    sqlQuery,
    setSqlQuery,
    englishQuery,
    handleModeChange,
    handleQueryChange,
    handleExecute
  } = useQueryExecution({ onExecute, externalMode, onModeChange });

  // Apply externally-suggested SQL when it changes (token ensures re-triggers)
  useEffect(() => {
    if (suggestedSql) {
      setSqlQuery(suggestedSql.sql);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to suggestedSql changes
  }, [suggestedSql]);

  // NL workflow ref & phase — phase is a local mirror updated via onPhaseChange
  // so footer buttons re-render reactively without holding workflow state here.
  const nlWorkflowRef = useRef<NlQueryWorkflowHandle>(null);
  const [nlPhase, setNlPhase] = useState<NlPhase>('idle');

  // Ref for the controls portal target div
  const controlsMountRef = useRef<HTMLDivElement>(null);

  // Keep portal target stable so tab controls don't remount/fallback while collapsing.
  useEffect(() => {
    if (!onMountPortalTarget) {
      return;
    }

    if (controlsMountRef.current && controlsMountRef.current !== controlsPortalTarget) {
      onMountPortalTarget(controlsMountRef.current);
    }
  }, [onMountPortalTarget, controlsPortalTarget]);

  const { syntaxThemeId } = useProjectThemeColor();
  const { activeProjectId, projects } = useProjectStore();
  const resolvedProjectId = projectId ?? activeProjectId;
  const activeProject = useMemo(
    () => projects.find((p) => p.id === resolvedProjectId),
    [projects, resolvedProjectId]
  );
  const projectSuggestionEntry = useNlSuggestionStore((state) => (
    resolvedProjectId ? state.byProject[resolvedProjectId] : undefined
  ));
  const fetchProjectSuggestions = useNlSuggestionStore((state) => state.fetchProjectSuggestions);
  const executeIconColorClass = activeProject ? 'text-accent-text' : 'text-primary';
  const approveThemeClasses = activeProject ? ACCENT_APPROVE_THEME : undefined;

  useEffect(() => {
    if (!resolvedProjectId) {
      return;
    }

    void fetchProjectSuggestions(resolvedProjectId);
  }, [fetchProjectSuggestions, resolvedProjectId]);

  const showExpandedContent = !collapsed;

  // Detect if user is on Mac for keyboard shortcut display
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const modKey = isMac ? '⌘' : '⌃';
  const handleExpandFromCollapsed = useCallback(() => {
    onCollapsedChange?.(false);
  }, [onCollapsedChange]);

  const isNlGenerating = nlPhase === 'submitting' || nlPhase === 'revealing';

  const nlTips: ContextualTip[] = useMemo(() => [
    { id: 'nl-tab', icon: CornerDownRight, content: <><Kbd>Tab</Kbd> to accept the suggested query</> },
    { id: 'nl-run', icon: Play, content: <><Kbd>{modKey}</Kbd>+<Kbd>Enter</Kbd> to generate SQL</> },
    { id: 'nl-edit', icon: Pencil, content: 'You can edit the generated SQL before running' },
  ], [modKey]);

  const renderExecuteButton = () => {
    // During NL reviewing phase, approve/reject controls are inline — hide ribbon button
    if (mode === 'english' && nlPhase === 'reviewing') return null;

    const isSql = mode === 'sql';
    const disabled = isSql
      ? isExecuting || !sqlQuery.trim()
      : isNlGenerating || !englishQuery.trim();
    const onClick = isSql
      ? handleExecute
      : () => nlWorkflowRef.current?.triggerGenerate();
    const tooltipText = 'Process query';

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClick}
            disabled={disabled}
            className="group/execute h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            {isSql ? (
              <AnimatedExecuteIcon isExecuting={isExecuting} colorClassName={executeIconColorClass} />
            ) : isNlGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <AnimatedBrainIcon colorClassName={executeIconColorClass} />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltipText}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className={cn('relative flex flex-col h-full bg-card border-l', className)}>
      {/* Unified Header — collapse button stays at the right edge */}
      <div className="relative flex items-center h-14 px-3 border-b border-border bg-card shrink-0 overflow-hidden">
        <TooltipProvider delayDuration={300}>
          <div
            className={cn(
              'flex items-center gap-2 flex-1 min-w-0 pr-9 transition-opacity ease-out',
              showExpandedContent
                ? 'opacity-100 duration-200 delay-150'
                : 'opacity-0 pointer-events-none duration-100 delay-0'
            )}
          >
            <IconModeToggle
              value={mode}
              onValueChange={(val) => {
                if (val === 'sql' || val === 'english') {
                  handleModeChange(val);
                }
              }}
              options={[
                {
                  value: 'english',
                  ariaLabel: 'Natural language mode',
                  icon: MessageSquare,
                  tooltip: 'English',
                },
                {
                  value: 'sql',
                  ariaLabel: 'SQL mode',
                  icon: Code2,
                  tooltip: 'SQL',
                },
              ]}
            />

            <div ref={controlsMountRef} className="relative flex h-7 flex-1 min-w-0 items-center" />

            {renderExecuteButton()}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onCollapsedChange?.(!collapsed)}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <PanelRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {collapsed ? 'Expand query panel' : 'Collapse query panel'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Collapsed body - always in DOM, fades via opacity to prevent layout jump */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleExpandFromCollapsed}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleExpandFromCollapsed();
          }
        }}
        className={cn(
          'absolute inset-x-0 bottom-0 top-14 z-10 flex flex-col items-center py-4 cursor-[w-resize] hover:bg-muted/50 transition-opacity duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          collapsed ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-muted-foreground [writing-mode:vertical-lr] rotate-180 select-none">
            Query Builder
          </span>
        </div>
      </div>

      {/* Query Input + Execute (kept mounted for smooth expand/collapse) */}
      <div
        className={cn(
          'flex flex-1 min-h-0 flex-col transition-opacity duration-150 ease-out',
          showExpandedContent
            ? 'opacity-100'
            : 'pointer-events-none opacity-0 select-none'
        )}
      >
        {mode === 'sql' ? (
          <QuerySqlEditor
            sqlQuery={sqlQuery}
            onQueryChange={handleQueryChange}
            onExecute={handleExecute}
            isExecuting={isExecuting}
            monacoTheme={syntaxThemeId}
            tableNames={tableNames}
            columnsByTable={columnsByTable}
            collapsed={collapsed}
            isExpanding={isExpanding}
            modKey={modKey}
            projectId={resolvedProjectId}
          />
        ) : (
          <>
            <NlQueryWorkflow
              suggestions={projectSuggestionEntry?.suggestions ?? []}
              englishQuery={englishQuery}
              onQueryChange={handleQueryChange}
              onGenerate={onNlGenerate ?? (() => Promise.reject(new Error('onNlGenerate not provided')))}
              onApprove={onNlApprove ?? (() => {})}
              isExpanding={isExpanding}
              onPhaseChange={setNlPhase}
              approveThemeClasses={approveThemeClasses}
              connectorColorClassName={executeIconColorClass}
              ref={nlWorkflowRef}
            />
            {nlPhase === 'idle' && <ContextualTipBar tips={nlTips} />}
          </>
        )}
      </div>
    </div>
  );
}
