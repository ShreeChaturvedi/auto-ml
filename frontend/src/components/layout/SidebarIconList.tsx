/**
 * SidebarIconList - Shared component for icon-only sidebar lists
 *
 * CRITICAL: Icons are LEFT-ALIGNED with px-3 to match expanded state exactly
 * This ensures icons don't move when collapsing/expanding
 */

import { PanelLeft } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from '@/components/ui/tooltip';

interface IconItem {
    id: string;
    icon: string;
    label: string;
    colorBg?: string;
    colorText?: string;
    isActive?: boolean;
    isDisabled?: boolean;
    onClick: (e: React.MouseEvent) => void;
}

interface SidebarIconListProps {
    items: IconItem[];
    onToggleCollapse?: () => void;
}

export function SidebarIconList({ items, onToggleCollapse }: SidebarIconListProps) {
    return (
        <div className="space-y-0.5">
            {/* Collapse button - LEFT aligned with px-3 to match expanded text heading */}
            <div className="px-2 py-1">
                <TooltipProvider delayDuration={300}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(); }}
                                className="h-6 w-6"
                            >
                                <PanelLeft className="h-3.5 w-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                            <p>Expand sidebar</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>

            {/* Items - LEFT aligned with px-3 py-2 to match FileItem exactly */}
            <TooltipProvider delayDuration={300}>
                {items.map((item) => {
                    const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
                        item.icon
                    ];

                    return (
                        <Tooltip key={item.id}>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={item.onClick}
                                    disabled={item.isDisabled}
                                    className={cn(
                                        'flex items-center px-3 py-2 rounded-lg transition-colors',
                                        item.colorBg ?? (
                                            item.isActive
                                                ? 'bg-muted text-foreground'
                                                : item.isDisabled
                                                    ? 'text-muted-foreground/50 cursor-default'
                                                    : 'text-foreground hover:bg-muted cursor-pointer'
                                        )
                                    )}
                                >
                                    {IconComponent && (
                                        <IconComponent
                                            className={cn('h-3.5 w-3.5', item.colorText)}
                                        />
                                    )}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                                <p>{item.label}</p>
                            </TooltipContent>
                        </Tooltip>
                    );
                })}
            </TooltipProvider>
        </div>
    );
}
