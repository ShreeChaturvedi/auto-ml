/**
 * SidebarSection - Shared component for sidebar sections
 * 
 * Used by both PhaseList (WORKFLOW) and ProjectList (PROJECTS)
 * Handles:
 * - Collapsed/expanded states with smooth transitions
 * - Header with chevron on left, title, optional action button
 * - Item list with consistent spacing and alignment
 */

import { useState, type ReactNode } from 'react';
import { PanelLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from '@/components/ui/tooltip';

export interface SidebarSectionItem {
    id: string;
    label: string;
    icon: ReactNode;
    onClick: (e: React.MouseEvent) => void;
    isActive?: boolean;
    isDisabled?: boolean;
}

interface SidebarSectionProps {
    title: string;
    collapsed: boolean;
    onToggleCollapse?: () => void;
    items: SidebarSectionItem[];
    /** Optional action button (e.g., + for Projects) */
    action?: ReactNode;
    /** Whether section can be collapsed via chevron (default true) */
    collapsible?: boolean;
    /** Default expanded state (default true) */
    defaultExpanded?: boolean;
    /** Empty state content */
    emptyContent?: ReactNode;
    /** Loading state */
    isLoading?: boolean;
}

export function SidebarSection({
    title,
    collapsed,
    onToggleCollapse,
    items,
    action,
    collapsible = true,
    defaultExpanded = true,
    emptyContent,
    isLoading
}: SidebarSectionProps) {
    const [sectionExpanded, setSectionExpanded] = useState(defaultExpanded);

    return (
        <div className="space-y-1">
            {/* Header - chevron on left, text shrinks when collapsed */}
            <div className="flex items-center gap-1 px-2 py-1">
                {collapsed ? (
                    // Collapsed: show expand button - same structure as expanded
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
                    // Expanded: show chevron, title, and optional action
                    <>
                        <button
                            onClick={() => collapsible && setSectionExpanded(!sectionExpanded)}
                            className={cn(
                                'group flex-1 flex items-center gap-1 rounded transition-colors'
                            )}
                        >
                            <div className="h-6 w-6 flex items-center justify-center shrink-0">
                                {collapsible && (
                                    sectionExpanded ? (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                    ) : (
                                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                    )
                                )}
                            </div>
                            <h2 className="text-workflow-label font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
                                {title}
                            </h2>
                        </button>
                        {action && <div className="shrink-0">{action}</div>}
                    </>
                )}
            </div>

            {/* Items - only visible when section expanded (or always when sidebar collapsed) */}
            {(collapsed || sectionExpanded) && (
                <div className="space-y-0.5">
                    {isLoading ? (
                        <div className={cn(
                            'flex flex-col items-center justify-center py-8 text-center text-xs text-muted-foreground',
                            collapsed && 'hidden'
                        )}>
                            Loading...
                        </div>
                    ) : items.length > 0 ? (
                        items.map((item) => {
                            const buttonContent = (
                                <button
                                    key={item.id}
                                    onClick={item.onClick}
                                    disabled={item.isDisabled}
                                    className={cn(
                                        'w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left',
                                        !item.isDisabled
                                            ? item.isActive
                                                ? 'bg-muted font-medium'
                                                : 'text-foreground hover:bg-muted cursor-pointer'
                                            : 'text-muted-foreground/50 cursor-default'
                                    )}
                                >
                                    {/* Icon */}
                                    <div className="shrink-0">{item.icon}</div>

                                    {/* Text - fades when collapsed */}
                                    <span
                                        className={cn(
                                            'flex-1 text-workflow truncate transition-opacity duration-300',
                                            collapsed && 'opacity-0'
                                        )}
                                    >
                                        {item.label}
                                    </span>
                                </button>
                            );

                            // Always use TooltipProvider wrapper for stable DOM (enables CSS transitions)
                            return (
                                <TooltipProvider key={item.id} delayDuration={300}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            {buttonContent}
                                        </TooltipTrigger>
                                        {/* Only show tooltip content when collapsed */}
                                        {collapsed && (
                                            <TooltipContent side="right">
                                                <p>{item.label}</p>
                                            </TooltipContent>
                                        )}
                                    </Tooltip>
                                </TooltipProvider>
                            );
                        })
                    ) : emptyContent && !collapsed ? (
                        emptyContent
                    ) : null}
                </div>
            )}
        </div>
    );
}
