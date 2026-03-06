/**
 * ToolResultRenderer - Human-friendly renderers for tool call outputs
 *
 * Replaces raw JSON dumps with clean, typed UI cards for each tool:
 * - search_documents  → ranked result cards with filename, score bar, snippet
 * - get_dataset_profile → column stats table with type badges
 * - get_dataset_sample → compact data preview table
 * - list_project_files → file tree with dataset/document grouping
 * - edit_cell → git-style inline diff
 * - list_cells → compact cell list
 *
 * Falls back to a formatted JSON block for any unrecognised output shape.
 * Does NOT render output cards for write_cell, run_cell, insert_cell
 * (those are visible in the notebook already).
 */

import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ToolCall, ToolResult } from '@/types/llmUi';
import {
  FileText,
  Database,
  Hash,
  Calendar,
  Type,
  ToggleLeft,
  Rows3,
  Columns3,
  FileCode,
  File
} from 'lucide-react';

// ─── Shared helpers ────────────────────────────────────────────

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(2);
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Score as a 0–1 float → percentage */
function scorePercent(score: number): number {
  return Math.round(Math.min(1, Math.max(0, score)) * 100);
}

/** Colour stop based on relevance score */
function scoreColor(score: number): string {
  if (score >= 0.7) return 'bg-emerald-500';
  if (score >= 0.4) return 'bg-amber-500';
  return 'bg-rose-400';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Map dtype strings to a short badge label + icon hint */
function dtypeInfo(dtype: string): { label: string; icon: ReactNode } {
  const d = dtype.toLowerCase();
  if (d.includes('int') || d.includes('float') || d.includes('numeric') || d.includes('double'))
    return { label: 'numeric', icon: <Hash className="h-3 w-3" /> };
  if (d.includes('date') || d.includes('time'))
    return { label: 'datetime', icon: <Calendar className="h-3 w-3" /> };
  if (d.includes('bool'))
    return { label: 'boolean', icon: <ToggleLeft className="h-3 w-3" /> };
  return { label: 'text', icon: <Type className="h-3 w-3" /> };
}

// ─── search_documents ──────────────────────────────────────────

interface SearchHit {
  chunkId?: string;
  documentId?: string;
  filename?: string;
  score?: number;
  snippet?: string;
  span?: { start: number; end: number };
}

function SearchDocumentsResult({ items }: { items: SearchHit[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No matching documents found.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground font-medium">
        {items.length} result{items.length !== 1 ? 's' : ''}
      </p>
      {items.map((hit, i) => {
        const pct = scorePercent(hit.score ?? 0);
        return (
          <div
            key={hit.chunkId ?? i}
            className="rounded-md border border-border/60 bg-card/50 p-2.5 space-y-1.5"
          >
            {/* Header row: filename + score */}
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground truncate">
                <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                {hit.filename ?? 'unknown'}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] font-mono tabular-nums px-1.5 py-0',
                  pct >= 70 && 'border-emerald-500/40 text-emerald-600',
                  pct >= 40 && pct < 70 && 'border-amber-500/40 text-amber-600',
                  pct < 40 && 'border-rose-400/40 text-rose-500'
                )}
              >
                {pct}%
              </Badge>
            </div>

            {/* Score bar */}
            <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', scoreColor(hit.score ?? 0))}
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Snippet */}
            {hit.snippet && (
              <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
                {hit.snippet}
              </p>
            )}

            {/* Span info */}
            {hit.span && (hit.span.start !== 0 || hit.span.end !== 0) && (
              <p className="text-[10px] font-mono text-muted-foreground/60">
                chars {hit.span.start}–{hit.span.end}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── get_dataset_profile ───────────────────────────────────────

interface ProfileColumn {
  name: string;
  dtype: string;
  nullCount: number;
  uniqueCount?: number;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  stdDev?: number;
}

interface DatasetProfileOutput {
  datasetId?: string;
  filename?: string;
  fileType?: string;
  nRows?: number;
  nCols?: number;
  columns?: ProfileColumn[];
  size?: number;
}

function DatasetProfileResult({ data }: { data: DatasetProfileOutput }) {
  const columns = data.columns ?? [];
  return (
    <div className="space-y-3">
      {/* Summary badges */}
      <div className="flex flex-wrap gap-1.5">
        {data.filename && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <File className="h-3 w-3" />
            {data.filename}
          </Badge>
        )}
        {data.nRows != null && (
          <Badge variant="outline" className="text-[10px] gap-1 font-mono tabular-nums">
            <Rows3 className="h-3 w-3" />
            {data.nRows.toLocaleString()} rows
          </Badge>
        )}
        {data.nCols != null && (
          <Badge variant="outline" className="text-[10px] gap-1 font-mono tabular-nums">
            <Columns3 className="h-3 w-3" />
            {data.nCols} cols
          </Badge>
        )}
        {data.fileType && (
          <Badge variant="outline" className="text-[10px] uppercase font-mono">
            {data.fileType}
          </Badge>
        )}
      </div>

      {/* Column stats table */}
      {columns.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border/40 text-muted-foreground">
                <th className="text-left py-1 pr-3 font-medium">Column</th>
                <th className="text-left py-1 pr-3 font-medium">Type</th>
                <th className="text-right py-1 pr-3 font-medium">Nulls</th>
                <th className="text-right py-1 pr-3 font-medium">Unique</th>
                <th className="text-right py-1 pr-3 font-medium">Min</th>
                <th className="text-right py-1 pr-3 font-medium">Max</th>
                <th className="text-right py-1 font-medium">Mean</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col) => {
                const info = dtypeInfo(col.dtype);
                return (
                  <tr key={col.name} className="border-b border-border/20 last:border-0">
                    <td className="py-1 pr-3 font-mono text-foreground whitespace-nowrap">
                      {truncate(col.name, 24)}
                    </td>
                    <td className="py-1 pr-3">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        {info.icon}
                        {info.label}
                      </span>
                    </td>
                    <td className={cn(
                      'py-1 pr-3 text-right font-mono tabular-nums',
                      col.nullCount > 0 ? 'text-amber-600' : 'text-muted-foreground'
                    )}>
                      {col.nullCount.toLocaleString()}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums text-muted-foreground">
                      {col.uniqueCount != null ? col.uniqueCount.toLocaleString() : '–'}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums text-muted-foreground">
                      {col.min != null ? formatNumber(col.min) : '–'}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums text-muted-foreground">
                      {col.max != null ? formatNumber(col.max) : '–'}
                    </td>
                    <td className="py-1 text-right font-mono tabular-nums text-muted-foreground">
                      {col.mean != null ? formatNumber(col.mean) : '–'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── get_dataset_sample ────────────────────────────────────────

interface DatasetSampleOutput {
  datasetId?: string;
  filename?: string;
  sample?: Record<string, unknown>[];
}

function DatasetSampleResult({ data }: { data: DatasetSampleOutput }) {
  const sample = data.sample ?? [];
  if (sample.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No sample rows available.</p>;
  }

  const columnNames = Object.keys(sample[0]);
  const displayCols = columnNames.slice(0, 8);
  const hasMoreCols = columnNames.length > 8;

  return (
    <div className="space-y-2">
      {data.filename && (
        <p className="text-[11px] text-muted-foreground">
          Sample from <span className="font-medium text-foreground">{data.filename}</span>
          {' · '}{sample.length} row{sample.length !== 1 ? 's' : ''}
          {hasMoreCols && ` · showing ${displayCols.length} of ${columnNames.length} columns`}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-border/40 text-muted-foreground">
              {displayCols.map((col) => (
                <th key={col} className="text-left py-1 pr-2 font-medium font-mono whitespace-nowrap">
                  {truncate(col, 16)}
                </th>
              ))}
              {hasMoreCols && <th className="text-left py-1 font-medium text-muted-foreground/50">…</th>}
            </tr>
          </thead>
          <tbody>
            {sample.slice(0, 5).map((row, i) => (
              <tr key={i} className="border-b border-border/20 last:border-0">
                {displayCols.map((col) => (
                  <td key={col} className="py-1 pr-2 font-mono text-muted-foreground whitespace-nowrap max-w-[120px] truncate">
                    {row[col] == null ? <span className="text-muted-foreground/40 italic">null</span> : String(row[col])}
                  </td>
                ))}
                {hasMoreCols && <td className="py-1 text-muted-foreground/50">…</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── list_project_files ────────────────────────────────────────

interface ProjectFile {
  datasetId?: string;
  documentId?: string;
  filename: string;
  nRows?: number;
  nCols?: number;
  columns?: string[];
  mimeType?: string;
}

interface ProjectFilesOutput {
  datasets?: ProjectFile[];
  documents?: ProjectFile[];
}

function ProjectFilesResult({ data }: { data: ProjectFilesOutput }) {
  const datasets = data.datasets ?? [];
  const documents = data.documents ?? [];
  const total = datasets.length + documents.length;

  if (total === 0) {
    return <p className="text-xs text-muted-foreground italic">No files in project.</p>;
  }

  return (
    <div className="space-y-2">
      {datasets.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Datasets
          </p>
          {datasets.map((ds, i) => (
            <div
              key={ds.datasetId ?? i}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-card/40 border border-border/30"
            >
              <Database className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-medium text-foreground truncate flex-1">
                {ds.filename}
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {ds.nRows != null && (
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                    {ds.nRows.toLocaleString()} rows
                  </span>
                )}
                {ds.nCols != null && (
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                    · {ds.nCols} cols
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {documents.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Documents
          </p>
          {documents.map((doc, i) => (
            <div
              key={doc.documentId ?? i}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-card/40 border border-border/30"
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-medium text-foreground truncate flex-1">
                {doc.filename}
              </span>
              {doc.mimeType && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {doc.mimeType}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── list_cells ────────────────────────────────────────────────

interface CellSummary {
  cellId?: string;
  id?: string;
  title?: string;
  cellType?: string;
  status?: string;
  position?: number;
}

interface ListCellsOutput {
  notebookId?: string;
  cells?: CellSummary[];
}

function ListCellsResult({ data }: { data: ListCellsOutput }) {
  const cells = data.cells ?? [];
  if (cells.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Notebook is empty.</p>;
  }

  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground">
        {cells.length} cell{cells.length !== 1 ? 's' : ''}
      </p>
      {cells.map((cell, i) => (
        <div
          key={cell.cellId ?? cell.id ?? i}
          className="flex items-center gap-2 rounded-md px-2 py-1 bg-card/40 border border-border/30"
        >
          <FileCode className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-foreground truncate flex-1">
            {cell.title || `Cell ${(cell.position ?? i) + 1}`}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {cell.cellType && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
                {cell.cellType}
              </Badge>
            )}
            {cell.status && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[9px] px-1 py-0',
                  cell.status === 'success' && 'border-emerald-500/40 text-emerald-600',
                  cell.status === 'error' && 'border-destructive/40 text-destructive',
                  cell.status === 'running' && 'border-amber-500/40 text-amber-600'
                )}
              >
                {cell.status}
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── edit_cell diff ────────────────────────────────────────────

interface EditCellOutput {
  oldContent?: string;
  newContent?: string;
  diff?: {
    linesRemoved?: string[];
    linesAdded?: string[];
  };
}

function EditCellDiff({ call, output }: { call: ToolCall; output: EditCellOutput }) {
  const args = call.args ?? {};
  const startLine = typeof args.startLine === 'number' ? args.startLine : undefined;
  const endLine = typeof args.endLine === 'number' ? args.endLine : startLine;

  const oldContentLines = (output.oldContent ?? '').split('\n');
  const fallbackRemoved =
    startLine != null
      ? oldContentLines.slice(Math.max(0, startLine - 1), Math.max(startLine, endLine ?? startLine))
      : [];
  const fallbackAdded = typeof args.newContent === 'string' ? args.newContent.split('\n') : [];

  const removedLines = (output.diff?.linesRemoved?.length ? output.diff.linesRemoved : fallbackRemoved) ?? [];
  const addedLines = (output.diff?.linesAdded?.length ? output.diff.linesAdded : fallbackAdded) ?? [];

  if (!removedLines.length && !addedLines.length) {
    return <span className="text-muted-foreground italic text-xs">No changes recorded</span>;
  }

  return (
    <div className="font-mono text-[11px] space-y-px">
      {removedLines.map((line, i) => (
        <div key={`old-${i}`} className="text-red-500 bg-red-500/10 px-2 py-0.5 rounded-sm">
          <span className="text-red-400/60 select-none mr-2">-</span>
          {line || ' '}
        </div>
      ))}
      {addedLines.map((line, i) => (
        <div key={`new-${i}`} className="text-green-500 bg-green-500/10 px-2 py-0.5 rounded-sm">
          <span className="text-green-400/60 select-none mr-2">+</span>
          {line || ' '}
        </div>
      ))}
    </div>
  );
}

// ─── read_cell ─────────────────────────────────────────────────

interface ReadCellOutput {
  cellId?: string;
  title?: string;
  content?: string;
  cellType?: string;
  output?: string;
}

function ReadCellResult({ data }: { data: ReadCellOutput }) {
  return (
    <div className="space-y-2">
      {data.title && (
        <p className="text-xs font-medium text-foreground">{data.title}</p>
      )}
      {data.content && (
        <pre className="text-[11px] font-mono text-muted-foreground bg-muted/40 rounded-md p-2 max-h-[120px] overflow-y-auto whitespace-pre-wrap">
          {truncate(data.content, 600)}
        </pre>
      )}
      {data.output && (
        <div className="text-[10px] font-mono text-muted-foreground/80 bg-muted/20 rounded-md p-2 max-h-[80px] overflow-y-auto">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Output</p>
          <pre className="whitespace-pre-wrap">{truncate(String(data.output), 400)}</pre>
        </div>
      )}
    </div>
  );
}

function PreprocessingActionResult({ call, output }: { call: ToolCall; output: unknown }) {
  const out = asRecord(output);
  const step = asRecord(out.step);
  const source = Object.keys(step).length > 0 ? step : out;
  const validation = asRecord(source.validation);

  const title = asString(source.title)
    ?? asString(call.args?.title)
    ?? asString(source.intentType)
    ?? asString(call.args?.intentType)
    ?? 'transformation step';
  const stepId = asString(source.stepId) ?? asString(call.args?.stepId);
  const status = asString(source.status) ?? asString(out.status);
  const rationale = asString(source.rationale) ?? asString(call.args?.rationale);
  const requiresApproval = asBoolean(source.requiresApproval) ?? asBoolean(call.args?.requiresApproval);
  const rowBefore = asNumber(validation.rowCountBefore);
  const rowAfter = asNumber(validation.rowCountAfter);
  const schemaDrift = asBoolean(validation.schemaDrift);
  const validationNotes = asString(validation.notes);
  const succeeded = asBoolean(out.succeeded) ?? asBoolean(source.lastExecuteSucceeded);
  const checkpointId = asString(out.checkpointId);
  const compatible = asBoolean(out.compatible);

  if (call.tool === 'checkpoint_dataset') {
    return (
      <div className="space-y-1.5 text-xs text-muted-foreground">
        <p className="text-foreground font-medium">Checkpoint created for current dataset lineage.</p>
        {checkpointId ? <p>Checkpoint ID: <span className="font-mono">{checkpointId}</span></p> : null}
        {compatible != null ? (
          <p>Replay compatibility: <span className={cn(compatible ? 'text-emerald-600' : 'text-amber-600')}>{compatible ? 'passed' : 'needs review'}</span></p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1.5 text-xs text-muted-foreground">
      <p className="text-foreground font-medium">{title}</p>
      {stepId ? <p>Step ID: <span className="font-mono">{stepId}</span></p> : null}
      {status ? <p>Status: <span className="capitalize">{status.replaceAll('_', ' ')}</span></p> : null}
      {rationale ? <p>Reasoning: {rationale}</p> : null}
      {succeeded != null && call.tool === 'execute_transformation_step' ? (
        <p>Execution result: <span className={cn(succeeded ? 'text-emerald-600' : 'text-destructive')}>{succeeded ? 'success' : 'failed'}</span></p>
      ) : null}
      {rowBefore != null && rowAfter != null ? (
        <p>
          Rows checked: {rowBefore.toLocaleString()}
          {' -> '}
          {rowAfter.toLocaleString()}
        </p>
      ) : null}
      {schemaDrift != null ? <p>Schema drift: {schemaDrift ? 'detected' : 'not detected'}</p> : null}
      {validationNotes ? <p>Validation notes: {validationNotes}</p> : null}
      {requiresApproval != null ? <p>Approval required: {requiresApproval ? 'yes' : 'no'}</p> : null}
      {call.tool === 'materialize_step_code' ? (
        <p>Executable notebook code was prepared for this step.</p>
      ) : null}
      {call.tool === 'commit_transformation_step' ? (
        <p>Step committed to preprocessing lineage and replay graph.</p>
      ) : null}
    </div>
  );
}

// ─── Generic JSON fallback ─────────────────────────────────────

function GenericJsonResult({ output }: { output: unknown }) {
  let text: string;
  if (typeof output === 'string') {
    text = output;
  } else {
    try {
      text = JSON.stringify(output, null, 2);
    } catch {
      text = String(output);
    }
  }

  if (text.length > 1500) {
    text = `${text.slice(0, 1500)}…`;
  }

  return (
    <pre className="text-[10px] font-mono whitespace-pre-wrap text-muted-foreground">
      {text}
    </pre>
  );
}

// ─── Main dispatcher ───────────────────────────────────────────

/** Tools whose output is already visible in the notebook — skip rendering cards */
const NOTEBOOK_VISIBLE_TOOLS = new Set([
  'write_cell',
  'run_cell',
  'insert_cell',
  'delete_cell',
  'reorder_cells',
  'install_package',
  'uninstall_package'
]);

/** Tools that have a meaningful expanded view */
// eslint-disable-next-line react-refresh/only-export-components
export const EXPANDABLE_TOOLS = new Set([
  'search_documents',
  'get_dataset_profile',
  'get_dataset_sample',
  'list_project_files',
  'list_project_datasets',
  'propose_transformation_step',
  'materialize_step_code',
  'execute_transformation_step',
  'validate_step_result',
  'commit_transformation_step',
  'checkpoint_dataset',
  'list_cells',
  'read_cell',
  'edit_cell',
  'list_packages'
]);

interface ToolResultRendererProps {
  call: ToolCall;
  result: ToolResult;
}

export function ToolResultRenderer({ call, result }: ToolResultRendererProps) {
  const output = result.output;
  if (output == null) return null;

  // Don't render cards for tools whose output is visible in-notebook
  if (NOTEBOOK_VISIBLE_TOOLS.has(call.tool)) return null;

  const tool = call.tool;

  // search_documents: array of SearchHit
  if (tool === 'search_documents') {
    // The output can be the array directly, or wrapped in { items: [...] }
    const items: SearchHit[] = Array.isArray(output)
      ? (output as SearchHit[])
      : Array.isArray((output as { items?: unknown }).items)
        ? ((output as { items: SearchHit[] }).items)
        : [];
    return <SearchDocumentsResult items={items} />;
  }

  // get_dataset_profile: full profile object
  if (tool === 'get_dataset_profile') {
    return <DatasetProfileResult data={output as DatasetProfileOutput} />;
  }

  // get_dataset_sample
  if (tool === 'get_dataset_sample') {
    return <DatasetSampleResult data={output as DatasetSampleOutput} />;
  }

  // list_project_files
  if (tool === 'list_project_files') {
    return <ProjectFilesResult data={output as ProjectFilesOutput} />;
  }

  // list_project_datasets
  if (tool === 'list_project_datasets') {
    return <ProjectFilesResult data={{ datasets: (output as { datasets?: ProjectFile[] }).datasets ?? [] }} />;
  }

  // preprocessing orchestration actions (human-readable summaries)
  if (tool === 'propose_transformation_step'
    || tool === 'materialize_step_code'
    || tool === 'execute_transformation_step'
    || tool === 'validate_step_result'
    || tool === 'commit_transformation_step'
    || tool === 'checkpoint_dataset'
  ) {
    return <PreprocessingActionResult call={call} output={output} />;
  }

  // list_cells
  if (tool === 'list_cells') {
    return <ListCellsResult data={output as ListCellsOutput} />;
  }

  // edit_cell diff
  if (tool === 'edit_cell') {
    return <EditCellDiff call={call} output={output as EditCellOutput} />;
  }

  // read_cell
  if (tool === 'read_cell') {
    return <ReadCellResult data={output as ReadCellOutput} />;
  }

  // list_packages
  if (tool === 'list_packages') {
    const pkgs = (output as { packages?: string[] }).packages;
    if (Array.isArray(pkgs) && pkgs.length > 0) {
      return (
        <div className="flex flex-wrap gap-1">
          {pkgs.slice(0, 30).map((pkg, i) => (
            <Badge key={i} variant="outline" className="text-[10px] font-mono px-1.5 py-0">
              {pkg}
            </Badge>
          ))}
          {pkgs.length > 30 && (
            <span className="text-[10px] text-muted-foreground">+{pkgs.length - 30} more</span>
          )}
        </div>
      );
    }
    return <p className="text-xs text-muted-foreground italic">No packages installed.</p>;
  }

  // Fallback: formatted JSON
  return <GenericJsonResult output={output} />;
}
