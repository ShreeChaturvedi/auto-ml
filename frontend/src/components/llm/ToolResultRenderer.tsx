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

import type { ToolCall, ToolResult } from '@/types/llmUi';
import {
  SearchDocumentsResult,
  DatasetProfileResult,
  DatasetSampleResult,
  ProjectFilesResult,
  ListCellsResult,
  EditCellDiff,
  ReadCellResult,
  PreprocessingActionResult,
  ListPackagesResult,
  GenericJsonResult,
} from './toolRenderers/index';
import type {
  SearchHit,
  DatasetProfileOutput,
  DatasetSampleOutput,
  ProjectFilesOutput,
  ProjectFile,
  ListCellsOutput,
  EditCellOutput,
  ReadCellOutput,
} from './toolRenderers/index';

// ─── Tool visibility sets ───────────────────────────────────────

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
  'list_packages',
  // Feature engineering lifecycle tools
  'propose_feature',
  'materialize_feature_code',
  'execute_feature',
  'validate_feature',
  'register_feature',
  'checkpoint_feature_pipeline'
]);

// ─── Main dispatcher ────────────────────────────────────────────

interface ToolResultRendererProps {
  call: ToolCall;
  result: ToolResult;
  projectColorEntry?: { fill?: string; text?: string; border?: string };
}

export function ToolResultRenderer({ call, result, projectColorEntry }: ToolResultRendererProps) {
  const output = result.output;
  if (output == null) return null;

  // Don't render cards for tools whose output is visible in-notebook
  if (NOTEBOOK_VISIBLE_TOOLS.has(call.tool)) return null;

  const tool = call.tool;

  if (tool === 'search_documents') {
    const items: SearchHit[] = Array.isArray(output)
      ? (output as SearchHit[])
      : Array.isArray((output as { items?: unknown }).items)
        ? ((output as { items: SearchHit[] }).items)
        : [];
    return <SearchDocumentsResult items={items} projectFill={projectColorEntry?.fill} projectText={projectColorEntry?.text} projectBorder={projectColorEntry?.border} />;
  }

  if (tool === 'get_dataset_profile') {
    return <DatasetProfileResult data={output as DatasetProfileOutput} />;
  }

  if (tool === 'get_dataset_sample') {
    return <DatasetSampleResult data={output as DatasetSampleOutput} />;
  }

  if (tool === 'list_project_files') {
    return <ProjectFilesResult data={output as ProjectFilesOutput} />;
  }

  if (tool === 'list_project_datasets') {
    return <ProjectFilesResult data={{ datasets: (output as { datasets?: ProjectFile[] }).datasets ?? [] }} />;
  }

  if (
    tool === 'propose_transformation_step'
    || tool === 'materialize_step_code'
    || tool === 'execute_transformation_step'
    || tool === 'validate_step_result'
    || tool === 'commit_transformation_step'
    || tool === 'checkpoint_dataset'
  ) {
    return <PreprocessingActionResult call={call} output={output} />;
  }

  if (tool === 'list_cells') {
    return <ListCellsResult data={output as ListCellsOutput} />;
  }

  if (tool === 'edit_cell') {
    return <EditCellDiff call={call} output={output as EditCellOutput} />;
  }

  if (tool === 'read_cell') {
    return <ReadCellResult data={output as ReadCellOutput} />;
  }

  if (tool === 'list_packages') {
    return <ListPackagesResult output={output} />;
  }

  return <GenericJsonResult output={output} />;
}
