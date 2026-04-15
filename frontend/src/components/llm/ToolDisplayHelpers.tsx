/**
 * ToolDisplayHelpers - Per-tool-type icon, label, and result-hint helpers
 *
 * Extracted from ToolIndicator.tsx to keep that file focused on layout/state.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { resolveFileIconByFilename } from '@/lib/fileUtils';
import type { ToolCall, ToolResult } from '@/types/llmUi';
import type { ToolStatus } from './ToolIndicator';
import {
    Globe,
    Eye,
    FolderOpen,
    Database,
    FileCode,
    List,
    FileEdit,
    Play,
    SquareCode,
    Pencil,
    Package,
    Trash2,
    ArrowUpDown,
    Plus
} from 'lucide-react';

const TOOL_TONE_INTERACTION_CLASSES = 'transition-opacity duration-200 motion-reduce:transition-none group-hover:opacity-100 group-focus-visible:opacity-100';
const TOOL_TONE_FADE_CLASSES = 'opacity-75';

/** Get the static icon for a tool (shown when done/pending) */
export function getToolIcon(tool: ToolCall['tool'], status: ToolStatus, projectColorClass?: string) {
    const iconClass = cn(
        'h-3.5 w-3.5 flex-shrink-0',
        status === 'done' && [
            projectColorClass ?? 'text-muted-foreground',
            TOOL_TONE_FADE_CLASSES,
            TOOL_TONE_INTERACTION_CLASSES
        ],
        status === 'error' && 'text-destructive',
        (status === 'pending' || status === 'running') && 'text-muted-foreground'
    );

    switch (tool) {
        case 'search_documents':
            return <Globe className={iconClass} />;
        case 'list_project_files':
        case 'list_project_datasets':
            return <FolderOpen className={iconClass} />;
        case 'set_active_dataset':
        case 'checkpoint_dataset':
        case 'register_derived_dataset':
            return <Database className={iconClass} />;
        case 'get_dataset_profile':
        case 'get_dataset_sample':
        case 'validate_step_result':
            return <Eye className={iconClass} />;
        case 'execute_transformation_step':
        case 'list_cells':
            return tool === 'list_cells' ? <List className={iconClass} /> : <Play className={iconClass} />;
        case 'read_cell':
            return <FileCode className={iconClass} />;
        case 'write_cell':
            return <SquareCode className={iconClass} />;
        case 'edit_cell':
            return <Pencil className={iconClass} />;
        case 'run_cell':
            return <Play className={iconClass} />;
        case 'install_package':
        case 'uninstall_package':
        case 'list_packages':
            return <Package className={iconClass} />;
        case 'delete_cell':
            return <Trash2 className={iconClass} />;
        case 'reorder_cells':
            return <ArrowUpDown className={iconClass} />;
        case 'insert_cell':
            return <Plus className={iconClass} />;
        default:
            return <FileEdit className={iconClass} />;
    }
}

/**
 * Renders a dataset-tool label with the file icon + filename inlined after
 * the base text ("Read dataset profile for <icon> <name>"). Falls back to a
 * plain string if `filename` is missing.
 */
function datasetLabelWithFile(baseLabel: string, filename: string | undefined): ReactNode {
    if (!filename) return baseLabel;
    const { Icon, colorClass } = resolveFileIconByFilename(filename);
    return (
        <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className="flex-shrink-0">{baseLabel} for</span>
            <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', colorClass)} />
            <span className="truncate font-medium">{filename}</span>
        </span>
    );
}

