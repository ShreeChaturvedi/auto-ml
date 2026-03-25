/**
 * ToolIndicator - Enhanced tool call indicators with ThinkingBlock-like styling
 *
 * Features:
 * - Proper tense: "Reading..." while running, "Read" when done
 * - Same visual style as ThinkingBlock (clickable rows, expandable content)
 * - Spinner replaces icon during loading
 * - Metallic shine animation on loading tools
 * - Expandable dropdowns with typed, human-friendly renderers via ToolResultRenderer
 * - No chevron - click anywhere on row to toggle
 * - Result count badge shown inline for data-returning tools
 */

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ToolCall, ToolResult } from '@/types/llmUi';
import { ToolResultRenderer, EXPANDABLE_TOOLS } from '@/components/llm/ToolResultRenderer';
import { useProjectStore } from '@/stores/projectStore';
import { projectColorClasses, type ProjectColorEntry } from '@/types/project';
import { Loader2, AlertCircle } from 'lucide-react';
import { getToolIcon, getToolLabel, getResultHint } from './ToolDisplayHelpers';

interface ToolIndicatorProps {
    toolCalls: ToolCall[];
    results: ToolResult[];
    isRunning: boolean;
}

export type ToolStatus = 'pending' | 'running' | 'done' | 'error';

interface ToolDisplay {
    call: ToolCall;
    status: ToolStatus;
    result?: ToolResult;
    label: string;
    hasDropdown: boolean;
}

const TOOL_TONE_INTERACTION_CLASSES = 'transition-opacity duration-200 motion-reduce:transition-none group-hover:opacity-100 group-focus-visible:opacity-100';
const TOOL_TONE_FADE_CLASSES = 'opacity-75';

// Single tool row component
function ToolRow({
    display,
    projectColorEntry,
    projectColorClass
}: {
    display: ToolDisplay;
    projectColorEntry?: ProjectColorEntry;
    projectColorClass?: string;
}) {
    const [expanded, setExpanded] = useState(false);
    const { call, status, result, label, hasDropdown } = display;

    const isLoading = status === 'running';
    const showDropdown = hasDropdown && result != null;
    const hint = getResultHint(call, result);

    return (
        <div className={cn('flex flex-col', expanded && 'mb-1')}>
            <button
                type="button"
                onClick={() => showDropdown && setExpanded(!expanded)}
                disabled={!showDropdown}
                className={cn(
                    'group flex items-center gap-2 text-sm transition-colors duration-200 motion-reduce:transition-none',
                    'py-1.5 px-2.5 rounded-md w-full text-left',
                    showDropdown && 'hover:bg-muted/60 cursor-pointer',
                    !showDropdown && 'cursor-default'
                )}
            >
                {/* Icon or spinner */}
                {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-muted-foreground" />
                ) : status === 'error' ? (
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-destructive" />
                ) : (
                    getToolIcon(call.tool, status, projectColorClass)
                )}

                {/* Label with shimmer effect when loading */}
                <span
                    className={cn(
                        'min-w-0 flex-1',
                        isLoading && 'shimmer-text',
                        status === 'error' && 'text-destructive',
                        (status === 'pending' || status === 'running') && 'text-muted-foreground',
                        status === 'done' && [
                            'text-foreground',
                            TOOL_TONE_FADE_CLASSES,
                            TOOL_TONE_INTERACTION_CLASSES
                        ]
                    )}
                >
                    {label}
                </span>

                {/* Inline result count hint */}
                {hint && status === 'done' && (
                    <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums flex-shrink-0">
                        {hint}
                    </span>
                )}

                {/* Error message inline */}
                {status === 'error' && result?.error && (
                    <span className="text-[10px] text-destructive/70 truncate max-w-[150px]">
                        {result.error}
                    </span>
                )}
            </button>

            {/* Expandable content — rendered by ToolResultRenderer */}
            {expanded && showDropdown && (
                <div className="ml-6 mt-1.5 p-3 bg-muted/30 rounded-md border border-muted/50 max-h-[300px] overflow-y-auto">
                    <ToolResultRenderer call={call} result={result!} projectColorEntry={projectColorEntry} />
                </div>
            )}
        </div>
    );
}

export function ToolIndicator({
    toolCalls,
    results,
    isRunning,
}: ToolIndicatorProps) {
    // Get project theme color
    const { activeProjectId, projects } = useProjectStore();
    const activeProject = projects.find((project) => project.id === activeProjectId);
    const projectColorEntry = activeProject
        ? projectColorClasses[activeProject.color]
        : undefined;
    const projectColorClass = projectColorEntry?.text;

    const displayItems = useMemo<ToolDisplay[]>(() => {
        return toolCalls.map((call) => {
            const result = results.find((r) => r.id === call.id);
            let status: ToolStatus = 'pending';

            if (result) {
                status = result.error ? 'error' : 'done';
            } else if (isRunning) {
                status = 'running';
            }

            return {
                call,
                status,
                result,
                label: getToolLabel(call, status),
                hasDropdown: EXPANDABLE_TOOLS.has(call.tool)
            };
        });
    }, [toolCalls, results, isRunning]);

    if (displayItems.length === 0) return null;

    return (
        <div className="space-y-1 max-w-2xl">
            {displayItems.map((display) => (
                <ToolRow
                    key={display.call.id}
                    display={display}
                    projectColorEntry={projectColorEntry}
                    projectColorClass={projectColorClass}
                />
            ))}
        </div>
    );
}
