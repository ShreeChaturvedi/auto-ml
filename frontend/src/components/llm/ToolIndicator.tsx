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

import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { ToolCall, ToolResult } from '@/types/llmUi';
import { ToolResultRenderer, EXPANDABLE_TOOLS } from '@/components/llm/ToolResultRenderer';
import { SimpleToolContent } from '@/components/llm/shared/SimpleToolContent';
import { useProjectStore } from '@/stores/projectStore';
import { Loader2, AlertCircle } from 'lucide-react';
import { getToolIcon, getToolLabel, getResultHint } from './ToolDisplayHelpers';

interface ToolIndicatorProps {
    toolCalls: ToolCall[];
    results: ToolResult[];
    isRunning: boolean;
    defaultCollapsed?: boolean;
}

export type ToolStatus = 'pending' | 'running' | 'done' | 'error';

interface ToolDisplay {
    call: ToolCall;
    status: ToolStatus;
    result?: ToolResult;
    // ReactNode so dataset tool labels can inline a real file-type icon
    // alongside the filename (see `datasetLabelWithFile`).
    label: ReactNode;
    hasDropdown: boolean;
}

const TOOL_TONE_INTERACTION_CLASSES = 'transition-opacity duration-200 motion-reduce:transition-none group-hover:opacity-100 group-focus-visible:opacity-100';
const TOOL_TONE_FADE_CLASSES = 'opacity-75';

// Single tool row component
function ToolRow({
    display,
    projectColorClass
}: {
    display: ToolDisplay;
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
                    'group flex items-center gap-2 text-sm transition-[color,background-color] duration-200 motion-reduce:transition-none',
                    'py-1.5 px-2.5 rounded-md w-full text-left',
                    showDropdown && 'hover:bg-muted/60 cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-1 focus-visible:outline-none',
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
                <SimpleToolContent maxHeight={300}>
                    <ToolResultRenderer call={call} result={result!} />
                </SimpleToolContent>
            )}
        </div>
    );
}

export function ToolIndicator({
    toolCalls,
    results,
    isRunning,
    defaultCollapsed = false,
}: ToolIndicatorProps) {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);

    // Get project theme color
    const { activeProjectId, projects } = useProjectStore();
    const activeProject = projects.find((project) => project.id === activeProjectId);
    const projectColorClass = activeProject ? 'text-accent-text' : undefined;

    const displayItems = useMemo<ToolDisplay[]>(() => {
        // Pre-index results by call id so the per-row lookup is O(1).
        const byId = new Map<string, ToolResult>();
        for (const r of results) byId.set(r.id, r);

        return toolCalls.map((call) => {
            const result = byId.get(call.id);
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
                label: getToolLabel(call, status, result),
                hasDropdown: EXPANDABLE_TOOLS.has(call.tool)
            };
        });
    }, [toolCalls, results, isRunning]);

    if (displayItems.length === 0) return null;

    if (collapsed) {
        const doneCount = displayItems.filter(d => d.status === 'done').length;
        const label = displayItems.length === 1
            ? displayItems[0].label
            : `${displayItems.length} tool calls`;
        return (
            <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
                <span className="opacity-60">▸</span>
                <span>{label}</span>
                {doneCount === displayItems.length && (
                    <span className="text-[10px] opacity-50">✓</span>
                )}
            </button>
        );
    }

    return (
        <div className="space-y-1 max-w-2xl">
            {displayItems.map((display) => (
                <ToolRow
                    key={display.call.id}
                    display={display}
                    projectColorClass={projectColorClass}
                />
            ))}
        </div>
    );
}