/** Get proper tense labels */
export function getToolLabel(call: ToolCall, status: ToolStatus, result?: ToolResult): ReactNode {
    const args = call.args ?? {};
    const isDone = status === 'done' || status === 'error';
    const outputRecord = (result?.output ?? null) as Record<string, unknown> | null;
    const outputFilename =
        outputRecord && typeof outputRecord === 'object' && typeof outputRecord.filename === 'string'
            ? (outputRecord.filename as string)
            : undefined;

    switch (call.tool) {
        case 'search_documents': {
            const query = typeof args.query === 'string' ? args.query : 'documents';
            const truncatedQuery = query.length > 30 ? `${query.slice(0, 30)}…` : query;
            return isDone ? `Searched "${truncatedQuery}"` : `Searching "${truncatedQuery}"`;
        }
        case 'list_project_files':
            return isDone ? 'Explored workspace' : 'Exploring workspace';
        case 'list_project_datasets':
            return isDone ? 'Listed project datasets' : 'Listing project datasets';
        case 'set_active_dataset':
            return isDone ? 'Selected active dataset' : 'Selecting active dataset';
        case 'checkpoint_dataset':
            return isDone ? 'Created dataset checkpoint' : 'Creating dataset checkpoint';
        case 'register_derived_dataset':
            return isDone ? 'Registered derived dataset' : 'Registering derived dataset';
        case 'get_dataset_profile':
            return isDone
                ? datasetLabelWithFile('Read dataset profile', outputFilename)
                : 'Reading dataset profile';
        case 'get_dataset_sample':
            return isDone
                ? datasetLabelWithFile('Read dataset sample', outputFilename)
                : 'Reading dataset sample';
        case 'propose_transformation_step': {
            const title = typeof args.title === 'string'
                ? args.title
                : typeof args.intentType === 'string'
                    ? args.intentType
                    : 'transformation step';
            return isDone ? `Proposed ${title}` : `Proposing ${title}`;
        }
        case 'materialize_step_code': {
            const stepId = typeof args.stepId === 'string' ? args.stepId : 'step';
            return isDone ? `Prepared code for ${stepId}` : `Preparing code for ${stepId}`;
        }
        case 'execute_transformation_step': {
            const stepId = typeof args.stepId === 'string' ? args.stepId : 'step';
            return isDone ? `Executed ${stepId}` : `Executing ${stepId}`;
        }
        case 'validate_step_result': {
            const stepId = typeof args.stepId === 'string' ? args.stepId : 'step';
            return isDone ? `Validated ${stepId}` : `Validating ${stepId}`;
        }
        case 'commit_transformation_step': {
            const stepId = typeof args.stepId === 'string' ? args.stepId : 'step';
            return isDone ? `Committed ${stepId}` : `Committing ${stepId}`;
        }
        case 'list_cells':
            return isDone ? 'Listed cells' : 'Listing cells';
        case 'read_cell':
            return isDone ? 'Read cell' : 'Reading cell';
        case 'write_cell':
            return isDone ? 'Wrote cell' : 'Writing cell';
        case 'edit_cell': {
            const startLine = typeof args.startLine === 'number' ? args.startLine : undefined;
            const endLine = typeof args.endLine === 'number' ? args.endLine : startLine;
            if (startLine == null) {
                return isDone ? 'Edited cell' : 'Editing cell';
            }
            if (endLine == null || endLine === startLine) {
                return isDone ? `Edited line ${startLine}` : `Editing line ${startLine}`;
            }
            return isDone ? `Edited lines ${startLine}–${endLine}` : `Editing lines ${startLine}–${endLine}`;
        }
        case 'run_cell':
            return isDone ? 'Ran cell' : 'Running cell';
        case 'install_package': {
            const pkg = typeof args.packageName === 'string' ? args.packageName : 'package';
            return isDone ? `Installed ${pkg}` : `Installing ${pkg}`;
        }
        case 'uninstall_package': {
            const pkg = typeof args.packageName === 'string' ? args.packageName : 'package';
            return isDone ? `Uninstalled ${pkg}` : `Uninstalling ${pkg}`;
        }
        case 'list_packages':
            return isDone ? 'Listed packages' : 'Listing packages';
        case 'delete_cell':
            return isDone ? 'Deleted cell' : 'Deleting cell';
        case 'reorder_cells':
            return isDone ? 'Reordered cells' : 'Reordering cells';
        case 'insert_cell':
            return isDone ? 'Inserted cell' : 'Inserting cell';
        default:
            return call.tool;
    }
}

/** Produce a tiny inline count hint for the result (e.g. "3 results") */
export function getResultHint(call: ToolCall, result?: ToolResult): string | null {
    if (!result?.output || result.error) return null;
    const out = result.output;

    switch (call.tool) {
        case 'search_documents': {
            const items = Array.isArray(out)
                ? out
                : Array.isArray((out as { items?: unknown }).items)
                    ? (out as { items: unknown[] }).items
                    : null;
            if (items) return `${items.length} hit${items.length !== 1 ? 's' : ''}`;
            return null;
        }
        case 'get_dataset_profile': {
            const cols = (out as { nCols?: number }).nCols;
            const rows = (out as { nRows?: number }).nRows;
            if (cols != null && rows != null) return `${rows.toLocaleString()}×${cols}`;
            return null;
        }
        case 'get_dataset_sample': {
            const sample = (out as { sample?: unknown[] }).sample;
            if (Array.isArray(sample)) return `${sample.length} row${sample.length !== 1 ? 's' : ''}`;
            return null;
        }
        case 'list_project_files': {
            const ds = (out as { datasets?: unknown[] }).datasets?.length ?? 0;
            const docs = (out as { documents?: unknown[] }).documents?.length ?? 0;
            return `${ds + docs} file${ds + docs !== 1 ? 's' : ''}`;
        }
        case 'list_project_datasets': {
            const datasets = (out as { datasets?: unknown[] }).datasets;
            if (Array.isArray(datasets)) return `${datasets.length} dataset${datasets.length !== 1 ? 's' : ''}`;
            return null;
        }
        case 'validate_step_result': {
            const status = (out as { status?: string }).status;
            return typeof status === 'string' ? status : null;
        }
        case 'list_cells': {
            const cells = (out as { cells?: unknown[] }).cells;
            if (Array.isArray(cells)) return `${cells.length} cell${cells.length !== 1 ? 's' : ''}`;
            return null;
        }
        default:
            return null;
    }
}
